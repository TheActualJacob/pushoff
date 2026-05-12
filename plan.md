# Pushup Competition — Implementation Plan

A peer-to-peer multiplayer pushup competition. Each player's browser does pose detection locally; players exchange only rep counts and tiny status updates over a WebRTC DataChannel. No video, no inference, and no game state ever lives on a server.

---

## 1. Design goals

- **Zero server-side computation.** No image/video data ever leaves the player's device. The server's only job is to relay a few hundred bytes during WebRTC handshake.
- **Single language.** Node.js + JavaScript end-to-end (Next.js 16, App Router).
- **Simplest viable stack.** Pick boring tech; avoid frameworks that need their own runtime.
- **Free hosting tier.** Vercel for the Next.js app; Cloudflare Realtime free tier for TURN; Google STUN.
- **Fast iteration loop.** No build step for game logic; everything is hot-reloaded React.

---

## 2. Architecture overview

```
┌─────────────────────────┐         ┌─────────────────────────┐
│  Player A (browser)     │         │  Player B (browser)     │
│  ─────────────────────  │         │  ─────────────────────  │
│  • Webcam → MoveNet     │         │  • Webcam → MoveNet     │
│  • Local rep counter    │         │  • Local rep counter    │
│  • UI (Next.js + shad)  │         │  • UI (Next.js + shad)  │
└────────────┬────────────┘         └────────────┬────────────┘
             │  RTCDataChannel (direct P2P, encrypted)        │
             └────────────────  rep counts  ──────────────────┘
                                    ▲
             ┌──────────────────────┼──────────────────────┐
             │                      │                      │
   ┌─────────┴────────┐   ┌─────────┴────────┐   ┌─────────┴──────────┐
   │ Next.js API      │   │ STUN             │   │ TURN (fallback)    │
   │ route (signaling)│   │ stun.l.google... │   │ Cloudflare Realtime│
   │ Vercel KV store  │   │ (free)           │   │ (free 1000 GB/mo)  │
   └──────────────────┘   └──────────────────┘   └────────────────────┘
   • Holds SDP offers/   • Browsers discover    • Encrypted relay only
     answers + ICE         their public IP        when direct P2P fails
     candidates briefly    via this              • Never decrypts
   • Drops payloads once
     both peers connected
```

Once peer-to-peer connection is established, the signaling layer is unused. The TURN relay is only engaged when symmetric NAT prevents a direct path; even then the relay sees only encrypted DTLS bytes.

**Server cost ceiling:** a single Vercel project with two API routes and a Vercel KV (or Upstash Redis) instance well within free tier.

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 16 (App Router)** | One repo for frontend + tiny signaling API; deploys free on Vercel |
| Language | **JavaScript** (or TypeScript if trivial) | No Python anywhere |
| UI components | **shadcn/ui** via CLI v4 | Composable, copy-paste components; no runtime dep |
| Styling | **Tailwind CSS v4** | Comes with shadcn init |
| Pose detection | **@tensorflow-models/pose-detection** (MoveNet MultiPose Lightning) | Best speed/accuracy; built-in tracking |
| TF.js backend | **@tensorflow/tfjs-backend-webgl** (+ wasm fallback) | GPU acceleration in-browser |
| Signaling | **Next.js API route + Vercel KV** (polling, 1s interval) | No persistent socket; works perfectly on Vercel serverless |
| Peer transport | **Native `RTCPeerConnection` + `RTCDataChannel`** | No 3rd-party WebRTC SDK |
| NAT traversal | **Google STUN** (free) + **Cloudflare Realtime TURN** (free 1 TB/mo) | Reliable connections everywhere |
| State (client) | **Zustand** (tiny) | Avoids prop drilling for game state |
| Charts/leaderboard | shadcn `<Progress>` + custom components | Nothing exotic |

---

## 4. Repository layout

```
pushupapp/
├── app/
│   ├── layout.jsx               # Root layout, fonts, global CSS
│   ├── page.jsx                 # Landing / "Create or join a room"
│   ├── room/[code]/page.jsx     # The actual game screen
│   └── api/
│       └── signal/
│           └── route.js         # POST/GET signaling messages
├── components/
│   ├── ui/                      # shadcn-generated components (button, card, ...)
│   ├── camera-view.jsx          # <video> + canvas overlay
│   ├── pose-overlay.jsx         # Draws keypoints/skeleton on canvas
│   ├── rep-counter.jsx          # Big rep number + state machine viz
│   ├── leaderboard.jsx          # Other peers' rep counts
│   ├── ready-check.jsx          # Pre-game "I'm ready" gating
│   └── countdown.jsx            # 3-2-1-GO
├── lib/
│   ├── pose/
│   │   ├── detector.js          # Lazy-loads TFJS, creates MoveNet detector
│   │   ├── pushup-counter.js    # Pure function: keypoints → rep state machine
│   │   └── angles.js            # Geometry helpers (vector angles)
│   ├── webrtc/
│   │   ├── peer.js              # RTCPeerConnection wrapper
│   │   ├── signaling.js         # Client side of the polling signaling
│   │   └── ice-config.js        # STUN/TURN config (reads env)
│   ├── game/
│   │   ├── store.js             # Zustand store (players, scores, phase)
│   │   └── phases.js            # 'lobby' | 'ready' | 'countdown' | 'live' | 'done'
│   └── utils.js                 # cn() etc. (shadcn default)
├── public/
│   └── (favicon, sounds, etc.)
├── .env.local                   # CF_TURN_TOKEN, CF_TURN_API, KV creds
├── tailwind.config.ts
├── components.json              # shadcn config
├── next.config.js
└── package.json
```

---

## 5. Detailed module design

### 5.1 Pose detection (`lib/pose/detector.js`)

```js
// All TFJS imports are dynamic — keeps SSR happy.
let detector;
export async function getDetector() {
  if (detector) return detector;
  const tf = await import('@tensorflow/tfjs-core');
  await import('@tensorflow/tfjs-backend-webgl');
  await tf.setBackend('webgl');
  await tf.ready();
  const pd = await import('@tensorflow-models/pose-detection');
  detector = await pd.createDetector(pd.SupportedModels.MoveNet, {
    modelType: pd.movenet.modelType.MULTIPOSE_LIGHTNING,
    enableTracking: true,
    trackerType: pd.TrackerType.BoundingBox,
  });
  return detector;
}
```

Component using it must be `dynamic(..., { ssr: false })`. Runs in a `requestAnimationFrame` loop tied to the `<video>` element's readiness.

### 5.2 Pushup state machine (`lib/pose/pushup-counter.js`)

Pure function, no React. Easy to unit-test.

```
state ∈ { UP, DOWN }
elbow_angle = angle(shoulder, elbow, wrist)   // both sides; use the higher-confidence one

UP_THRESHOLD   = 155°        // arms ~ extended
DOWN_THRESHOLD = 95°         // bent past 90°
MIN_CONFIDENCE = 0.4         // keypoint score floor
COOLDOWN_MS    = 400         // anti-double-count

transitions:
  UP   + angle < DOWN_THRESHOLD  → DOWN
  DOWN + angle > UP_THRESHOLD    → UP, count++ (if ms since last rep > COOLDOWN_MS)
```

Optional plausibility gate (toggle in settings, default ON): body must be roughly horizontal — i.e. `angle(shoulder, hip, ankle)` between 150° and 200°. Stops cheating by counting bicep curls.

### 5.3 WebRTC peer (`lib/webrtc/peer.js`)

Minimal wrapper that exposes:

```js
createPeer({ roomCode, isInitiator, onMessage, onPeerJoin, onPeerLeave })
  → { send(json), close() }
```

Uses **perfect negotiation pattern** (MDN) so initiator/responder asymmetry is handled cleanly. Each peer creates:

- 1 `RTCPeerConnection` per opponent
- 1 `RTCDataChannel` per opponent, labeled `"game"`, with `{ ordered: true }`

Messages on the channel are tiny JSON envelopes:

```js
{ type: 'rep',   count: 42, t: 17234... }   // rep tick
{ type: 'ready', ready: true }              // ready check
{ type: 'hello', name: 'Jacob' }            // first message on connect
{ type: 'done',  final: 87 }                // end of round
```

### 5.4 Signaling (`app/api/signal/route.js`)

Two operations, both on a single POST endpoint with a `op` field. Backed by Vercel KV (or Upstash Redis — both free tier). Each room has a TTL of 30 min.

| op | Description |
|---|---|
| `join` | Adds `{peerId, joinedAt}` to `room:{code}:peers`. Returns the list. |
| `post` | Append message to `room:{code}:mailbox:{toPeerId}`. |
| `poll` | Atomic LRANGE + DEL of that peer's mailbox. Returns pending messages. |

Clients poll every **1 second** while in lobby; **stop polling entirely** once all peers are connected. This handshake usually finishes in 2–5 seconds, so KV operations per match are <30.

### 5.5 ICE config (`lib/webrtc/ice-config.js`)

```js
export async function getIceServers() {
  const r = await fetch('/api/turn-credentials');  // server-side mints short-lived creds
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    ...(await r.json()).iceServers,
  ];
}
```

The `/api/turn-credentials` route calls Cloudflare Realtime's `generate-credentials` endpoint with `CF_TURN_TOKEN_ID` + `CF_TURN_API_TOKEN` (server-side env vars) and returns the 48-hour credentials to the browser. Long-term secret never leaves the server.

### 5.6 Game store (`lib/game/store.js`)

Zustand store, single source of truth on the client:

```js
{
  phase: 'lobby' | 'ready' | 'countdown' | 'live' | 'done',
  selfId, selfName,
  myReps: 0,
  peers: { [peerId]: { name, reps, ready, connected } },
  startTime: null,
  duration: 60_000,   // configurable per room
}
```

Pose loop calls `incrementRep()` locally, then broadcasts `{type:'rep'}` to peers; on receiving rep messages, updates the corresponding peer entry. Each side computes its own elapsed time from `startTime`.

---

## 6. UI / UX flow

All screens built with shadcn primitives: `Card`, `Button`, `Input`, `Progress`, `Badge`, `Dialog`, `Avatar`, `Skeleton`. (Consult the `frontend-design` skill before building each screen for layout/polish guidance.)

1. **Landing (`/`)**
   - Hero: name field, two big buttons: **Create Room** / **Join Room**.
   - Join needs a 6-char code (e.g. `BICEP7`).
   - On create: client generates code, navigates to `/room/[code]`.

2. **Room — Lobby phase**
   - Top bar: room code + "Copy link" button.
   - Player list with ready toggles.
   - "Allow camera" prompt → camera permission flow.
   - Camera preview with live skeleton overlay (sanity check the detector is working).
   - Settings panel: round duration (30s/60s/120s), body-alignment gate on/off.

3. **Ready check → Countdown**
   - When everyone toggles ready, a synced 3-2-1-GO overlay plays. The countdown is driven by the room creator's clock, broadcast as `{type:'start', startAt: epochMs}` over data channel, and each peer waits locally for that timestamp.

4. **Live**
   - Big rep counter for self (left), live leaderboard for opponents (right).
   - Timer bar.
   - Subtle skeleton overlay so the user can confirm tracking; option to mute it.
   - "Down / Up" indicator showing current pose-state so reps feel responsive.

5. **Done**
   - Confetti / podium screen ranked by reps.
   - "Rematch" button → resets `myReps`, broadcasts `{type:'reset'}`, returns to ready phase.

---

## 7. Implementation phases

Each phase ends with a thing you can click on and use.

**Phase 0 — Project scaffold** (~30 min)
- `pnpm dlx shadcn@latest init` → choose Next.js template, App Router, Tailwind v4
- `pnpm dlx shadcn@latest add button card input dialog progress badge avatar`
- Add `zustand`, `@tensorflow/tfjs-core`, `@tensorflow/tfjs-backend-webgl`, `@tensorflow/tfjs-backend-wasm`, `@tensorflow-models/pose-detection`
- Verify Vercel deploy of empty app

**Phase 1 — Local pose detection** (~half a day)
- Build `CameraView` + `PoseOverlay`
- Wire up MoveNet via dynamic import
- Show keypoints on canvas, FPS counter in corner

**Phase 2 — Rep counter (offline)** (~half a day)
- Implement `pushup-counter.js` with state machine
- Unit-test it with a saved set of recorded keypoint sequences (record JSON from a real attempt)
- Tune thresholds with the live demo

**Phase 3 — Signaling + 2-peer WebRTC** (~1 day)
- API route + KV
- Perfect-negotiation peer wrapper
- "Hello world" data-channel chat between two browser tabs

**Phase 4 — Game loop end-to-end** (~1 day)
- Zustand store, room phases, ready check, synced countdown
- Broadcast reps; show opponent leaderboard
- Done screen with ranking

**Phase 5 — Multi-peer (3+ players)** (~half a day)
- Mesh of `RTCPeerConnection`s — every peer connects to every other
- Update store to map over `peers`

**Phase 6 — Polish** (variable)
- Use the `polish`, `animate`, and `delight` skills on the live screen
- Body-alignment plausibility gate
- Mobile layout (use `adapt` skill)
- Sound effects on rep, countdown beeps, victory chime
- Persistence: stash personal best in `localStorage`

**Phase 7 — TURN + production hardening**
- Add Cloudflare TURN credential route, set env vars on Vercel
- Test on a phone + a laptop on different networks
- Add the `harden` skill for error states (camera denied, peer drop, NAT failure)

---

## 8. Decisions to make before coding

- **TS or JS?** Default JS for speed; the only nontrivial type surface is the data-channel message envelope. Either is fine.
- **Signaling backend: Vercel KV vs Upstash Redis vs Firestore?** Vercel KV is the most integrated; Upstash is fine if you'd rather not depend on Vercel; Firestore is overkill but more familiar to some. Pick one and don't think about it again.
- **Should the camera need to be in landscape?** Strongly recommended for pushup framing. Add a tilt-to-landscape hint on mobile.
- **Anti-cheat strength.** Body-alignment gate prevents obvious cheating (curls, half-reps). Don't go further — this is a friendly competition, not a contest.
- **Names.** No accounts. Player picks a name at landing; it's stored only in the data-channel `hello` message and `localStorage`.

---

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| WebGL unavailable on player's device | Auto-fallback to `tfjs-backend-wasm` (slower but works) |
| Browser tab loses focus → `requestAnimationFrame` throttles to 1 Hz | Pause game and show "Tab inactive" overlay until focused again |
| Peer drops mid-round | Mark them as `disconnected`, keep their last rep count visible; round continues |
| Mobile Safari camera quirks | Test early; require `playsinline`, `muted`, and a user-gesture-triggered `.play()` |
| Rep mis-counts under bad lighting | Show keypoint confidence in dev mode; gate counting on min score |
| Different cameras run pose loop at different FPS | Rep counting is event-driven (state transition), not frame-count-based — already FPS-independent |
| KV free tier rate limits | Polling stops after handshake; <30 ops/match is well within limits |

---

## 10. Environment variables

```
CF_TURN_TOKEN_ID=...        # Cloudflare Realtime TURN key id
CF_TURN_API_TOKEN=...       # Cloudflare API token (TURN:Edit)
KV_REST_API_URL=...         # Vercel KV
KV_REST_API_TOKEN=...
```

All secrets are server-only (no `NEXT_PUBLIC_` prefix). TURN credentials are minted server-side and handed to the client just-in-time, scoped to a few hours.

---

## 11. References

- MoveNet README — github.com/tensorflow/tfjs-models/blob/master/pose-detection/src/movenet/README.md
- `@tensorflow-models/pose-detection` — npmjs.com/package/@tensorflow-models/pose-detection
- TF.js backends — tensorflow.org/js/guide/platform_environment
- MDN `RTCDataChannel` — developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel
- MDN Using data channels — developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels
- MDN Perfect negotiation — developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
- shadcn CLI v4 (Next.js template) — ui.shadcn.com/docs/installation/next
- Cloudflare Realtime TURN — developers.cloudflare.com/realtime/turn/
- Vercel KV — vercel.com/docs/storage/vercel-kv

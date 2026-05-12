# PUSH — Peer-to-peer pushup competition

Real-time multiplayer pushup counter. Each player's browser runs MoveNet pose detection locally; only rep counts travel over a WebRTC DataChannel. No video, no inference, and no game state ever touches a server.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | shadcn/ui + Tailwind CSS v4 |
| Pose detection | MoveNet SinglePose Thunder via `@tensorflow-models/pose-detection` |
| Peer transport | Native `RTCPeerConnection` + `RTCDataChannel` |
| Signaling | Next.js API route + Vercel KV (polling) |

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Allow camera access on the room page to start detecting reps.

## Environment variables

Copy `.env.local.example` to `.env.local` and fill in your credentials:

```
CF_TURN_TOKEN_ID=...     # Cloudflare Realtime TURN key id
CF_TURN_API_TOKEN=...    # Cloudflare API token (TURN:Edit)
KV_REST_API_URL=...      # Vercel KV
KV_REST_API_TOKEN=...
```

TURN and KV are only needed once Phase 3 (signaling + WebRTC) is implemented. The pose detection and local rep counter work without any env vars.

## Architecture

Pose detection runs entirely in the browser via WebGL (WASM fallback). Keypoints never leave the device. Rep counts are broadcast as small JSON messages over an encrypted `RTCDataChannel`.

See [`plan.md`](./plan.md) for the full implementation plan.

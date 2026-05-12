/**
 * RTCPeerConnection wrapper using the Perfect Negotiation pattern.
 * https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
 *
 * createPeer({ selfId, peerId, polite, signaling, onMessage, onConnect, onDisconnect, iceServers })
 *   → { send(json), close() }
 *
 * - polite: true for the room creator.  The polite peer rolls back on collision.
 * - signaling: the createSignaling() instance (we call signaling.send internally).
 * - onMessage(json): called for each game-layer DataChannel message.
 * - onConnect(): called when the data channel opens.
 * - onDisconnect(): called when the peer disconnects.
 */

function dbg(msg) {
  console.log('[peer]', msg);
  if (typeof window !== 'undefined') {
    window.__pushLog = window.__pushLog ?? [];
    window.__pushLog.push(`${new Date().toISOString().slice(11,23)} ${msg}`);
    if (window.__pushLog.length > 40) window.__pushLog.shift();
    window.dispatchEvent(new Event('pushlog'));
  }
}

export function createPeer({ selfId, peerId, polite, signaling, onMessage, onConnect, onDisconnect, iceServers }) {
  const short = peerId.slice(0, 6);
  dbg(`createPeer ${short} polite=${polite} ice=${iceServers.length} servers`);
  const pc = new RTCPeerConnection({ iceServers });

  let makingOffer = false;
  let ignoreOffer = false;
  let dc = null;

  // ── DataChannel ───────────────────────────────────────────────────────────

  function attachChannel(channel) {
    dc = channel;
    dbg(`attachChannel ${short} readyState=${channel.readyState}`);
    dc.onopen = () => {
      dbg(`DataChannel OPEN with ${short}`);
      onConnect?.();
    };
    dc.onclose = () => {
      dbg(`DataChannel CLOSED with ${short}`);
      onDisconnect?.();
    };
    dc.onmessage = (evt) => {
      try { onMessage?.(JSON.parse(evt.data)); } catch { /* ignore malformed */ }
    };
  }

  // Initiator (impolite) creates the channel; responder (polite) receives it.
  if (!polite) {
    dbg(`createDataChannel → ${short} (impolite)`);
    attachChannel(pc.createDataChannel('game', { ordered: true }));
  } else {
    dbg(`waiting ondatachannel from ${short} (polite)`);
    pc.ondatachannel = (evt) => { dbg(`ondatachannel from ${short}`); attachChannel(evt.channel); };
  }

  // ── Perfect negotiation ───────────────────────────────────────────────────

  pc.onnegotiationneeded = async () => {
    dbg(`onnegotiationneeded → ${short}`);
    try {
      makingOffer = true;
      await pc.setLocalDescription();
      dbg(`sending offer → ${short}`);
      await signaling.send(peerId, { description: pc.localDescription });
    } catch (err) {
      dbg(`onnegotiationneeded ERROR: ${err.message}`);
    } finally {
      makingOffer = false;
    }
  };

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      dbg(`ICE candidate → ${short} (${candidate.type ?? 'unknown'})`);
      signaling.send(peerId, { candidate });
    } else {
      dbg(`ICE gathering complete → ${short}`);
    }
  };

  pc.oniceconnectionstatechange = () => dbg(`ICE ${short} → ${pc.iceConnectionState}`);

  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    dbg(`connectionState ${short} → ${s}`);
    if (s === 'failed' || s === 'closed') {
      onDisconnect?.();
    }
  };

  // ── Incoming signaling messages ───────────────────────────────────────────

  async function handleSignal({ description, candidate }) {
    try {
      if (description) {
        dbg(`handleSignal ${description.type} from ${short} sigState=${pc.signalingState}`);
        const offerCollision =
          description.type === 'offer' &&
          (makingOffer || pc.signalingState !== 'stable');

        ignoreOffer = !polite && offerCollision;
        if (ignoreOffer) { dbg(`ignoring offer from ${short} (collision)`); return; }

        await pc.setRemoteDescription(description);

        if (description.type === 'offer') {
          await pc.setLocalDescription();
          dbg(`sending answer → ${short}`);
          await signaling.send(peerId, { description: pc.localDescription });
        }
      }

      if (candidate) {
        dbg(`addIceCandidate from ${short}`);
        try {
          await pc.addIceCandidate(candidate);
        } catch (err) {
          if (!ignoreOffer) throw err;
        }
      }
    } catch (err) {
      dbg(`handleSignal ERROR from ${short}: ${err.message}`);
    }
  }

  function send(json) {
    if (dc?.readyState === 'open') {
      dc.send(JSON.stringify(json));
    }
  }

  function close() {
    dc?.close();
    pc.close();
  }

  return { handleSignal, send, close, get connectionState() { return pc.connectionState; } };
}

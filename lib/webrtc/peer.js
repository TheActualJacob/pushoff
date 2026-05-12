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

export function createPeer({ selfId, peerId, polite, signaling, onMessage, onConnect, onDisconnect, iceServers }) {
  const pc = new RTCPeerConnection({ iceServers });

  let makingOffer = false;
  let ignoreOffer = false;
  let dc = null;

  // ── DataChannel ───────────────────────────────────────────────────────────

  function attachChannel(channel) {
    dc = channel;
    dc.onopen = () => {
      console.log(`[peer] DataChannel open with ${peerId}`);
      onConnect?.();
    };
    dc.onclose = () => {
      console.log(`[peer] DataChannel closed with ${peerId}`);
      onDisconnect?.();
    };
    dc.onmessage = (evt) => {
      try { onMessage?.(JSON.parse(evt.data)); } catch { /* ignore malformed */ }
    };
  }

  // Initiator (impolite) creates the channel; responder (polite) receives it.
  if (!polite) {
    attachChannel(pc.createDataChannel('game', { ordered: true }));
  } else {
    pc.ondatachannel = (evt) => attachChannel(evt.channel);
  }

  // ── Perfect negotiation ───────────────────────────────────────────────────

  pc.onnegotiationneeded = async () => {
    try {
      makingOffer = true;
      await pc.setLocalDescription();
      await signaling.send(peerId, { description: pc.localDescription });
    } catch (err) {
      console.error('[peer] onnegotiationneeded error:', err);
    } finally {
      makingOffer = false;
    }
  };

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) signaling.send(peerId, { candidate });
  };

  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    console.log(`[peer] connectionState → ${s}`);
    // 'disconnected' is transient — the browser attempts ICE restart and often
    // recovers. Only 'failed' and 'closed' are permanent.
    if (s === 'failed' || s === 'closed') {
      onDisconnect?.();
    }
  };

  // ── Incoming signaling messages ───────────────────────────────────────────

  async function handleSignal({ description, candidate }) {
    try {
      if (description) {
        const offerCollision =
          description.type === 'offer' &&
          (makingOffer || pc.signalingState !== 'stable');

        ignoreOffer = !polite && offerCollision;
        if (ignoreOffer) return;

        await pc.setRemoteDescription(description);

        if (description.type === 'offer') {
          await pc.setLocalDescription();
          await signaling.send(peerId, { description: pc.localDescription });
        }
      }

      if (candidate) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (err) {
          if (!ignoreOffer) throw err;
        }
      }
    } catch (err) {
      console.error('[peer] handleSignal error:', err);
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

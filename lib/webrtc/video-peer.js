/**
 * STUN-only video RTCPeerConnection per opponent.
 *
 * Deliberately uses no TURN — video is either P2P or it doesn't flow at all.
 * If the connection can't be established within VIDEO_TIMEOUT_MS the caller
 * receives `onBlocked()` and should show a "network is blocking video" message.
 * The game DataChannel (with TURN) continues unaffected on the other peer connection.
 *
 * createVideoPeer({ polite, onSignal, onStream, onBlocked })
 *   → { handleSignal(msg), addTrack(track, stream), close() }
 *
 * Signal messages exchanged via the game DataChannel:
 *   { type: 'vpeer', desc: RTCSessionDescriptionInit }
 *   { type: 'vpeer', cand: RTCIceCandidateInit }
 */

const STUN_ONLY = [{ urls: 'stun:stun.l.google.com:19302' }];
const VIDEO_TIMEOUT_MS = 8000;

export function createVideoPeer({ polite, onSignal, onStream, onBlocked }) {
  const pc = new RTCPeerConnection({ iceServers: STUN_ONLY });

  let settled = false;     // true once active or blocked — prevents double-fire
  let makingOffer = false;
  let ignoreOffer = false;
  let trackAdded = false;  // guard against calling addTrack twice

  // If no remote stream arrives in time, give up gracefully.
  const timeoutId = setTimeout(() => {
    if (!settled) {
      settled = true;
      onBlocked?.();
    }
  }, VIDEO_TIMEOUT_MS);

  function markBlocked() {
    if (settled) return;
    settled = true;
    clearTimeout(timeoutId);
    onBlocked?.();
  }

  pc.ontrack = ({ streams }) => {
    if (settled) return;
    const stream = streams?.[0];
    if (stream) {
      settled = true;
      clearTimeout(timeoutId);
      onStream?.(stream);
    }
  };

  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    if (s === 'connected') clearTimeout(timeoutId);
    if (s === 'failed' || s === 'disconnected' || s === 'closed') markBlocked();
  };

  // Only send non-relay ICE candidates — keeps video P2P (no TURN bandwidth).
  pc.onicecandidate = ({ candidate }) => {
    if (candidate && candidate.type !== 'relay') {
      onSignal({ cand: candidate.toJSON() });
    }
  };

  // Perfect Negotiation pattern (same as game peer).
  pc.onnegotiationneeded = async () => {
    try {
      makingOffer = true;
      await pc.setLocalDescription();
      onSignal({ desc: pc.localDescription.toJSON() });
    } catch (err) {
      console.error('[video-peer] negotiation error:', err);
    } finally {
      makingOffer = false;
    }
  };

  async function handleSignal({ desc, cand }) {
    try {
      if (desc) {
        const collision =
          desc.type === 'offer' && (makingOffer || pc.signalingState !== 'stable');
        ignoreOffer = !polite && collision;
        if (ignoreOffer) return;

        await pc.setRemoteDescription(new RTCSessionDescription(desc));
        if (desc.type === 'offer') {
          await pc.setLocalDescription();
          onSignal({ desc: pc.localDescription.toJSON() });
        }
      }
      if (cand) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          if (!ignoreOffer) console.error('[video-peer] addIceCandidate error:', e);
        }
      }
    } catch (err) {
      console.error('[video-peer] handleSignal error:', err);
    }
  }

  function addTrack(track, stream) {
    if (trackAdded) return;
    trackAdded = true;
    try {
      pc.addTrack(track, stream);
    } catch (err) {
      console.error('[video-peer] addTrack error:', err);
    }
  }

  function close() {
    clearTimeout(timeoutId);
    try { if (pc.signalingState !== 'closed') pc.close(); } catch { /* ignore */ }
  }

  return { handleSignal, addTrack, close };
}

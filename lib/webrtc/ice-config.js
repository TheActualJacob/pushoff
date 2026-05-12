/**
 * Returns RTCConfiguration with STUN (always) + TURN (when credentials available).
 *
 * In production, /api/turn-credentials mints short-lived Cloudflare TURN creds
 * server-side so the long-term token never reaches the browser.
 * In dev without env vars, falls back to STUN-only (works on the same network).
 */
export async function getIceServers() {
  const stun = { urls: 'stun:stun.l.google.com:19302' };

  try {
    const res = await fetch('/api/turn-credentials');
    if (res.ok) {
      const { iceServers } = await res.json();
      return [stun, ...iceServers];
    }
  } catch {
    // TURN unavailable — STUN only (fine for same-network dev)
  }

  return [stun];
}

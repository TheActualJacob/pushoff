/**
 * Client-side signaling over the polling API.
 *
 * Usage:
 *   const sig = createSignaling({ roomCode, selfId });
 *   await sig.join();                      // register in room
 *   sig.startPolling(onMessage, onPeers);  // 1s poll loop
 *   await sig.send(toPeerId, message);     // deliver a message
 *   sig.stop();                            // teardown
 */

const POLL_INTERVAL_MS = 1000;

export function createSignaling({ roomCode, selfId }) {
  let pollTimer = null;
  let stopped = false;

  async function call(body) {
    const res = await fetch('/api/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode, peerId: selfId, ...body }),
    });
    if (!res.ok) throw new Error(`Signal API error: ${res.status}`);
    return res.json();
  }

  async function join() {
    const data = await call({ op: 'join' });
    return data.peers;
  }

  async function leave() {
    try { await call({ op: 'leave' }); } catch { /* best-effort */ }
  }

  async function send(toPeerId, message) {
    await call({ op: 'post', toPeerId, message });
  }

  function startPolling(onMessage, onPeers) {
    async function poll() {
      if (stopped) return;
      try {
        const data = await call({ op: 'poll' });
        if (data.messages?.length) {
          for (const msg of data.messages) onMessage(msg);
        }
        // Re-fetch peer list to detect new joiners
        const peersData = await call({ op: 'join' });
        onPeers?.(peersData.peers);
      } catch (err) {
        console.warn('[signaling] poll error:', err);
      }
      if (!stopped) pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
    }
    poll();
  }

  function stop() {
    stopped = true;
    clearTimeout(pollTimer);
    leave();
  }

  return { join, send, startPolling, stop };
}

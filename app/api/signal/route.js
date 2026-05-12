/**
 * Signaling API — three operations on a single POST endpoint.
 *
 * Body: { op, roomCode, peerId, ...opSpecific }
 *
 * op=join   : Register peer in room. Returns { peers: [{peerId, joinedAt}] }
 * op=post   : Deliver a message to a specific peer's mailbox.
 *             Body: { toPeerId, message }
 * op=poll   : Atomically drain own mailbox. Returns { messages: [...] }
 * op=leave  : Remove peer from room.
 */

import { getKv } from '@/lib/kv';

const ROOM_TTL = 30 * 60; // 30 minutes

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { op, roomCode, peerId } = body;
  if (!op || !roomCode || !peerId) {
    return Response.json({ error: 'op, roomCode, peerId are required' }, { status: 400 });
  }

  const kv = getKv();

  // ── join ──────────────────────────────────────────────────────────────────
  if (op === 'join') {
    const peersKey = `room:${roomCode}:peers`;
    const peerData = JSON.stringify({ peerId, joinedAt: Date.now() });

    // Read existing peers
    const existing = await kv.lrange(peersKey, 0, -1);

    // Only add if not already present
    const alreadyIn = existing.some((p) => {
      try { return JSON.parse(p).peerId === peerId; } catch { return false; }
    });

    if (!alreadyIn) {
      await kv.lpush(peersKey, peerData);
      await kv.expire(peersKey, ROOM_TTL);
    }

    const all = await kv.lrange(peersKey, 0, -1);
    const peers = all.map((p) => {
      try { return JSON.parse(p); } catch { return null; }
    }).filter(Boolean);

    return Response.json({ peers });
  }

  // ── post ──────────────────────────────────────────────────────────────────
  if (op === 'post') {
    const { toPeerId, message } = body;
    if (!toPeerId || !message) {
      return Response.json({ error: 'toPeerId and message are required' }, { status: 400 });
    }
    const mailKey = `room:${roomCode}:mail:${toPeerId}`;
    await kv.lpush(mailKey, JSON.stringify({ from: peerId, ...message }));
    await kv.expire(mailKey, ROOM_TTL);
    return Response.json({ ok: true });
  }

  // ── poll ──────────────────────────────────────────────────────────────────
  if (op === 'poll') {
    const mailKey = `room:${roomCode}:mail:${peerId}`;
    // Drain with atomic per-item pops — avoids the lrange+del race where two
    // concurrent requests both read the same messages and double-deliver SDPs.
    const messages = [];
    let item;
    while ((item = await kv.lpop(mailKey)) !== null) {
      try { messages.push(JSON.parse(item)); } catch { /* skip malformed */ }
    }
    // lpush adds to head so items arrive newest-first; reverse to send order.
    messages.reverse();
    return Response.json({ messages });
  }

  // ── leave ─────────────────────────────────────────────────────────────────
  if (op === 'leave') {
    const peersKey = `room:${roomCode}:peers`;
    const existing = await kv.lrange(peersKey, 0, -1);
    const kept = existing.filter((p) => {
      try { return JSON.parse(p).peerId !== peerId; } catch { return true; }
    });
    await kv.del(peersKey);
    if (kept.length > 0) {
      for (const p of kept) await kv.lpush(peersKey, p);
      await kv.expire(peersKey, ROOM_TTL);
    }
    return Response.json({ ok: true });
  }

  return Response.json({ error: `Unknown op: ${op}` }, { status: 400 });
}

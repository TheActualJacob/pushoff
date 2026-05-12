import { getKv } from '@/lib/kv';

const QUEUE_KEY = 'matchmaking:queue';
const MATCH_TTL = 120;   // seconds to claim a match before it expires
const HB_TTL = 8;        // seconds before a waiting peer is considered gone

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

async function readQueue(kv) {
  const raw = await kv.lrange(QUEUE_KEY, 0, -1);
  return raw.map((r) => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
}

// Rebuild the queue list from an array, preserving entry order (index 0 = head).
async function writeQueue(kv, entries) {
  await kv.del(QUEUE_KEY);
  if (entries.length === 0) return;
  // lpush prepends, so push in reverse to keep original order.
  for (const e of [...entries].reverse()) {
    await kv.lpush(QUEUE_KEY, JSON.stringify(e));
  }
  await kv.expire(QUEUE_KEY, 600);
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { op, peerId, name } = body;
  if (!op || !peerId) {
    return Response.json({ error: 'op and peerId are required' }, { status: 400 });
  }

  const kv = getKv();

  // ── enqueue ───────────────────────────────────────────────────────────────
  if (op === 'enqueue') {
    const queue = await readQueue(kv);
    if (!queue.some((e) => e.peerId === peerId)) {
      await kv.lpush(QUEUE_KEY, JSON.stringify({ peerId, name: name || 'Anonymous' }));
      await kv.expire(QUEUE_KEY, 600);
    }
    await kv.set(`matchmaking:hb:${peerId}`, '1', { ex: HB_TTL });
    return Response.json({ ok: true });
  }

  // ── poll ──────────────────────────────────────────────────────────────────
  if (op === 'poll') {
    await kv.set(`matchmaking:hb:${peerId}`, '1', { ex: HB_TTL });

    // Already matched?
    const existing = await kv.get(`matchmaking:match:${peerId}`);
    if (existing) {
      const m = typeof existing === 'string' ? JSON.parse(existing) : existing;
      return Response.json({ matched: true, roomCode: m.roomCode, matchedWith: m.matchedWith });
    }

    // Filter out stale peers (heartbeat expired).
    const queue = await readQueue(kv);
    const live = [];
    for (const e of queue) {
      const hb = await kv.get(`matchmaking:hb:${e.peerId}`);
      if (hb !== null) live.push(e);
    }

    // Try to pair the first two live peers.
    if (live.length >= 2) {
      const [a, b] = live;
      const roomCode = generateRoomCode();
      await kv.set(`matchmaking:match:${a.peerId}`, JSON.stringify({ roomCode, matchedWith: b.name }), { ex: MATCH_TTL });
      await kv.set(`matchmaking:match:${b.peerId}`, JSON.stringify({ roomCode, matchedWith: a.name }), { ex: MATCH_TTL });
      await writeQueue(kv, live.slice(2));

      if (a.peerId === peerId) return Response.json({ matched: true, roomCode, matchedWith: b.name });
      if (b.peerId === peerId) return Response.json({ matched: true, roomCode, matchedWith: a.name });
    } else if (live.length < queue.length) {
      await writeQueue(kv, live);
    }

    return Response.json({ matched: false, waiting: live.length });
  }

  // ── dequeue ───────────────────────────────────────────────────────────────
  if (op === 'dequeue') {
    const queue = await readQueue(kv);
    await writeQueue(kv, queue.filter((e) => e.peerId !== peerId));
    await kv.del(`matchmaking:hb:${peerId}`);
    await kv.del(`matchmaking:match:${peerId}`);
    return Response.json({ ok: true });
  }

  return Response.json({ error: `Unknown op: ${op}` }, { status: 400 });
}

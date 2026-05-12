import { getKv } from '@/lib/kv';

export async function GET() {
  const kv = getKv();
  const key = 'diag:test:list';
  const results = {};

  try { await kv.del(key); results.del = 'ok'; } catch (e) { results.del = String(e); }
  try { const n = await kv.lpush(key, JSON.stringify({ hello: 'world' })); results.lpush = n; } catch (e) { results.lpush = String(e); }
  try { const items = await kv.lrange(key, 0, -1); results.lrange = items; } catch (e) { results.lrange = String(e); }
  try { const item = await kv.lpop(key); results.lpop = item; } catch (e) { results.lpop = String(e); }

  results.backend = process.env.UPSTASH_REDIS_REST_URL ? 'upstash' : 'memory';
  return Response.json(results);
}

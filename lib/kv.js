/**
 * Thin KV abstraction.
 *
 * In production (when UPSTASH_REDIS_REST_URL is set) uses Upstash Redis.
 * In development falls back to a process-global in-memory Map so the app
 * works with zero external services.
 *
 * Exposed API (mirrors Redis commands we actually use):
 *   lpush(key, ...values)  → new list length
 *   lrange(key, start, stop) → array of strings
 *   del(key)               → number of keys deleted
 *   set(key, value, { ex })→ 'OK'
 *   get(key)               → value or null
 *   expire(key, seconds)   → 1 | 0
 */

import { Redis } from '@upstash/redis';

let _redis = null;
let _mem = null;

function getRedis() {
  if (_redis) return _redis;
  _redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  return _redis;
}

/** In-memory store (dev fallback). Stored on global so Next.js hot-reloads don't wipe it. */
function getMem() {
  if (!global.__kvMem) {
    global.__kvMem = {
      data: new Map(),    // key → { value, expiresAt? }
      lists: new Map(),   // key → string[]
      expiry: new Map(),  // key → expiresAt ms (for list keys)
    };
  }
  return global.__kvMem;
}

function memExpired(entry) {
  return entry.expiresAt != null && Date.now() > entry.expiresAt;
}

function listExpired(m, key) {
  const exp = m.expiry.get(key);
  if (exp != null && Date.now() > exp) {
    m.lists.delete(key);
    m.expiry.delete(key);
    return true;
  }
  return false;
}

const memStore = {
  async lpush(key, ...values) {
    const m = getMem();
    if (listExpired(m, key)) { /* list was stale, start fresh */ }
    if (!m.lists.has(key)) m.lists.set(key, []);
    const list = m.lists.get(key);
    list.unshift(...values.map(String).reverse());
    return list.length;
  },

  async lpop(key) {
    const m = getMem();
    if (listExpired(m, key)) return null;
    const list = m.lists.get(key);
    if (!list || list.length === 0) return null;
    return list.shift();
  },

  async lrange(key, start, stop) {
    const m = getMem();
    if (listExpired(m, key)) return [];
    const list = m.lists.get(key) ?? [];
    const end = stop === -1 ? undefined : stop + 1;
    return list.slice(start, end);
  },

  async del(key) {
    const m = getMem();
    const had = m.data.has(key) || m.lists.has(key);
    m.data.delete(key);
    m.lists.delete(key);
    m.expiry.delete(key);
    return had ? 1 : 0;
  },

  async set(key, value, opts) {
    const m = getMem();
    const entry = { value: typeof value === 'string' ? value : JSON.stringify(value) };
    if (opts?.ex) entry.expiresAt = Date.now() + opts.ex * 1000;
    m.data.set(key, entry);
    return 'OK';
  },

  async get(key) {
    const m = getMem();
    const entry = m.data.get(key);
    if (!entry || memExpired(entry)) return null;
    try { return JSON.parse(entry.value); } catch { return entry.value; }
  },

  async expire(key, seconds) {
    const m = getMem();
    const expiresAt = Date.now() + seconds * 1000;
    if (m.lists.has(key)) {
      m.expiry.set(key, expiresAt);
      return 1;
    }
    const entry = m.data.get(key);
    if (!entry) return 0;
    entry.expiresAt = expiresAt;
    return 1;
  },
};

export function getKv() {
  if (process.env.UPSTASH_REDIS_REST_URL) return getRedis();
  return memStore;
}

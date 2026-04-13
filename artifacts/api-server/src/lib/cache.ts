import { Redis } from "@upstash/redis";

const useRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
let redis: Redis | null = null;

if (useRedis) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  console.log("[Cache] Using Upstash Redis");
} else {
  console.log("[Cache] Using in-memory store (set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN to enable Redis)");
}

/* ─── In-memory fallback ────────────────────────────────────────── */
interface CacheEntry<T> { value: T; expiresAt: number; hits: number; }
const memStore = new Map<string, CacheEntry<unknown>>();
let hits = 0; let misses = 0;

setInterval(() => {
  const now = Date.now();
  let evicted = 0;
  for (const [k, e] of memStore.entries()) {
    if (now > e.expiresAt) { memStore.delete(k); evicted++; }
  }
  if (evicted > 0 && process.env.NODE_ENV === "development") {
    console.debug(`[Cache] Evicted ${evicted} in-memory entries. Size: ${memStore.size}`);
  }
}, 60_000);

/* ─── Public API ────────────────────────────────────────────────── */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (redis) {
    try {
      const val = await redis.get<T>(key);
      if (val !== null && val !== undefined) { hits++; return val; }
      misses++; return null;
    } catch (e) {
      console.error("[Cache] Redis GET error:", e);
    }
  }
  const entry = memStore.get(key) as CacheEntry<T> | undefined;
  if (!entry) { misses++; return null; }
  if (Date.now() > entry.expiresAt) { memStore.delete(key); misses++; return null; }
  entry.hits++; hits++; return entry.value;
}

export async function cacheSet<T>(key: string, value: T, ttlMs: number): Promise<void> {
  if (redis) {
    try {
      await redis.set(key, value, { ex: Math.ceil(ttlMs / 1000) });
      return;
    } catch (e) {
      console.error("[Cache] Redis SET error:", e);
    }
  }
  memStore.set(key, { value, expiresAt: Date.now() + ttlMs, hits: 0 });
}

export async function cacheDelete(pattern: string): Promise<void> {
  if (redis) {
    try {
      const keys = await redis.keys(`*${pattern}*`);
      if (keys.length > 0) await redis.del(...keys);
      return;
    } catch (e) {
      console.error("[Cache] Redis DEL error:", e);
    }
  }
  for (const k of memStore.keys()) {
    if (k.includes(pattern)) memStore.delete(k);
  }
}

export async function cacheDeleteExact(key: string): Promise<void> {
  if (redis) {
    try { await redis.del(key); return; } catch (e) { console.error("[Cache] Redis DEL error:", e); }
  }
  memStore.delete(key);
}

export function cacheStats() {
  return {
    backend: useRedis ? "redis" : "memory",
    size: memStore.size,
    hits,
    misses,
    hitRate: hits + misses === 0 ? "0%" : (hits / (hits + misses) * 100).toFixed(1) + "%",
  };
}

export const TTL = {
  EXPLORE_LANGUAGES: 5 * 60 * 1000,
  EXPLORE_TRENDING:  60 * 1000,
  REPO_LIST:         30 * 1000,
  REPO_DETAIL:       30 * 1000,
  AGENT_PROFILE:     60 * 1000,
  AGENT_REPOS:       30 * 1000,
};

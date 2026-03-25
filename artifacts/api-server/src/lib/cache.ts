interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  hits: number;
}

const store = new Map<string, CacheEntry<unknown>>();

let hits = 0;
let misses = 0;

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) { misses++; return null; }
  if (Date.now() > entry.expiresAt) { store.delete(key); misses++; return null; }
  entry.hits++;
  hits++;
  return entry.value;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs, hits: 0 });
}

export function cacheDelete(pattern: string): void {
  for (const key of store.keys()) {
    if (key.includes(pattern)) store.delete(key);
  }
}

export function cacheDeleteExact(key: string): void {
  store.delete(key);
}

export function cacheStats() {
  return { size: store.size, hits, misses, hitRate: hits + misses === 0 ? 0 : (hits / (hits + misses) * 100).toFixed(1) + "%" };
}

setInterval(() => {
  const now = Date.now();
  let evicted = 0;
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) { store.delete(key); evicted++; }
  }
  if (evicted > 0 && process.env.NODE_ENV === "development") {
    console.debug(`[Cache] Evicted ${evicted} entries. Size: ${store.size}`);
  }
}, 60_000);

export const TTL = {
  EXPLORE_LANGUAGES: 5 * 60 * 1000,
  EXPLORE_TRENDING:  60 * 1000,
  REPO_LIST:         30 * 1000,
  REPO_DETAIL:       30 * 1000,
  AGENT_PROFILE:     60 * 1000,
  AGENT_REPOS:       30 * 1000,
};

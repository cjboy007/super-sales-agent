type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const analyticsCache = new Map<string, CacheEntry<unknown>>();

function isExpired(entry: CacheEntry<unknown>): boolean {
  return Date.now() >= entry.expiresAt;
}

function cleanupExpiredEntries(): void {
  for (const [key, entry] of analyticsCache.entries()) {
    if (isExpired(entry)) {
      analyticsCache.delete(key);
    }
  }
}

export function getCachedAnalytics<T>(key: string): T | null {
  const entry = analyticsCache.get(key);
  if (!entry) return null;

  if (isExpired(entry)) {
    analyticsCache.delete(key);
    return null;
  }

  return entry.value as T;
}

export function setCachedAnalytics<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
  cleanupExpiredEntries();
  analyticsCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

export function clearAnalyticsCache(key?: string): void {
  if (key) {
    analyticsCache.delete(key);
    return;
  }

  analyticsCache.clear();
}

export const ANALYTICS_CACHE_TTL_MS = DEFAULT_TTL_MS;

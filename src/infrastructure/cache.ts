type CacheEntry<T> = { data: T; ts: number };
type Revalidation = { fetcher: () => Promise<unknown>; ttlMs: number };
type Listener = (data: unknown) => void;

export const CATALOG_TTL_MS = 10 * 60 * 1000;
export const SHORT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_TTL_MS = CATALOG_TTL_MS;

const CACHE_VERSION = 2;
const STORAGE_ROOT = 'tips_cache_';
const STORAGE_PREFIX = `${STORAGE_ROOT}v${CACHE_VERSION}_`;

const memoryStore = new Map<string, CacheEntry<unknown>>();
const revalidations = new Map<string, Revalidation>();
const inFlight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<Listener>>();

// Entries from older versions (including mock catalogues cached before the fallback was removed) are never read again.
function dropStaleStorageEntries(): void {
    try {
        Object.keys(localStorage)
            .filter((k) => k.startsWith(STORAGE_ROOT) && !k.startsWith(STORAGE_PREFIX))
            .forEach((k) => localStorage.removeItem(k));
    } catch { /* localStorage unavailable */ }
}
dropStaleStorageEntries();

// The timestamp is the moment the data was fetched, not the moment it was read back, so a reload never extends its life.
function readEntry<T>(key: string): CacheEntry<T> | null {
    const memory = memoryStore.get(key) as CacheEntry<T> | undefined;
    if (memory) return memory;
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + key);
        if (!raw) return null;
        const entry = JSON.parse(raw) as CacheEntry<T>;
        if (!entry || typeof entry.ts !== 'number') return null;
        memoryStore.set(key, entry);
        return entry;
    } catch {
        return null;
    }
}

function isFresh(entry: CacheEntry<unknown>, ttlMs: number): boolean {
    return Date.now() - entry.ts <= ttlMs;
}

function dropEntry(key: string): void {
    memoryStore.delete(key);
    try {
        localStorage.removeItem(STORAGE_PREFIX + key);
    } catch { /* localStorage unavailable */ }
}

export function getCached<T>(key: string, ttlMs = DEFAULT_TTL_MS): T | null {
    const entry = readEntry<T>(key);
    if (!entry) return null;
    if (isFresh(entry, ttlMs)) return entry.data;
    dropEntry(key);
    return null;
}

export function setCache<T>(key: string, data: T): void {
    const entry: CacheEntry<T> = { data, ts: Date.now() };
    memoryStore.set(key, entry);
    try {
        localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(entry));
    } catch {
        // localStorage might be full or disabled, memory cache will still work
    }
    listeners.get(key)?.forEach((listener) => listener(data));
}

// Subscribers receive every new value written for the key, including background refreshes.
export function subscribeCache<T>(key: string, listener: (data: T) => void): () => void {
    const set = listeners.get(key) ?? new Set<Listener>();
    set.add(listener as Listener);
    listeners.set(key, set);
    return () => {
        set.delete(listener as Listener);
    };
}

export function invalidateCache(key: string): void {
    dropEntry(key);
}

export function invalidateAll(): void {
    memoryStore.clear();
    try {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_ROOT));
        keys.forEach(k => localStorage.removeItem(k));
    } catch { /* localStorage unavailable */ }
}

function runFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const pending = inFlight.get(key);
    if (pending) return pending as Promise<T>;
    const request = fetcher()
        .then((data) => {
            setCache(key, data);
            return data;
        })
        .finally(() => { inFlight.delete(key); });
    inFlight.set(key, request);
    return request;
}

export async function cachedFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
    const cached = getCached<T>(key, ttlMs);
    if (cached !== null) return cached;
    return runFetch(key, fetcher);
}

// Stale-while-revalidate: a stored value is served at once, even past its TTL, and refreshed in the background
// when it has expired. A missing value waits for the fetch. Refreshes reach subscribers through subscribeCache.
export function staleWhileRevalidate<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
    revalidations.set(key, { fetcher, ttlMs });
    const entry = readEntry<T>(key);
    if (entry) {
        if (!isFresh(entry, ttlMs)) void runFetch(key, fetcher).catch(() => {});
        return Promise.resolve(entry.data);
    }
    return runFetch(key, fetcher);
}

// Called when the tab becomes visible again: every stale staleWhileRevalidate key is refreshed once.
export function revalidateStale(): void {
    for (const [key, { fetcher, ttlMs }] of revalidations) {
        const entry = readEntry(key);
        if (entry && !isFresh(entry, ttlMs)) void runFetch(key, fetcher).catch(() => {});
    }
}

if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') revalidateStale();
    });
}

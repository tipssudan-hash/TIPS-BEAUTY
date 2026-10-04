type CacheEntry<T> = { data: T; ts: number };

const memoryStore = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const STORAGE_PREFIX = 'tips_cache_';

function readLocalStorage<T>(key: string, ttlMs: number): T | null {
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + key);
        if (!raw) return null;
        const entry: CacheEntry<T> = JSON.parse(raw);
        if (Date.now() - entry.ts > ttlMs) {
            localStorage.removeItem(STORAGE_PREFIX + key);
            return null;
        }
        return entry.data;
    } catch {
        return null;
    }
}

function writeLocalStorage<T>(key: string, data: T): void {
    try {
        const entry: CacheEntry<T> = { data, ts: Date.now() };
        localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(entry));
    } catch {
        // localStorage might be full or disabled, memory cache will still work
    }
}

export function getCached<T>(key: string, ttlMs = DEFAULT_TTL_MS): T | null {
    const memory = memoryStore.get(key) as CacheEntry<T> | undefined;
    if (memory) {
        if (Date.now() - memory.ts <= ttlMs) {
            return memory.data;
        }
        memoryStore.delete(key);
    }
    const fromStorage = readLocalStorage<T>(key, ttlMs);
    if (fromStorage !== null) {
        memoryStore.set(key, { data: fromStorage, ts: Date.now() });
        return fromStorage;
    }
    return null;
}

export function setCache<T>(key: string, data: T): void {
    memoryStore.set(key, { data, ts: Date.now() });
    writeLocalStorage(key, data);
}

export function invalidateCache(key: string): void {
    memoryStore.delete(key);
    try {
        localStorage.removeItem(STORAGE_PREFIX + key);
    } catch {}
}

export function invalidateAll(): void {
    memoryStore.clear();
    try {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX));
        keys.forEach(k => localStorage.removeItem(k));
    } catch {}
}

export async function cachedFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
    const cached = getCached<T>(key, ttlMs);
    if (cached !== null) return cached;
    const data = await fetcher();
    setCache(key, data);
    return data;
}

export async function staleWhileRevalidate<T>(
    key: string,
    fetcher: () => Promise<T>,
    onUpdate: (data: T) => void,
    ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
    const cached = getCached<T>(key, ttlMs);
    if (cached !== null) {
        fetcher()
            .then((fresh) => {
                setCache(key, fresh);
                onUpdate(fresh);
            })
            .catch(() => {});
        return cached;
    }
    const data = await fetcher();
    setCache(key, data);
    return data;
}


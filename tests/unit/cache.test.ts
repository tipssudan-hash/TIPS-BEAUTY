import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const MINUTE = 60_000;
const NOW = new Date('2026-01-01T00:00:00Z').getTime();
const PREFIX = 'tips_cache_v2_';

// Keys are enumerable data properties so Object.keys(localStorage) behaves as it does in a browser.
function createLocalStorage() {
    const data: Record<string, string> = {};
    Object.defineProperties(data, {
        getItem: { value: (key: string) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null) },
        setItem: { value: (key: string, value: string) => { data[key] = String(value); } },
        removeItem: { value: (key: string) => { delete data[key]; } },
        clear: { value: () => { for (const key of Object.keys(data)) delete data[key]; } },
    });
    return data;
}

type CacheModule = typeof import('@infrastructure/cache');
let cache: CacheModule;

function writeStoredEntry(key: string, data: unknown, ts: number): void {
    localStorage.setItem(PREFIX + key, JSON.stringify({ data, ts }));
}

beforeAll(async () => {
    vi.stubGlobal('localStorage', createLocalStorage());
    cache = await import('@infrastructure/cache');
});

beforeEach(() => {
    cache.invalidateAll();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('cache keeps the original fetch time', () => {
    it('does not restart the TTL when a stored entry is read back', () => {
        writeStoredEntry('catalog:test', ['a'], NOW - 9 * MINUTE);

        expect(cache.getCached<string[]>('catalog:test', 10 * MINUTE)).toEqual(['a']);

        vi.setSystemTime(NOW + 2 * MINUTE);
        expect(cache.getCached<string[]>('catalog:test', 10 * MINUTE)).toBeNull();
    });

    it('stamps a fresh write with the time it was written', () => {
        cache.setCache('catalog:fresh', 1);

        vi.setSystemTime(NOW + 10 * MINUTE);
        expect(cache.getCached<number>('catalog:fresh', 10 * MINUTE)).toBe(1);

        vi.setSystemTime(NOW + 10 * MINUTE + 1);
        expect(cache.getCached<number>('catalog:fresh', 10 * MINUTE)).toBeNull();
    });

    it('applies each caller\'s TTL to the same stored entry', () => {
        writeStoredEntry('paymentMethods', ['cod'], NOW - 6 * MINUTE);

        expect(cache.getCached<string[]>('paymentMethods', 10 * MINUTE)).toEqual(['cod']);
        expect(cache.getCached<string[]>('paymentMethods', 5 * MINUTE)).toBeNull();
    });
});

describe('staleWhileRevalidate', () => {
    it('returns a stale value at once and refreshes it in the background', async () => {
        vi.useRealTimers();
        writeStoredEntry('catalog:swr', 'old', Date.now() - 20 * MINUTE);
        const seen: unknown[] = [];
        const unsubscribe = cache.subscribeCache<string>('catalog:swr', (data) => seen.push(data));

        const first = await cache.staleWhileRevalidate<string>('catalog:swr', async () => 'fresh', 10 * MINUTE);
        expect(first).toBe('old');

        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(cache.getCached<string>('catalog:swr', 10 * MINUTE)).toBe('fresh');
        expect(seen).toEqual(['fresh']);
        unsubscribe();
    });

    it('waits for the fetch when nothing is stored', async () => {
        vi.useRealTimers();
        const value = await cache.staleWhileRevalidate<string>('catalog:empty', async () => 'first', 10 * MINUTE);
        expect(value).toBe('first');
    });
});

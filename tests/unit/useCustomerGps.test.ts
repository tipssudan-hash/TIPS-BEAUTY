import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCustomerGps } from '@presentation/hooks/useCustomerGps';

const harness = vi.hoisted(() => ({ cells: [] as unknown[], index: 0 }));

vi.mock('react', () => ({
    useState: <T>(initial: T): [T, (next: T) => void] => {
        const i = harness.index++;
        if (!(i in harness.cells)) harness.cells[i] = initial;
        return [harness.cells[i] as T, (next: T) => { harness.cells[i] = next; }];
    },
    useRef: <T>(initial: T): { current: T } => {
        const i = harness.index++;
        if (!(i in harness.cells)) harness.cells[i] = { current: initial };
        return harness.cells[i] as { current: T };
    },
    useCallback: <T>(fn: T): T => fn,
}));

const startRender = () => {
    harness.index = 0;
};

const useRender = () => {
    startRender();
    return useCustomerGps();
};

describe('useCustomerGps', () => {
    beforeEach(() => {
        harness.cells = [];
        harness.index = 0;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('starts idle with no coordinates', () => {
        vi.stubGlobal('navigator', {});
        const gps = useRender();
        expect(gps.status).toBe('idle');
        expect(gps.latitude).toBeNull();
        expect(gps.longitude).toBeNull();
        expect(gps.accuracyMeters).toBeNull();
    });

    it('reports unavailable when navigator.geolocation is missing', () => {
        vi.stubGlobal('navigator', {});
        useRender().requestGps();
        expect(useRender().status).toBe('unavailable');
    });

    it('stores coordinates on success and returns to idle on clearGps', () => {
        const getCurrentPosition = vi.fn((onSuccess: (pos: unknown) => void) => {
            onSuccess({ coords: { latitude: 15.5, longitude: 32.5, accuracy: 12 } });
        });
        vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

        useRender().requestGps();
        const granted = useRender();
        expect(granted.status).toBe('granted');
        expect(granted.latitude).toBe(15.5);
        expect(granted.longitude).toBe(32.5);
        expect(granted.accuracyMeters).toBe(12);
        expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true, timeout: 15_000 });

        granted.clearGps();
        const cleared = useRender();
        expect(cleared.status).toBe('idle');
        expect(cleared.latitude).toBeNull();
        expect(cleared.longitude).toBeNull();
    });

    it.each([
        [1, 'denied'],
        [3, 'timeout'],
        [2, 'unavailable'],
    ])('maps geolocation error code %i to %s', (code, status) => {
        const getCurrentPosition = vi.fn((_ok: unknown, onError: (err: { code: number }) => void) => onError({ code }));
        vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
        useRender().requestGps();
        expect(useRender().status).toBe(status);
    });
});

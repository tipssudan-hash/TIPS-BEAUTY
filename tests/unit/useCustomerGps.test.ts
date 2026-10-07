import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCustomerGps } from '@presentation/hooks/useCustomerGps';

const harness = vi.hoisted(() => ({
    cells: [] as unknown[],
    index: 0,
    cleanups: [] as Array<() => void>,
}));

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
    useEffect: (effect: () => void | (() => void)) => {
        const cleanup = effect();
        if (typeof cleanup === 'function') harness.cleanups.push(cleanup);
    },
}));

interface FakePosition {
    coords: { latitude: number; longitude: number; accuracy: number };
}

interface FakeGeolocation {
    watchPosition: ReturnType<typeof vi.fn>;
    clearWatch: ReturnType<typeof vi.fn>;
    emit: (accuracy: number, latitude?: number, longitude?: number) => void;
    fail: (code: number) => void;
}

const position = (accuracy: number, latitude = 15.5, longitude = 32.5): FakePosition => ({
    coords: { latitude, longitude, accuracy },
});

const createGeolocation = (): FakeGeolocation => {
    let onSuccess: (pos: FakePosition) => void = () => undefined;
    let onError: (err: { code: number }) => void = () => undefined;
    const watchPosition = vi.fn((ok: typeof onSuccess, fail: typeof onError) => {
        onSuccess = ok;
        onError = fail;
        return 7;
    });
    const clearWatch = vi.fn();
    return {
        watchPosition,
        clearWatch,
        emit: (accuracy, latitude, longitude) => onSuccess(position(accuracy, latitude, longitude)),
        fail: (code) => onError({ code }),
    };
};

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
        harness.cleanups = [];
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
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

    it('becomes granted on the first reading using high-accuracy watch options', () => {
        const geolocation = createGeolocation();
        vi.stubGlobal('navigator', { geolocation });

        useRender().requestGps();
        expect(useRender().status).toBe('requesting');
        geolocation.emit(300);

        const granted = useRender();
        expect(granted.status).toBe('granted');
        expect(granted.latitude).toBe(15.5);
        expect(granted.longitude).toBe(32.5);
        expect(granted.accuracyMeters).toBe(300);
        expect(geolocation.watchPosition.mock.calls[0][2]).toMatchObject({
            enableHighAccuracy: true,
            timeout: 15_000,
            maximumAge: 0,
        });
    });

    it('replaces the stored reading when a more accurate one arrives', () => {
        const geolocation = createGeolocation();
        vi.stubGlobal('navigator', { geolocation });

        useRender().requestGps();
        geolocation.emit(300, 15.5, 32.5);
        geolocation.emit(50, 15.6, 32.6);

        const gps = useRender();
        expect(gps.accuracyMeters).toBe(50);
        expect(gps.latitude).toBe(15.6);
        expect(gps.longitude).toBe(32.6);
        expect(geolocation.clearWatch).not.toHaveBeenCalled();
    });

    it('ignores a less accurate reading', () => {
        const geolocation = createGeolocation();
        vi.stubGlobal('navigator', { geolocation });

        useRender().requestGps();
        geolocation.emit(50, 15.6, 32.6);
        geolocation.emit(400, 16, 33);

        const gps = useRender();
        expect(gps.accuracyMeters).toBe(50);
        expect(gps.latitude).toBe(15.6);
        expect(gps.longitude).toBe(32.6);
    });

    it('stops watching once the target accuracy is reached', () => {
        const geolocation = createGeolocation();
        vi.stubGlobal('navigator', { geolocation });

        useRender().requestGps();
        geolocation.emit(10);

        expect(geolocation.clearWatch).toHaveBeenCalledWith(7);
        expect(useRender().accuracyMeters).toBe(10);
    });

    it('stops watching when the refinement window ends', () => {
        const geolocation = createGeolocation();
        vi.stubGlobal('navigator', { geolocation });

        useRender().requestGps();
        geolocation.emit(300);
        expect(geolocation.clearWatch).not.toHaveBeenCalled();

        vi.advanceTimersByTime(8_000);
        expect(geolocation.clearWatch).toHaveBeenCalledTimes(1);
        expect(geolocation.clearWatch).toHaveBeenCalledWith(7);
    });

    it('cancels the previous watch when requestGps is called again', () => {
        const geolocation = createGeolocation();
        vi.stubGlobal('navigator', { geolocation });

        useRender().requestGps();
        geolocation.emit(300);
        useRender().requestGps();

        expect(geolocation.clearWatch).toHaveBeenCalledWith(7);
        expect(geolocation.watchPosition).toHaveBeenCalledTimes(2);
    });

    it('stops watching on unmount', () => {
        const geolocation = createGeolocation();
        vi.stubGlobal('navigator', { geolocation });

        useRender().requestGps();
        geolocation.emit(300);
        harness.cleanups.forEach((cleanup) => cleanup());

        expect(geolocation.clearWatch).toHaveBeenCalledWith(7);
    });

    it.each([
        [1, 'denied'],
        [3, 'timeout'],
        [2, 'unavailable'],
    ])('maps geolocation error code %i to %s before any reading', (code, status) => {
        const geolocation = createGeolocation();
        vi.stubGlobal('navigator', { geolocation });
        useRender().requestGps();
        geolocation.fail(code);

        expect(useRender().status).toBe(status);
        expect(geolocation.clearWatch).toHaveBeenCalledWith(7);
    });

    it('ignores errors that arrive after a valid reading', () => {
        const geolocation = createGeolocation();
        vi.stubGlobal('navigator', { geolocation });

        useRender().requestGps();
        geolocation.emit(120);
        geolocation.fail(3);

        const gps = useRender();
        expect(gps.status).toBe('granted');
        expect(gps.accuracyMeters).toBe(120);
    });

    it('clearGps clears the watch and returns to idle', () => {
        const geolocation = createGeolocation();
        vi.stubGlobal('navigator', { geolocation });

        useRender().requestGps();
        geolocation.emit(300);
        useRender().clearGps();

        expect(geolocation.clearWatch).toHaveBeenCalledWith(7);
        const cleared = useRender();
        expect(cleared.status).toBe('idle');
        expect(cleared.latitude).toBeNull();
        expect(cleared.longitude).toBeNull();
        expect(cleared.accuracyMeters).toBeNull();
    });
});

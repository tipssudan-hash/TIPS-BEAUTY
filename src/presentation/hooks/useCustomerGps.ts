import { useCallback, useEffect, useRef, useState } from 'react';

export type GpsStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable' | 'timeout';

export interface CustomerGpsState {
    status: GpsStatus;
    latitude: number | null;
    longitude: number | null;
    accuracyMeters: number | null;
    requestGps: () => void;
    clearGps: () => void;
}

type GpsFields = Pick<CustomerGpsState, 'status' | 'latitude' | 'longitude' | 'accuracyMeters'>;

const EMPTY: GpsFields = { status: 'idle', latitude: null, longitude: null, accuracyMeters: null };
const PERMISSION_DENIED = 1;
const TIMEOUT = 3;
const GPS_TIMEOUT_MS = 15_000;
const TARGET_ACCURACY_METERS = 20;
const REFINEMENT_WINDOW_MS = 8_000;

export function useCustomerGps(): CustomerGpsState {
    const [fields, setFields] = useState<GpsFields>(EMPTY);
    const requestId = useRef(0);
    const stopWatch = useRef<(() => void) | null>(null);

    const cancelWatch = useCallback(() => {
        stopWatch.current?.();
        stopWatch.current = null;
    }, []);

    useEffect(() => () => {
        requestId.current += 1;
        cancelWatch();
    }, [cancelWatch]);

    const requestGps = useCallback(() => {
        cancelWatch();
        const id = ++requestId.current;
        const geolocation = typeof navigator === 'undefined' ? undefined : navigator.geolocation;
        if (!geolocation) {
            setFields({ ...EMPTY, status: 'unavailable' });
            return;
        }
        setFields({ ...EMPTY, status: 'requesting' });

        let watchHandle: number | null = null;
        let finished = false;
        let windowTimer: ReturnType<typeof setTimeout> | null = null;
        let bestAccuracy: number | null = null;

        const finish = () => {
            if (finished) return;
            finished = true;
            if (windowTimer !== null) clearTimeout(windowTimer);
            if (watchHandle !== null) geolocation.clearWatch(watchHandle);
        };

        try {
            watchHandle = geolocation.watchPosition(
                (pos) => {
                    if (id !== requestId.current || finished) return;
                    const accuracy = pos.coords.accuracy ?? null;
                    const previousBest = bestAccuracy;
                    const isFirst = previousBest === null;
                    if (previousBest !== null && (accuracy === null || accuracy >= previousBest)) return;
                    bestAccuracy = accuracy ?? Number.POSITIVE_INFINITY;
                    setFields({
                        status: 'granted',
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        accuracyMeters: accuracy,
                    });
                    if (accuracy !== null && accuracy <= TARGET_ACCURACY_METERS) {
                        finish();
                    } else if (isFirst) {
                        windowTimer = setTimeout(finish, REFINEMENT_WINDOW_MS);
                    }
                },
                (err) => {
                    if (id !== requestId.current || finished || bestAccuracy !== null) return;
                    finish();
                    const status: GpsStatus = err.code === PERMISSION_DENIED ? 'denied' : err.code === TIMEOUT ? 'timeout' : 'unavailable';
                    setFields({ ...EMPTY, status });
                },
                { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 0 },
            );
            if (finished) geolocation.clearWatch(watchHandle);
            else stopWatch.current = finish;
        } catch {
            finish();
            setFields({ ...EMPTY, status: 'unavailable' });
        }
    }, [cancelWatch]);

    const clearGps = useCallback(() => {
        requestId.current += 1;
        cancelWatch();
        setFields(EMPTY);
    }, [cancelWatch]);

    return { ...fields, requestGps, clearGps };
}

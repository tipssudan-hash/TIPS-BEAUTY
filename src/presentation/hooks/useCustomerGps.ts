import { useCallback, useRef, useState } from 'react';

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

export function useCustomerGps(): CustomerGpsState {
    const [fields, setFields] = useState<GpsFields>(EMPTY);
    const requestId = useRef(0);

    const requestGps = useCallback(() => {
        const id = ++requestId.current;
        const geolocation = typeof navigator === 'undefined' ? undefined : navigator.geolocation;
        if (!geolocation) {
            setFields({ ...EMPTY, status: 'unavailable' });
            return;
        }
        setFields({ ...EMPTY, status: 'requesting' });
        try {
            geolocation.getCurrentPosition(
                (pos) => {
                    if (id !== requestId.current) return;
                    setFields({
                        status: 'granted',
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        accuracyMeters: pos.coords.accuracy ?? null,
                    });
                },
                (err) => {
                    if (id !== requestId.current) return;
                    const status: GpsStatus = err.code === PERMISSION_DENIED ? 'denied' : err.code === TIMEOUT ? 'timeout' : 'unavailable';
                    setFields({ ...EMPTY, status });
                },
                { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 0 },
            );
        } catch {
            setFields({ ...EMPTY, status: 'unavailable' });
        }
    }, []);

    const clearGps = useCallback(() => {
        requestId.current += 1;
        setFields(EMPTY);
    }, []);

    return { ...fields, requestGps, clearGps };
}

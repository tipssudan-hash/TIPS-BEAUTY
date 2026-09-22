import { useEffect, useRef, useState } from 'react';
import { shareMyLocation } from '../lib/driverApi';

// Foreground location sharing for a driver on the road. Runs only while `active` (online with a
// delivery in progress): watches the device position, sends it at most every 10 s or 40 m, keeps
// the screen awake where the browser allows it, and stops cleanly when the delivery ends or the
// page is closed. Backgrounding the tab pauses the watch — the backend tolerates the gap (the last
// position simply gets older) — and the native wrapper adds background tracking later.

export type LocationSharingState = 'idle' | 'sharing' | 'denied' | 'unsupported' | 'error';

const MIN_INTERVAL_MS = 10_000;
const MIN_DISTANCE_M = 40;

function distanceMeters(a: GeolocationCoordinates, b: GeolocationCoordinates): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLng = toRad(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export function useLocationSharing(active: boolean): { state: LocationSharingState; lastSentAt: Date | null } {
    const [state, setState] = useState<LocationSharingState>('idle');
    const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
    const last = useRef<{ coords: GeolocationCoordinates; at: number } | null>(null);

    useEffect(() => {
        if (!active) { setState('idle'); return; }
        if (!('geolocation' in navigator)) { setState('unsupported'); return; }
        let cancelled = false;
        let wakeLock: { release: () => Promise<void> } | null = null;

        const requestWakeLock = async () => {
            try {
                const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
                if (nav.wakeLock && document.visibilityState === 'visible') wakeLock = await nav.wakeLock.request('screen');
            } catch { /* optional */ }
        };
        void requestWakeLock();
        const onVisible = () => { if (document.visibilityState === 'visible') void requestWakeLock(); };
        document.addEventListener('visibilitychange', onVisible);

        const send = async (coords: GeolocationCoordinates) => {
            const now = Date.now();
            const prev = last.current;
            if (prev && now - prev.at < MIN_INTERVAL_MS && distanceMeters(prev.coords, coords) < MIN_DISTANCE_M) return;
            last.current = { coords, at: now };
            try {
                await shareMyLocation(coords.latitude, coords.longitude, coords.accuracy ?? null);
                if (!cancelled) { setState('sharing'); setLastSentAt(new Date()); }
            } catch (err) {
                console.error('share_driver_location', err);
                if (!cancelled) setState('error');
            }
        };

        const watchId = navigator.geolocation.watchPosition(
            (pos) => { void send(pos.coords); },
            (err) => { if (!cancelled) setState(err.code === err.PERMISSION_DENIED ? 'denied' : 'error'); },
            { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
        );

        return () => {
            cancelled = true;
            navigator.geolocation.clearWatch(watchId);
            document.removeEventListener('visibilitychange', onVisible);
            void wakeLock?.release();
            last.current = null;
        };
    }, [active]);

    return { state, lastSentAt };
}

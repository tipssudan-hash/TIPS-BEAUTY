import { useEffect, useState } from 'react';
import type { GeoPoint } from '@application/services/routeOrdering';

// One-shot device position, used to order the driver's stops. Stays null when the device or the user
// gives no position; callers then fall back to creation order.
export function useCurrentPosition(): GeoPoint | null {
    const [position, setPosition] = useState<GeoPoint | null>(null);

    useEffect(() => {
        if (!('geolocation' in navigator)) return;
        let cancelled = false;
        navigator.geolocation.getCurrentPosition(
            (pos) => { if (!cancelled) setPosition({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); },
            () => { /* no position: route falls back to creation order */ },
            { maximumAge: 60_000, timeout: 10_000 },
        );
        return () => { cancelled = true; };
    }, []);

    return position;
}

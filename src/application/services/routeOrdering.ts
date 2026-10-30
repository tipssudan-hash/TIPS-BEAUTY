// Route order for the driver's stops: nearest customer first from the driver's position, falling back
// to the order each stop was created when there is no position or the stop has no customer pin.

export interface GeoPoint {
    latitude: number;
    longitude: number;
}

export interface RoutableStop {
    createdAt: string;
    customerLat: number | null;
    customerLng: number | null;
}

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(from: GeoPoint, to: GeoPoint): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(to.latitude - from.latitude);
    const dLng = toRad(to.longitude - from.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function orderByRoute<T extends RoutableStop>(stops: readonly T[], from: GeoPoint | null): T[] {
    const byCreation = (a: T, b: T) => Date.parse(a.createdAt) - Date.parse(b.createdAt);
    if (!from) return [...stops].sort(byCreation);

    const pinned: { stop: T; meters: number }[] = [];
    const unpinned: T[] = [];
    for (const stop of stops) {
        if (stop.customerLat == null || stop.customerLng == null) {
            unpinned.push(stop);
        } else {
            pinned.push({ stop, meters: haversineMeters(from, { latitude: stop.customerLat, longitude: stop.customerLng }) });
        }
    }

    pinned.sort((a, b) => a.meters - b.meters || byCreation(a.stop, b.stop));
    return [...pinned.map((entry) => entry.stop), ...unpinned.sort(byCreation)];
}

import { describe, expect, it } from 'vitest';
import { haversineMeters, orderByRoute, type RoutableStop } from '@application/services/routeOrdering';

interface Stop extends RoutableStop {
    id: string;
}

const KHARTOUM = { latitude: 15.5007, longitude: 32.5599 };

function stop(id: string, createdAt: string, latitude: number | null, longitude: number | null): Stop {
    return { id, createdAt, customerLat: latitude, customerLng: longitude };
}

describe('haversineMeters', () => {
    it('measures one degree of latitude as about 111 km', () => {
        expect(haversineMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(111_195, -2);
    });

    it('is zero for the same point', () => {
        expect(haversineMeters(KHARTOUM, KHARTOUM)).toBe(0);
    });
});

describe('orderByRoute', () => {
    it('orders by creation time when the driver position is unknown', () => {
        const stops = [
            stop('late', '2026-10-22T12:00:00Z', 15.6, 32.5),
            stop('early', '2026-10-22T08:00:00Z', 15.4, 32.6),
            stop('middle', '2026-10-22T10:00:00Z', 15.5, 32.55),
        ];

        expect(orderByRoute(stops, null).map((s) => s.id)).toEqual(['early', 'middle', 'late']);
    });

    it('puts the nearest customer first from the driver position', () => {
        const far = stop('far', '2026-10-22T08:00:00Z', 15.9, 32.9);
        const near = stop('near', '2026-10-22T10:00:00Z', 15.5015, 32.5605);
        const mid = stop('mid', '2026-10-22T09:00:00Z', 15.55, 32.6);

        expect(orderByRoute([far, mid, near], KHARTOUM).map((s) => s.id)).toEqual(['near', 'mid', 'far']);
    });

    it('places stops without a customer pin after the ranked ones, by creation time', () => {
        const unpinnedNew = stop('unpinned-new', '2026-10-22T11:00:00Z', null, null);
        const unpinnedOld = stop('unpinned-old', '2026-10-22T07:00:00Z', 15.5, null);
        const pinned = stop('pinned', '2026-10-22T10:00:00Z', 15.6, 32.7);

        expect(orderByRoute([unpinnedNew, pinned, unpinnedOld], KHARTOUM).map((s) => s.id)).toEqual([
            'pinned',
            'unpinned-old',
            'unpinned-new',
        ]);
    });

    it('breaks equal distances by creation time', () => {
        const older = stop('older', '2026-10-22T08:00:00Z', 15.6, 32.5599);
        const newer = stop('newer', '2026-10-22T09:00:00Z', 15.6, 32.5599);

        expect(orderByRoute([newer, older], KHARTOUM).map((s) => s.id)).toEqual(['older', 'newer']);
    });

    it('returns a new array and leaves the input untouched', () => {
        const stops = [
            stop('b', '2026-10-22T09:00:00Z', 15.6, 32.6),
            stop('a', '2026-10-22T08:00:00Z', 15.5, 32.55),
        ];
        const snapshot = [...stops];

        const ordered = orderByRoute(stops, KHARTOUM);

        expect(ordered).not.toBe(stops);
        expect(stops).toEqual(snapshot);
    });
});

import { describe, expect, it } from 'vitest';
import { cartUnitPrice, orderUnitPrice } from '../../src/lib/pricing';

// Prices come from the backend (effective_price); these helpers only choose which snapshot to show.

describe('cartUnitPrice', () => {
    it('prefers the live catalogue, then the price snapshotted when the line was added', () => {
        const item = { price: 1000, discountPercentage: 15, effectivePrice: 850 };
        expect(cartUnitPrice(item, { effectivePrice: 800 })).toBe(800);
        expect(cartUnitPrice(item)).toBe(850);
    });

    it('falls back to the Product Discount for carts persisted before effective prices', () => {
        const legacy = { price: 1999, discountPercentage: 33 } as { price: number; discountPercentage: number; effectivePrice: number };
        expect(cartUnitPrice(legacy)).toBe(1339.33);
        expect(cartUnitPrice({ price: 1000, discountPercentage: 0 } as typeof legacy)).toBe(1000);
    });
});

describe('orderUnitPrice', () => {
    it('reads the snapshotted effective unit price, else derives it from the Discount, else nothing', () => {
        expect(orderUnitPrice({ unit_price: 1000, discount_percentage: 15, effective_unit_price: 700 })).toBe(700);
        expect(orderUnitPrice({ unit_price: 1000, discount_percentage: 15 })).toBe(850);
        expect(orderUnitPrice({})).toBeNull();
    });
});

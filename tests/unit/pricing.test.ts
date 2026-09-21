import { describe, expect, it } from 'vitest';
import { cartLineKey, cartLineUnavailable, cartUnitPrice, orderUnitPrice } from '../../src/lib/pricing';

// Prices come from the backend (effective_price); these helpers only choose which snapshot to show.

describe('cartUnitPrice', () => {
    it('prefers the live catalogue, then the price snapshotted when the line was added', () => {
        const item = { price: 1000, discountPercentage: 15, effectivePrice: 850, variantId: null };
        expect(cartUnitPrice(item, { effectivePrice: 800, variants: [] })).toBe(800);
        expect(cartUnitPrice(item)).toBe(850);
    });

    it('prices a Variant line from the live Variant, and keeps its snapshot if the Variant is gone', () => {
        const variant = { id: 'v1', name_ar: 'روز', name_en: 'Rose', price: 1200, effectivePrice: 1100, pricingRule: null };
        const item = { price: 1200, discountPercentage: 0, effectivePrice: 1200, variantId: 'v1' };
        expect(cartUnitPrice(item, { effectivePrice: 800, variants: [variant] })).toBe(1100);
        expect(cartUnitPrice(item, { effectivePrice: 800, variants: [] })).toBe(1200);
        expect(cartLineUnavailable(item, { variants: [variant] })).toBe(false);
        expect(cartLineUnavailable(item, { variants: [] })).toBe(true);
        expect(cartLineUnavailable({ variantId: null }, { variants: [] })).toBe(false);
        expect(cartLineUnavailable(item)).toBe(false);
    });

    it('falls back to the Product Discount for carts persisted before effective prices', () => {
        const legacy = { price: 1999, discountPercentage: 33 } as { price: number; discountPercentage: number; effectivePrice: number; variantId: null };
        expect(cartUnitPrice(legacy)).toBe(1339.33);
        expect(cartUnitPrice({ price: 1000, discountPercentage: 0 } as typeof legacy)).toBe(1000);
    });
});

describe('cartLineKey', () => {
    it('separates the same Product in two Variants and merges a Product without one', () => {
        expect(cartLineKey({ productId: 'p', variantId: 'a' })).not.toBe(cartLineKey({ productId: 'p', variantId: 'b' }));
        expect(cartLineKey({ productId: 'p', variantId: null })).toBe(cartLineKey({ productId: 'p', variantId: null }));
    });
});

describe('orderUnitPrice', () => {
    it('reads the snapshotted effective unit price, else derives it from the Discount, else nothing', () => {
        expect(orderUnitPrice({ unit_price: 1000, discount_percentage: 15, effective_unit_price: 700 })).toBe(700);
        expect(orderUnitPrice({ unit_price: 1000, discount_percentage: 15 })).toBe(850);
        expect(orderUnitPrice({})).toBeNull();
    });
});

import { describe, expect, it } from 'vitest';
import { discountedPrice } from '../../src/lib/pricing';

describe('discountedPrice', () => {
    it('returns the price unchanged without a discount', () => {
        expect(discountedPrice(1000, 0)).toBe(1000);
        expect(discountedPrice(1000, null)).toBe(1000);
        expect(discountedPrice(1000, undefined)).toBe(1000);
    });

    it('applies a percentage discount rounded to 2 decimals, matching checkout_order', () => {
        expect(discountedPrice(1000, 15)).toBe(850);
        expect(discountedPrice(1999, 33)).toBe(1339.33);
    });
});

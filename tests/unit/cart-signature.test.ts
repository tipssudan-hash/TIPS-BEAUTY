import { describe, expect, it } from 'vitest';
import { cartSignature } from '@domain/valueObjects';

const a = { productId: 'p1', variantId: null, quantity: 2 };
const b = { productId: 'p1', variantId: 'red', quantity: 1 };
const c = { productId: 'p2', variantId: null, quantity: 3 };

describe('cartSignature', () => {
    it('is the same whatever order the lines are in', () => {
        expect(cartSignature([a, b, c])).toBe(cartSignature([c, a, b]));
        expect(cartSignature([a, b, c])).toBe(cartSignature([b, c, a]));
    });

    it('changes when a quantity changes', () => {
        expect(cartSignature([a, b])).not.toBe(cartSignature([{ ...a, quantity: 3 }, b]));
    });

    it('tells Variants of the same Product apart', () => {
        expect(cartSignature([b])).not.toBe(cartSignature([{ ...b, variantId: 'blue' }]));
    });

    it('is empty for an empty Cart', () => {
        expect(cartSignature([])).toBe('');
    });
});

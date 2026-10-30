import { describe, expect, it } from 'vitest';
import type { CartItem } from '@domain/entities';
import { productQuantityInCart, reconcileCartWithStock, remainingStock } from '@domain/valueObjects';

function line(productId: string, quantity: number, variantId: string | null = null, name = productId): CartItem {
    return {
        productId,
        variantId,
        variantName: variantId,
        name_ar: name,
        image: '',
        price: 100,
        discountPercentage: 0,
        effectivePrice: 100,
        pricingRule: null,
        quantity,
    };
}

// What StoreContext.addToCart does with the stock cap: it takes the smaller of the request and the room left.
function addAllowed(cart: CartItem[], productId: string, stock: number, requested: number): number {
    return Math.min(requested, remainingStock(cart, productId, stock));
}

describe('addToCart stays within stock', () => {
    it('caps a new line at the stock', () => {
        expect(addAllowed([], 'p1', 3, 5)).toBe(3);
    });

    it('counts units already in the Cart for the same Product', () => {
        const cart = [line('p1', 2)];
        expect(addAllowed(cart, 'p1', 5, 4)).toBe(3);
    });

    it('counts every Variant of a Product against its one stock figure', () => {
        const cart = [line('p1', 2, 'red'), line('p1', 2, 'blue')];
        expect(productQuantityInCart(cart, 'p1')).toBe(4);
        expect(addAllowed(cart, 'p1', 5, 3)).toBe(1);
    });

    it('does not count other Products', () => {
        const cart = [line('p2', 9)];
        expect(addAllowed(cart, 'p1', 5, 5)).toBe(5);
    });

    it('allows nothing once the stock is reached', () => {
        const cart = [line('p1', 5)];
        expect(addAllowed(cart, 'p1', 5, 1)).toBe(0);
    });
});

describe('reconcileCartWithStock', () => {
    it('trims the last lines of an over-ordered Product first', () => {
        const cart = [line('p1', 2, 'red', 'Lip'), line('p1', 3, 'blue', 'Lip')];
        const result = reconcileCartWithStock(cart, new Map([['p1', 4]]));

        expect(result.cart.map((i) => [i.variantId, i.quantity])).toEqual([['red', 2], ['blue', 2]]);
        expect(result.adjustments).toEqual([{ productId: 'p1', name_ar: 'Lip', from: 5, to: 4 }]);
    });

    it('removes a line whose Product is out of stock and reports it', () => {
        const cart = [line('p1', 2, null, 'Serum'), line('p2', 1)];
        const result = reconcileCartWithStock(cart, new Map([['p1', 0], ['p2', 1]]));

        expect(result.cart.map((i) => i.productId)).toEqual(['p2']);
        expect(result.adjustments).toEqual([{ productId: 'p1', name_ar: 'Serum', from: 2, to: 0 }]);
    });

    it('leaves a Cart that is within stock untouched', () => {
        const cart = [line('p1', 2)];
        const result = reconcileCartWithStock(cart, new Map([['p1', 10]]));

        expect(result.cart).toEqual(cart);
        expect(result.adjustments).toEqual([]);
    });

    it('ignores Products the live catalogue no longer lists', () => {
        const cart = [line('gone', 7)];
        const result = reconcileCartWithStock(cart, new Map([['p1', 1]]));

        expect(result.cart).toEqual(cart);
        expect(result.adjustments).toEqual([]);
    });
});

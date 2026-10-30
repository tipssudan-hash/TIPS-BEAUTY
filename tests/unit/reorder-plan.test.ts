import { describe, expect, it } from 'vitest';
import type { Product } from '@domain/entities';
import { planReorder } from '@application/services/reorder';

function product(id: string, overrides: Partial<Product> = {}): Product {
    return {
        id,
        name_ar: id,
        name_en: id,
        price: 100,
        discountPercentage: 0,
        effectivePrice: 100,
        pricingRule: null,
        category: '',
        brand: '',
        image: '',
        images: [],
        description: '',
        benefits: [],
        ingredients: [],
        usage: '',
        origin: '',
        expiry: '',
        stock: 5,
        isImported: false,
        skinType: [],
        rating: 0,
        reviewCount: 0,
        variants: [],
        createdAt: '2026-01-01T00:00:00Z',
        ...overrides,
    };
}

describe('planReorder', () => {
    it('keeps lines whose Product and Variant are still sellable', () => {
        const shade = { id: 'v1', name_ar: 'Rose', name_en: 'Rose', price: null, effectivePrice: 120, pricingRule: null };
        const products = [product('p1', { variants: [shade] }), product('p2')];
        const plan = planReorder([{ id: 'p1', variant_id: 'v1', quantity: 2 }, { id: 'p2', variant_id: null, quantity: 1 }], products);

        expect(plan.skipped).toBe(0);
        expect(plan.lines.map((l) => [l.product.id, l.variant?.id ?? null, l.quantity])).toEqual([['p1', 'v1', 2], ['p2', null, 1]]);
    });

    it('skips a Product that is gone, removed or out of stock', () => {
        const products = [product('p1', { stock: 0 }), product('p2', { isRemoved: true })];
        const plan = planReorder([
            { id: 'p1', variant_id: null, quantity: 1 },
            { id: 'p2', variant_id: null, quantity: 1 },
            { id: 'missing', variant_id: null, quantity: 1 },
        ], products);

        expect(plan.lines).toEqual([]);
        expect(plan.skipped).toBe(3);
    });

    it('skips a line whose Variant no longer exists', () => {
        const plan = planReorder([{ id: 'p1', variant_id: 'gone', quantity: 1 }], [product('p1')]);

        expect(plan.lines).toEqual([]);
        expect(plan.skipped).toBe(1);
    });
});

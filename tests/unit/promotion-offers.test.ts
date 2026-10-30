import { describe, expect, it } from 'vitest';
import type { Offer } from '@domain/entities';
import { formatSDG } from '@application/services/format';
import { isCartOffer, offerValueLabel, productCartOffer, offerTargetsProduct } from '@application/services/offers';

function offer(over: Partial<Offer>): Offer {
    return {
        id: 'offer-1',
        title: 'عرض',
        description: null,
        promotionType: 'item_discount',
        discountType: 'percentage',
        discountValue: 10,
        buyQuantity: null,
        getQuantity: null,
        getDiscountPercent: null,
        tiers: [],
        bundlePrice: null,
        bundleItems: [],
        targetKind: 'all',
        targetValue: null,
        endsAt: null,
        productIds: [],
        ...over,
    };
}

const product = { id: 'prod-1', category: 'المكياج', brand: 'Nivea' };

describe('promotion labels', () => {
    it('states buy-X-get-Y, free or discounted', () => {
        expect(offerValueLabel(offer({ promotionType: 'buy_x_get_y', buyQuantity: 2, getQuantity: 1, getDiscountPercent: 100 }))).toBe('اشترِ 2 واحصل على 1 مجاناً');
        expect(offerValueLabel(offer({ promotionType: 'buy_x_get_y', buyQuantity: 2, getQuantity: 1, getDiscountPercent: 50 }))).toBe('اشترِ 2 واحصل على 1 بخصم 50%');
    });

    it('states each quantity tier from the smallest, joined in one line', () => {
        expect(offerValueLabel(offer({ promotionType: 'quantity_tier', tiers: [{ minQuantity: 3, percent: 10 }] }))).toBe('خصم 10% عند شراء 3+');
        expect(offerValueLabel(offer({ promotionType: 'quantity_tier', tiers: [{ minQuantity: 6, percent: 20 }, { minQuantity: 3, percent: 10 }] })))
            .toBe('خصم 10% عند شراء 3+ · خصم 20% عند شراء 6+');
    });

    it('states a bundle by its price', () => {
        expect(offerValueLabel(offer({ promotionType: 'bundle', bundlePrice: 5000 }))).toBe(`حزمة بسعر ${formatSDG(5000)}`);
    });

    it('keeps the item discount wording for item discounts', () => {
        expect(offerValueLabel(offer({ discountType: 'percentage', discountValue: 15 }))).toBe('خصم 15%');
        expect(offerValueLabel(offer({ discountType: 'fixed', discountValue: 500 }))).toBe(`خصم ${formatSDG(500)}`);
    });
});

describe('cart-shaping promotion badge', () => {
    it('is only for promotions that are not item discounts', () => {
        expect(isCartOffer(offer({ promotionType: 'item_discount' }))).toBe(false);
        expect(isCartOffer(offer({ promotionType: 'bundle' }))).toBe(true);
    });

    it('matches a Category or Brand target by the Product name, and a listed Product by id', () => {
        const byCategory = offer({ promotionType: 'quantity_tier', targetKind: 'category', targetValue: 'المكياج' });
        const byBrand = offer({ promotionType: 'quantity_tier', targetKind: 'brand', targetValue: 'Nivea' });
        const listed = offer({ promotionType: 'bundle', targetKind: 'products', productIds: ['prod-1'] });
        expect(offerTargetsProduct(byCategory, product)).toBe(true);
        expect(offerTargetsProduct(byBrand, product)).toBe(true);
        expect(offerTargetsProduct(listed, product)).toBe(true);
        expect(offerTargetsProduct(offer({ targetKind: 'category', targetValue: 'العطور' }), product)).toBe(false);
        expect(offerTargetsProduct(offer({ targetKind: 'products', productIds: ['prod-2'] }), product)).toBe(false);
    });

    it('badges a product only through a running cart-shaping promotion that targets it', () => {
        const tier = offer({ id: 'tier', promotionType: 'quantity_tier', targetKind: 'brand', targetValue: 'Nivea', tiers: [{ minQuantity: 3, percent: 10 }] });
        const item = offer({ id: 'item', promotionType: 'item_discount', targetKind: 'all' });
        expect(productCartOffer([item, tier], product)?.id).toBe('tier');
        expect(productCartOffer([item], product)).toBeNull();
        expect(productCartOffer([tier], { id: 'prod-9', category: 'العطور', brand: 'Dove' })).toBeNull();
        expect(productCartOffer([], product)).toBeNull();
    });
});

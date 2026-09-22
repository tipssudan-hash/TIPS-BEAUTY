import { describe, expect, it } from 'vitest';
import { offerEndsLabel, offerScopeLabel, offerValueLabel } from '../../src/lib/offers';

describe('offer copy', () => {
    it('says how much, on what, and until when in the glossary words', () => {
        expect(offerValueLabel({ discountType: 'percentage', discountValue: 20 })).toBe('خصم 20%');
        expect(offerValueLabel({ discountType: 'fixed', discountValue: 500 })).toContain('خصم');
        expect(offerScopeLabel({ targetKind: 'all', targetValue: null })).toBe('على كل المنتجات');
        expect(offerScopeLabel({ targetKind: 'brand', targetValue: 'Nivea' })).toBe('على منتجات Nivea');
        const now = new Date('2026-09-22T10:00:00Z');
        expect(offerEndsLabel({ endsAt: null }, now)).toBe('العرض مستمر');
        expect(offerEndsLabel({ endsAt: '2026-09-22T20:00:00Z' }, now)).toBe('ينتهي اليوم');
        expect(offerEndsLabel({ endsAt: '2026-09-23T20:00:00Z' }, now)).toBe('ينتهي غداً');
        expect(offerEndsLabel({ endsAt: '2026-09-26T20:00:00Z' }, now)).toBe('ينتهي خلال 5 أيام');
    });
});

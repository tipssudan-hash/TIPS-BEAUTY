import type { Offer, Product } from '../../domain/entities';
import { formatSDG, formatDate } from './format';

// Copy for an Offer, in the glossary's words (Promotion = العرض; never "sale"/"deal").

type OfferTerms = Pick<Offer, 'promotionType' | 'discountType' | 'discountValue' | 'buyQuantity' | 'getQuantity' | 'getDiscountPercent' | 'tiers' | 'bundlePrice'>;

export function offerValueLabel(o: OfferTerms): string {
    switch (o.promotionType) {
        case 'buy_x_get_y': return buyXGetYLabel(o);
        case 'quantity_tier': return quantityTierLabel(o.tiers);
        case 'bundle': return o.bundlePrice == null ? 'حزمة منتجات' : `حزمة بسعر ${formatSDG(o.bundlePrice)}`;
        default: return itemDiscountLabel(o);
    }
}

function itemDiscountLabel(o: Pick<Offer, 'discountType' | 'discountValue'>): string {
    return o.discountType === 'percentage' ? `خصم ${o.discountValue}%` : `خصم ${formatSDG(o.discountValue)}`;
}

function buyXGetYLabel(o: Pick<Offer, 'buyQuantity' | 'getQuantity' | 'getDiscountPercent'>): string {
    const free = o.getDiscountPercent === 100 ? 'مجاناً' : `بخصم ${o.getDiscountPercent}%`;
    return `اشترِ ${o.buyQuantity} واحصل على ${o.getQuantity} ${free}`;
}

function quantityTierLabel(tiers: Pick<Offer, 'tiers'>['tiers']): string {
    if (tiers.length === 0) return 'خصم على الكمية';
    return [...tiers]
        .sort((a, b) => a.minQuantity - b.minQuantity)
        .map((t) => `خصم ${t.percent}% عند شراء ${t.minQuantity}+`)
        .join(' · ');
}

export function offerScopeLabel(o: Pick<Offer, 'targetKind' | 'targetValue'>): string {
    switch (o.targetKind) {
        case 'category': return `على تصنيف ${o.targetValue ?? ''}`;
        case 'brand': return `على منتجات ${o.targetValue ?? ''}`;
        case 'products': return 'على منتجات مختارة';
        default: return 'على كل المنتجات';
    }
}

export function offerEndsLabel(o: Pick<Offer, 'endsAt'>, now: Date = new Date()): string {
    if (!o.endsAt) return 'العرض مستمر';
    const hours = (new Date(o.endsAt).getTime() - now.getTime()) / 3_600_000;
    if (hours < 24) return 'ينتهي اليوم';
    if (hours < 48) return 'ينتهي غداً';
    const days = Math.ceil(hours / 24);
    if (days <= 7) return `ينتهي خلال ${days} أيام`;
    return `حتى ${formatDate(o.endsAt)}`;
}

// Cart-shaping Promotions (buy X get Y, quantity tiers, bundles) change no single price, so the
// Product page badges them instead of striking through the price.
export function isCartOffer(o: Pick<Offer, 'promotionType'>): boolean {
    return o.promotionType !== 'item_discount';
}

// Whether a running Offer targets this Product. The Product list an Offer carries can be short
// (a few Products shown), so a Category or Brand target also matches by the Product's own name.
export function offerTargetsProduct(o: Pick<Offer, 'targetKind' | 'targetValue' | 'productIds'>, product: Pick<Product, 'id' | 'category' | 'brand'>): boolean {
    if (o.targetKind === 'all') return true;
    if (o.productIds.includes(product.id)) return true;
    if (o.targetKind === 'category') return o.targetValue != null && o.targetValue === product.category;
    if (o.targetKind === 'brand') return o.targetValue != null && o.targetValue === product.brand;
    return false;
}

export function productCartOffer(offers: Offer[], product: Pick<Product, 'id' | 'category' | 'brand'>): Offer | null {
    return offers.find((o) => isCartOffer(o) && offerTargetsProduct(o, product)) ?? null;
}

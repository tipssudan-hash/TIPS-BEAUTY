import type { Offer } from '../types';
import { formatSDG, formatDate } from './format';

// Copy for an Offer, in the glossary's words (Promotion = العرض; never "sale"/"deal").

export function offerValueLabel(o: Pick<Offer, 'discountType' | 'discountValue'>): string {
    return o.discountType === 'percentage' ? `خصم ${o.discountValue}%` : `خصم ${formatSDG(o.discountValue)}`;
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

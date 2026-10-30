import type { OrderItem } from './adminApi';
import { PROMOTION_TYPE_LABELS } from './catalogApi';

// Prices are decided by the backend; order lines snapshot the effective unit price and the winning
// Pricing Rule (T2-07). Orders placed before that carry only the Product's Discount.

export function orderUnitPrice(item: Pick<OrderItem, 'unit_price' | 'discount_percentage' | 'effective_unit_price'>): number | null {
    if (item.effective_unit_price != null) return Number(item.effective_unit_price);
    if (item.unit_price == null) return null;
    const pct = item.discount_percentage ?? 0;
    return pct > 0 ? Number((item.unit_price * (1 - pct / 100)).toFixed(2)) : item.unit_price;
}

export function orderLineRuleLabel(item: Pick<OrderItem, 'discount_percentage' | 'pricing_rule_kind' | 'pricing_rule_label' | 'promotion_type'>): string | null {
    if (item.pricing_rule_label && item.pricing_rule_kind === 'promotion' && item.promotion_type && PROMOTION_TYPE_LABELS[item.promotion_type]) {
        return `${PROMOTION_TYPE_LABELS[item.promotion_type]}: ${item.pricing_rule_label}`;
    }
    if (item.pricing_rule_label) return item.pricing_rule_label;
    return item.discount_percentage ? `خصم ${item.discount_percentage}%` : null;
}

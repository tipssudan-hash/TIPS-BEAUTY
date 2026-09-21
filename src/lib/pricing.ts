import type { CartItem, OrderItem } from '../types';

// Prices are decided by the backend (effective_price). The Storefront only reads them back.

// A Cart line's unit price as the catalogue showed it; carts persisted before effective prices
// existed fall back to the Product's own Discount.
export function cartUnitPrice(item: Pick<CartItem, 'price' | 'discountPercentage' | 'effectivePrice'>): number {
    if (typeof item.effectivePrice === 'number' && Number.isFinite(item.effectivePrice)) return item.effectivePrice;
    return discountedPrice(item.price, item.discountPercentage);
}

// An Order line's unit price as charged; orders placed before the snapshot carried it fall back
// to the Product's own Discount at the time.
export function orderUnitPrice(item: Pick<OrderItem, 'unit_price' | 'discount_percentage' | 'effective_unit_price'>): number | null {
    if (item.effective_unit_price != null) return Number(item.effective_unit_price);
    if (item.unit_price != null) return discountedPrice(Number(item.unit_price), item.discount_percentage);
    return null;
}

// Legacy fallback only (matches the pre-T2-07 checkout_order arithmetic).
export function discountedPrice(price: number, discountPercentage: number | null | undefined): number {
    const pct = discountPercentage ?? 0;
    return pct > 0 ? Number((price * (1 - pct / 100)).toFixed(2)) : price;
}

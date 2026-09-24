import type { CartItem, OrderItem, Product } from '../entities';

// Prices are decided by the backend (effective_price). The Storefront only reads them back.

// Cart lines are keyed by (Product, Variant): the same Product in two Variants is two lines.
export function cartLineKey(item: Pick<CartItem, 'productId' | 'variantId'>): string {
    return `${item.productId}:${item.variantId ?? ''}`;
}

// A Variant line whose Variant the live catalogue no longer has: checkout would refuse it, so the
// pages flag it and block the Order instead of pricing it from the stale snapshot.
export function cartLineUnavailable(item: Pick<CartItem, 'variantId'>, live?: Pick<Product, 'variants'>): boolean {
    return Boolean(live && item.variantId && !live.variants.some((v) => v.id === item.variantId));
}

// A Cart line's unit price. The live catalogue wins (a Promotion may have started or ended since
// the line was added) — for a Variant line, the live Variant's price; otherwise the price
// snapshotted when it was added; carts persisted before effective prices existed fall back to the
// Product's own Discount.
export function cartUnitPrice(item: Pick<CartItem, 'price' | 'discountPercentage' | 'effectivePrice' | 'variantId'>, live?: Pick<Product, 'effectivePrice' | 'variants'>): number {
    if (live) {
        const variant = item.variantId ? live.variants.find((v) => v.id === item.variantId) : undefined;
        if (variant) return variant.effectivePrice;
        if (!item.variantId) return live.effectivePrice;
        // The Variant was removed from the Product since (see cartLineUnavailable): keep the snapshot.
    }
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
function discountedPrice(price: number, discountPercentage: number | null | undefined): number {
    const pct = discountPercentage ?? 0;
    return pct > 0 ? Number((price * (1 - pct / 100)).toFixed(2)) : price;
}

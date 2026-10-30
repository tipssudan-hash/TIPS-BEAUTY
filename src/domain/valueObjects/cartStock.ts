import type { CartItem } from '../entities/cart';

// Stock belongs to the Product and is shared by all its Variants (ADR 0001), so limits apply to the Product's total in the Cart.
export function productQuantityInCart(cart: Pick<CartItem, 'productId' | 'quantity'>[], productId: string): number {
    return cart.reduce((sum, item) => (item.productId === productId ? sum + item.quantity : sum), 0);
}

// How many more units of a Product the Cart can take before reaching its stock.
export function remainingStock(cart: Pick<CartItem, 'productId' | 'quantity'>[], productId: string, stock: number): number {
    return Math.max(stock - productQuantityInCart(cart, productId), 0);
}

export interface StockAdjustment {
    productId: string;
    name_ar: string;
    from: number;
    to: number;
}

// Brings Cart lines back under live stock. The last lines of an over-ordered Product give up their units first.
export function reconcileCartWithStock<T extends Pick<CartItem, 'productId' | 'quantity' | 'name_ar'>>(
    cart: T[],
    stockById: ReadonlyMap<string, number>,
): { cart: T[]; adjustments: StockAdjustment[] } {
    const quantities = cart.map((item) => item.quantity);
    const remaining = new Map<string, number>();
    for (const [productId, stock] of stockById) remaining.set(productId, Math.max(stock, 0));

    for (let i = 0; i < cart.length; i++) {
        const left = remaining.get(cart[i].productId);
        if (left === undefined) continue;
        const kept = Math.min(quantities[i], left);
        remaining.set(cart[i].productId, left - kept);
        quantities[i] = kept;
    }

    const next = cart
        .map((item, i) => (quantities[i] === item.quantity ? item : { ...item, quantity: quantities[i] }))
        .filter((item) => item.quantity > 0);

    const adjustments: StockAdjustment[] = [];
    for (const productId of stockById.keys()) {
        const from = productQuantityInCart(cart, productId);
        const to = productQuantityInCart(next, productId);
        if (from !== to) {
            const name_ar = cart.find((item) => item.productId === productId)?.name_ar ?? '';
            adjustments.push({ productId, name_ar, from, to });
        }
    }
    return { cart: next, adjustments };
}

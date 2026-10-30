import type { CartItem } from '../entities/cart';
import { cartLineKey } from './pricing';

// Order-independent: the same lines in another order describe the same Order attempt, so they get the same hash input.
export function cartSignature(cart: Pick<CartItem, 'productId' | 'variantId' | 'quantity'>[]): string {
    return cart
        .map((item) => `${cartLineKey(item)}:${item.quantity}`)
        .sort()
        .join(',');
}

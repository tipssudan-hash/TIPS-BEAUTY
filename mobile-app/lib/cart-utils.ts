import type { CartItem, Product } from "@/lib/tips-api";

/** Returns the total number of individual units, not merely distinct product lines. */
export function getCartItemCount(cart: CartItem[]): number {
  return cart.reduce((total, item) => total + item.quantity, 0);
}

/** Adds one unit of a product while retaining any existing quantity. */
export function addProductToCart(cart: CartItem[], product: Product): CartItem[] {
  const existing = cart.find((item) => item.id === product.id);
  if (!existing) return [...cart, { ...product, quantity: 1 }];
  return cart.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
}

/** Changes a product quantity and removes its line when quantity reaches zero. */
export function setCartItemQuantity(cart: CartItem[], id: string, quantity: number): CartItem[] {
  if (quantity <= 0) return cart.filter((item) => item.id !== id);
  return cart.map((item) => item.id === id ? { ...item, quantity } : item);
}

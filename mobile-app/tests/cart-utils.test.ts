import { describe, expect, it } from "vitest";
import { addProductToCart, getCartItemCount, setCartItemQuantity } from "../lib/cart-utils";
import type { Product } from "../lib/tips-api";

const product = {
  id: "product-1",
  name_ar: "منتج تجريبي",
  price: 1000,
  category: "المكياج",
  image: null,
} as Product;

describe("cart quantity helpers", () => {
  it("adds a product and reports one individual unit", () => {
    const cart = addProductToCart([], product);
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(1);
    expect(getCartItemCount(cart)).toBe(1);
  });

  it("increments an existing product without duplicating its cart line", () => {
    const once = addProductToCart([], product);
    const twice = addProductToCart(once, product);
    expect(twice).toHaveLength(1);
    expect(twice[0].quantity).toBe(2);
    expect(getCartItemCount(twice)).toBe(2);
  });

  it("removes the product when quantity is reduced to zero", () => {
    const cart = setCartItemQuantity([{ ...product, quantity: 1 }], product.id, 0);
    expect(cart).toEqual([]);
    expect(getCartItemCount(cart)).toBe(0);
  });
});

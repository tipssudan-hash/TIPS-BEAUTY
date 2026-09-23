import { describe, expect, it } from "vitest";
import { sortCatalogProducts } from "../lib/product-sorting";
import { buildWishlistShareMessage, getWhatsAppShareUrl } from "../lib/wishlist-share";
import type { Product } from "../lib/tips-api";

const products = [
  { id: "a", name_ar: "عطر", price: 22000, discount_percentage: 20, brand: "Jasmine", sales_count: 6, average_rating: 4.4, reviews_count: 4, created_at: "2026-08-01T00:00:00Z" },
  { id: "b", name_ar: "ماسكارا", price: 15000, discount_percentage: 10, brand: "Maybelline", sales_count: 11, average_rating: 4.8, reviews_count: 7, created_at: "2026-09-01T00:00:00Z" },
  { id: "c", name_ar: "مرطب", price: 9000, discount_percentage: 5, brand: "Nivea", sales_count: 3, average_rating: 4.9, reviews_count: 2, created_at: "2026-07-01T00:00:00Z" },
] as Product[];

describe("advanced catalog sorting", () => {
  it("orders products by sales count", () => {
    expect(sortCatalogProducts(products, "best_selling").map((product) => product.id)).toEqual(["b", "a", "c"]);
  });

  it("orders products by rating and by discount", () => {
    expect(sortCatalogProducts(products, "rating").map((product) => product.id)).toEqual(["c", "b", "a"]);
    expect(sortCatalogProducts(products, "discount").map((product) => product.id)).toEqual(["a", "b", "c"]);
  });
});

describe("wishlist sharing", () => {
  it("builds a customer-safe WhatsApp message", () => {
    const message = buildWishlistShareMessage(products.slice(0, 2));
    expect(message).toContain("عطر");
    expect(message).toContain("ماسكارا");
    expect(message).not.toContain("customer_id");
    expect(getWhatsAppShareUrl(message)).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });
});

import { describe, expect, it } from "vitest";
import { EMPTY_CATALOG_FILTERS, filterCatalogProducts, getCatalogBrands } from "../lib/catalog-filters";
import { favoriteProducts, toggleFavoriteId } from "../lib/favorites-utils";
import type { Product } from "../lib/tips-api";

const products = [
  { id: "makeup-1", name_ar: "ماسكارا", price: 15000, discount_percentage: 10, category: "المكياج", brand: "Maybelline", stock: 5 },
  { id: "skin-1", name_ar: "مرطب", price: 9000, category: "العناية بالبشرة", brand: "Nivea", stock: 0 },
  { id: "hair-1", name_ar: "زيت شعر", price: 16000, category: "العناية بالشعر", brand: "OGX", stock: 3 },
] as Product[];

describe("catalog filters", () => {
  it("filters discounted price, brand, and availability together", () => {
    const result = filterCatalogProducts(products, { minPrice: "10000", maxPrice: "14000", brand: "Maybelline", inStockOnly: true });
    expect(result.map((product) => product.id)).toEqual(["makeup-1"]);
  });

  it("removes unavailable products when availability filter is enabled", () => {
    const result = filterCatalogProducts(products, { ...EMPTY_CATALOG_FILTERS, inStockOnly: true });
    expect(result.map((product) => product.id)).toEqual(["makeup-1", "hair-1"]);
  });

  it("returns an ordered, unique brand list", () => {
    expect(getCatalogBrands(products)).toEqual(["Maybelline", "Nivea", "OGX"]);
  });
});

describe("customer favorites", () => {
  it("adds and removes a favorite id deterministically", () => {
    const added = toggleFavoriteId([], "hair-1");
    expect(added).toEqual(["hair-1"]);
    expect(toggleFavoriteId(added, "hair-1")).toEqual([]);
  });

  it("returns only favorite products in catalog order", () => {
    expect(favoriteProducts(products, ["hair-1", "makeup-1"]).map((product) => product.id)).toEqual(["makeup-1", "hair-1"]);
  });
});

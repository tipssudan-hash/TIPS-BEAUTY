import type { Product } from "@/lib/tips-api";

export type CatalogFilters = {
  minPrice: string;
  maxPrice: string;
  brand: string;
  inStockOnly: boolean;
};

export const EMPTY_CATALOG_FILTERS: CatalogFilters = {
  minPrice: "",
  maxPrice: "",
  brand: "",
  inStockOnly: false,
};

export function getProductPrice(product: Pick<Product, "price" | "discount_percentage">): number {
  return Number(product.price) * (1 - Number(product.discount_percentage || 0) / 100);
}

export function getCatalogBrands(products: Product[]): string[] {
  return [...new Set(products.map((product) => product.brand?.trim()).filter((brand): brand is string => Boolean(brand)))].sort((a, b) => a.localeCompare(b, "ar"));
}

export function filterCatalogProducts(products: Product[], filters: CatalogFilters): Product[] {
  const minPrice = filters.minPrice.trim() ? Number(filters.minPrice) : null;
  const maxPrice = filters.maxPrice.trim() ? Number(filters.maxPrice) : null;

  return products.filter((product) => {
    const price = getProductPrice(product);
    const available = product.stock === null || product.stock === undefined || Number(product.stock) > 0;
    return (
      (filters.brand === "" || product.brand === filters.brand) &&
      (!filters.inStockOnly || available) &&
      (minPrice === null || (Number.isFinite(minPrice) && price >= minPrice)) &&
      (maxPrice === null || (Number.isFinite(maxPrice) && price <= maxPrice))
    );
  });
}

export function hasCatalogFilters(filters: CatalogFilters): boolean {
  return Boolean(filters.minPrice || filters.maxPrice || filters.brand || filters.inStockOnly);
}

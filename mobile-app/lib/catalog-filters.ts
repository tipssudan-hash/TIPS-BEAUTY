import type { Product, StorefrontBrand, StorefrontCategory } from "@/lib/tips-api";

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

export function getStorefrontBrands(brands: StorefrontBrand[]): string[] {
  return [...brands]
    .filter((brand) => brand.product_count > 0)
    .sort((a, b) => a.sort_order - b.sort_order || a.name_ar.localeCompare(b.name_ar, "ar"))
    .map((brand) => brand.name_ar);
}

export function getTopLevelCategories(categories: StorefrontCategory[]): StorefrontCategory[] {
  return [...categories]
    .filter((category) => !category.parent_id && category.product_count > 0)
    .sort((a, b) => a.sort_order - b.sort_order || a.name_ar.localeCompare(b.name_ar, "ar"));
}

function categoryScopeIds(categories: StorefrontCategory[], categoryId: string): Set<string> {
  const scope = new Set<string>([categoryId]);
  let frontier = [categoryId];
  while (frontier.length > 0) {
    const children = categories.filter((category) => category.parent_id && frontier.includes(category.parent_id) && !scope.has(category.id)).map((category) => category.id);
    children.forEach((id) => scope.add(id));
    frontier = children;
  }
  return scope;
}

// Without the category list (offline), products are matched by their category name.
export function filterProductsByCategory(products: Product[], categories: StorefrontCategory[] | null, name: string): Product[] {
  const root = categories?.find((category) => category.name_ar === name);
  if (!categories || !root) return products.filter((product) => product.category === name);
  const scope = categoryScopeIds(categories, root.id);
  return products.filter((product) => (product.category_id ? scope.has(product.category_id) : product.category === name));
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

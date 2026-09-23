import type { Product } from "./tips-api";
import { getProductPrice } from "./catalog-filters";

export type CatalogSort = "newest" | "low" | "high" | "best_selling" | "rating" | "discount";

export const CATALOG_SORT_OPTIONS: Array<{ value: CatalogSort; label: string }> = [
  { value: "newest", label: "الأحدث" },
  { value: "best_selling", label: "الأكثر مبيعاً" },
  { value: "rating", label: "الأعلى تقييماً" },
  { value: "discount", label: "أكبر خصم" },
  { value: "low", label: "الأقل سعراً" },
  { value: "high", label: "الأعلى سعراً" },
];

function newestValue(product: Product): number {
  const time = Date.parse(product.created_at || "");
  return Number.isFinite(time) ? time : 0;
}

/** Sorts without mutating the source catalog. Secondary sorts keep results stable. */
export function sortCatalogProducts(products: Product[], sort: CatalogSort): Product[] {
  return [...products].sort((left, right) => {
    const leftPrice = getProductPrice(left);
    const rightPrice = getProductPrice(right);
    const newest = newestValue(right) - newestValue(left);

    if (sort === "low") return leftPrice - rightPrice || newest;
    if (sort === "high") return rightPrice - leftPrice || newest;
    if (sort === "best_selling") return Number(right.sales_count || 0) - Number(left.sales_count || 0) || Number(right.reviews_count || 0) - Number(left.reviews_count || 0) || newest;
    if (sort === "rating") return Number(right.average_rating || 0) - Number(left.average_rating || 0) || Number(right.reviews_count || 0) - Number(left.reviews_count || 0) || newest;
    if (sort === "discount") return Number(right.discount_percentage || 0) - Number(left.discount_percentage || 0) || newest;
    return newest;
  });
}

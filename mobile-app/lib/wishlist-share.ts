import type { Product } from "./tips-api";
import { getDiscountedPrice } from "./tips-api";

export function buildWishlistShareMessage(products: Product[]): string {
  const lines = products.slice(0, 12).map((product, index) => {
    const brand = product.brand ? ` — ${product.brand}` : "";
    return `${index + 1}. ${product.name_ar}${brand} (${getDiscountedPrice(product).toLocaleString("ar-EG")} ج.س)`;
  });
  const overflow = products.length > 12 ? `\n+ ${products.length - 12} منتجات أخرى` : "";
  return `هذه قائمة المنتجات التي أعجبتني من TIPS Beauty:\n${lines.join("\n")}${overflow}\n\nتسوقي من تيبس بيوتي.`;
}

export function getWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

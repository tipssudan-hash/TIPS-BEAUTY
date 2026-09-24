import type { PricingRule } from './product';

export interface CartItem {
  productId: string;
  // One Cart line per (Product, Variant); see cartLineKey.
  variantId: string | null;
  variantName: string | null;
  name_ar: string;
  image: string;
  price: number;
  discountPercentage: number;
  effectivePrice: number;
  pricingRule: PricingRule | null;
  quantity: number;
}

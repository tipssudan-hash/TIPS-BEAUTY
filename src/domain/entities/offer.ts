// A running Promotion as the public sees it (get_active_promotions): what, how much, on what,
// until when, and up to eight matching Products to show. Only an item_discount sets a single
// Product's price; the other types reshape the Cart and are resolved by preview_cart_pricing.
export type PromotionType = 'item_discount' | 'buy_x_get_y' | 'quantity_tier' | 'bundle';

export interface QuantityTier {
  minQuantity: number;
  percent: number;
}

export interface BundleItem {
  productId: string;
  quantity: number;
}

export interface Offer {
  id: string;
  title: string;
  description: string | null;
  promotionType: PromotionType;
  discountType: 'percentage' | 'fixed' | null;
  discountValue: number | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  getDiscountPercent: number | null;
  tiers: QuantityTier[];
  bundlePrice: number | null;
  bundleItems: BundleItem[];
  targetKind: 'all' | 'category' | 'brand' | 'products';
  targetValue: string | null;
  endsAt: string | null;
  productIds: string[];
}

import type { PricingRuleKind } from './product';
import type { PromotionType } from './offer';

// The backend's price of a whole Cart (preview_cart_pricing): what checkout will charge for the
// goods before delivery, line by line and promotion by promotion.
export interface CartPricingLine {
  lineIndex: number;
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  effectiveUnitPrice: number;
  pricingRuleKind: PricingRuleKind | null;
  promotionId: string | null;
  promotionType: PromotionType | null;
}

export interface AppliedPromotion {
  promotionId: string;
  promotionType: PromotionType;
  ruleLabel: string;
  reduction: number;
}

export interface CartPricing {
  lines: CartPricingLine[];
  baseSubtotal: number;
  lineReductions: number;
  subtotal: number;
  appliedPromotions: AppliedPromotion[];
  coupon: { code: string | null; reduction: number; reason: string | null } | null;
}

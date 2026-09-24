// A purchasable option of a Product (shade, size). Stock is per Product (ADR 0001); the price
// and Pricing Rule come from the backend for this Variant (its own price, or the Product's).
export interface ProductVariant {
  id: string;
  name_ar: string;
  name_en: string;
  price: number | null;
  effectivePrice: number;
  pricingRule: PricingRule | null;
}

export type PricingRuleKind = 'discount' | 'promotion';

export interface PricingRule {
  kind: PricingRuleKind;
  label: string;
}

export interface Product {
  id: string;
  name_ar: string;
  name_en: string;
  price: number;
  discountPercentage: number;
  // Decided by the backend (effective_price): the price charged at checkout and the rule that set it.
  effectivePrice: number;
  pricingRule: PricingRule | null;
  category: string;
  brand: string;
  image: string;
  images: string[];
  description: string;
  benefits: string[];
  ingredients: string[];
  usage: string;
  origin: string;
  expiry: string;
  stock: number;
  isImported: boolean;
  skinType: string[];
  rating: number;
  reviewCount: number;
  variants: ProductVariant[];
  createdAt: string;
}

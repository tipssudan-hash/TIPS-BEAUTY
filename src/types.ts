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

export type OrderStatus = 'new' | 'confirmed' | 'preparing' | 'shipped' | 'delivered' | 'cancelled' | 'delivery_failed';
export type PaymentStatus = 'pending' | 'proof_submitted' | 'paid' | 'refunded';

export interface OrderItem {
  id: string;
  quantity: number;
  name_ar?: string;
  variant_id?: string | null;
  variant_name?: string | null;
  unit_price?: number;
  discount_percentage?: number;
  effective_unit_price?: number;
  pricing_rule_kind?: PricingRuleKind | null;
  pricing_rule_label?: string | null;
  promotion_id?: string | null;
  line_total?: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  items: OrderItem[];
  total: number;
  shippingFee: number;
  // Coupon reduction (the code it came from) and points reduction, as charged by the backend.
  couponCode: string | null;
  couponDiscount: number;
  pointsDiscount: number;
  discountAmount: number;
  status: OrderStatus;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  paymentReference: string | null;
  shippingAddress: string;
  city: string | null;
  state: string | null;
  createdAt: string;
}

export type CouponRefusal = 'unknown' | 'inactive' | 'not_started' | 'expired' | 'used_up' | 'customer_limit' | 'below_minimum' | 'not_best';

export interface CouponPreview {
  ok: boolean;
  reason: CouponRefusal | null;
  code: string | null;
  name: string | null;
  reduction: number;
  baseSubtotal: number;
  lineReductions: number;
}

export interface OrderStatusEntry {
  id: string;
  status: OrderStatus;
  note: string | null;
  createdAt: string;
}

export interface PaymentMethod {
  code: string;
  nameAr: string;
  descriptionAr: string | null;
  requiresProof: boolean;
  accountDetails: Record<string, string>;
}

export interface DeliveryZone {
  id: string;
  name: string;
  state: string | null;
  fee: number;
}

export interface Collection {
  id: string;
  slug: string;
  name_ar: string;
  description_ar: string | null;
  icon: string;
  displayOrder: number;
  productIds: string[];
}

export interface Review {
  id: string;
  rating: number;
  comment: string;
  reviewerLabel: string;
  createdAt: string;
  verifiedPurchase: boolean;
}

export interface ReviewableItem {
  orderId: string;
  orderNumber: string;
  productId: string;
  productName: string;
  alreadyReviewed: boolean;
}

import type { PricingRuleKind } from './product';

export type OrderStatus = 'new' | 'confirmed' | 'preparing' | 'shipped' | 'delivered' | 'cancelled' | 'delivery_failed';
export type PaymentStatus = 'pending' | 'proof_submitted' | 'paid' | 'refunded';

export interface OrderItem {
  id: string;
  quantity: number;
  name_ar?: string;
  variant_id?: string | null;
  variant_name?: string | null;
  // The Variant's own price when it had one; unit_price is what the line was charged at.
  variant_price?: number | null;
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

export interface OrderStatusEntry {
  id: string;
  status: OrderStatus;
  note: string | null;
  createdAt: string;
}

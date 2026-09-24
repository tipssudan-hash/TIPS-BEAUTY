// Domain entities barrel export — every consumer imports from here.
export type { Product, ProductVariant, PricingRule, PricingRuleKind } from './product';
export type { Order, OrderItem, OrderStatus, PaymentStatus, OrderStatusEntry } from './order';
export type { CartItem } from './cart';
export type { Offer } from './offer';
export type { Banner, BannerActionType } from './banner';
export type { Collection } from './collection';
export type { DeliveryZone } from './delivery';
export type { PaymentMethod } from './payment';
export type { CustomerNotification } from './notification';
export type { Review, ReviewableItem } from './review';
export type { CouponPreview, CouponRefusal } from './coupon';

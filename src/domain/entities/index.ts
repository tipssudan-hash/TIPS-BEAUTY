// Domain entities barrel export — every consumer imports from here.
export type { Product, ProductVariant, PricingRule, PricingRuleKind } from './product';
export type { Order, OrderItem, OrderStatus, PaymentStatus, OrderStatusEntry, OrderReturn, ReturnItem, ReturnStatus, ReturnResolution } from './order';
export type { CartItem } from './cart';
export type { Offer, PromotionType, QuantityTier, BundleItem } from './offer';
export type { CartPricing, CartPricingLine, AppliedPromotion } from './cartPricing';
export type { Banner, BannerActionType } from './banner';
export type { Collection } from './collection';
export type { Category } from './category';
export type { Brand } from './brand';
export type { DeliveryZone, DeliveryQuote } from './delivery';
export type { PaymentMethod } from './payment';
export type { CustomerNotification } from './notification';
export type { Review, ReviewableItem } from './review';
export type { CouponPreview, CouponRefusal } from './coupon';
export type { CustomerAddress } from './address';
export type { LoyaltyProfile, LoyaltyTier } from './loyalty';

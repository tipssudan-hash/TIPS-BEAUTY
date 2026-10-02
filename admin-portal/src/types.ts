// Stored on products.variants (shape enforced by the products_variants_shape CHECK): the id is
// what an Order line references; price null means "the Product's price". Stock is per Product.
export type ProductVariant = {
    id: string;
    name_ar: string;
    name_en?: string;
    price: number | null;
};

export interface Product {
    id: string;
    name_ar: string;
    name_en: string;
    price: number;
    discount_percentage: number;
    cost_price: number;
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
    is_imported: boolean;
    skin_type: string[];
    reviews_count: number;
    average_rating: number;
    variants: ProductVariant[];
    is_active: boolean;
    weight_grams: number | null;
    length_cm: number | null;
    width_cm: number | null;
    height_cm: number | null;
    created_at: string;
}

export type ProductInput = Omit<Product, 'id' | 'stock' | 'reviews_count' | 'average_rating' | 'created_at'>;

export interface Warehouse {
    id: string;
    name: string;
    code: string;
    state: string;
    city: string;
    address: string | null;
    phone: string | null;
    is_active: boolean;
    // GPS-01: used by calculate_delivery_quote's haversine distance; null until staff set it.
    latitude: number | null;
    longitude: number | null;
    base_dispatch_minutes: number;
}

export interface DeliveryZone {
    id: string;
    name: string;
    fee: number;
    is_active: boolean;
    state: string | null;
    warehouse_id: string | null;
    // GPS-02: the zone's reference point for haversine distance; null until staff set it.
    latitude: number | null;
    longitude: number | null;
}

// GPS-01/03: dynamic delivery pricing formula coefficients. warehouse_id/delivery_zone_id/state
// null together = the one global default row; see docs/specs/gps-delivery-pricing.md.
export interface DeliveryPricingConfig {
    id: string;
    warehouse_id: string | null;
    delivery_zone_id: string | null;
    state: string | null;
    base_fee: number;
    per_km_rate: number;
    weight_multiplier: number;
    road_multiplier: number;
    min_fee: number;
    max_fee: number | null;
    avg_speed_kmh: number;
    is_active: boolean;
}

export interface DeliveryQuote {
    fee: number;
    eta_minutes: number | null;
    source: 'dynamic' | 'flat_fee' | 'flat_fee_missing_coordinates' | 'flat_fee_missing_config';
}

export type DriverStatus = 'active' | 'busy' | 'offline';

// Login linkage lives on the row too: user_email is the linked account (null = not yet linked),
// location_updated_at the last time the driver shared a position (only while delivering).
export interface Driver {
    user_id?: string | null;
    user_email?: string | null;
    location_updated_at?: string | null;
    id: string;
    name: string;
    phone: string;
    company: string | null;
    status: DriverStatus;
    warehouse_id: string | null;
    vehicle: string | null;
}

export interface InventoryRow {
    warehouse_id: string;
    product_id: string;
    quantity: number;
    reorder_level: number;
    product_name: string;
}

export type BannerActionType = 'collection' | 'category' | 'product' | 'url' | 'none';

export interface Banner {
    id: string;
    title_ar: string;
    subtitle_ar: string | null;
    image_url: string;
    action_type: BannerActionType;
    action_value: string | null;
    display_order: number;
    is_active: boolean;
    starts_at: string;
    ends_at: string | null;
}

export type CollectionRuleType = 'manual' | 'newest' | 'best_sellers' | 'discount' | 'price_under' | 'category';

// rule_config keys read by get_storefront_collections: limit (all rules), price (price_under),
// category (category), minimum_discount (discount).
export interface CollectionRuleConfig {
    limit?: number;
    price?: number;
    category?: string;
    minimum_discount?: number;
}

export interface Collection {
    id: string;
    slug: string;
    name_ar: string;
    description_ar: string | null;
    icon: string;
    rule_type: CollectionRuleType;
    rule_config: CollectionRuleConfig;
    display_order: number;
    is_active: boolean;
    product_ids: string[];
}

export type CollectionInput = Omit<Collection, 'id' | 'product_ids'>;

export interface Coupon {
    id: string;
    code: string;
    name: string;
    description: string | null;
    discount_type: 'percentage' | 'fixed';
    discount_value: number;
    max_discount_amount: number | null;
    min_order_amount: number;
    usage_limit: number | null;
    per_user_limit: number;
    usage_count: number;
    starts_at: string;
    ends_at: string | null;
    is_active: boolean;
    affiliate_id?: string | null;
}

export type CouponInput = Omit<Coupon, 'id' | 'usage_count'>;

export interface Affiliate {
    id: string;
    display_name: string;
    code: string;
    phone: string | null;
    email: string | null;
    status: 'pending' | 'active' | 'suspended' | 'rejected';
    commission_rate: number;
    minimum_payout: number;
    payout_method: string | null;
    payout_details: string | null;
    admin_note: string | null;
    total_orders: number;
    total_sales: number;
    total_discount_given: number;
    total_commission_earned: number;
    total_payouts_paid: number;
    pending_balance: number;
    coupons_count: number;
    created_at: string;
}

export interface AffiliateInput {
    display_name: string;
    phone?: string | null;
    email?: string | null;
    commission_rate: number;
    minimum_payout: number;
    payout_method?: string | null;
    payout_details?: string | null;
    admin_note?: string | null;
    status: 'pending' | 'active' | 'suspended' | 'rejected';
}

export interface AffiliatePayout {
    id: string;
    amount: number;
    payout_method: string;
    reference_number: string | null;
    notes: string | null;
    created_at: string;
}

export interface AffiliatePayoutInput {
    affiliate_id: string;
    amount: number;
    payout_method: string;
    reference_number?: string | null;
    notes?: string | null;
}

export interface AffiliateOrder {
    id: string;
    order_number: string;
    customer_name: string;
    phone: string;
    total: number;
    discount_amount: number;
    coupon_code: string | null;
    status: string;
    payment_status: string;
    created_at: string;
}

export interface AffiliateCommission {
    id: string;
    order_id: string;
    order_number: string | null;
    commission_amount: number;
    commission_rate: number;
    status: 'pending' | 'approved' | 'paid' | 'reversed';
    created_at: string;
    paid_at: string | null;
}

export interface AffiliateDetails {
    profile: {
        id: string;
        display_name: string;
        code: string;
        phone: string | null;
        email: string | null;
        status: 'pending' | 'active' | 'suspended' | 'rejected';
        commission_rate: number;
        minimum_payout: number;
        payout_method: string | null;
        payout_details: string | null;
        admin_note: string | null;
        created_at: string;
    };
    stats: {
        total_orders: number;
        total_sales: number;
        total_discount_given: number;
        total_commission_earned: number;
        total_payouts_paid: number;
        pending_balance: number;
    };
    coupons: {
        id: string;
        code: string;
        name: string;
        discount_type: 'percentage' | 'fixed';
        discount_value: number;
        max_discount_amount: number | null;
        usage_count: number;
        is_active: boolean;
        starts_at: string;
        ends_at: string | null;
    }[];
    orders: AffiliateOrder[];
    commissions: AffiliateCommission[];
    payouts: AffiliatePayout[];
}

// A scheduled reduction on all Products, a Category, a Brand or chosen Products. The status is
// derived by the backend from the schedule; "end now" closes the schedule.
export type PromotionTargetKind = 'all' | 'category' | 'brand' | 'products';
export type PromotionStatus = 'scheduled' | 'active' | 'expired';

export interface Promotion {
    id: string;
    title: string;
    description: string | null;
    discount_type: 'percentage' | 'fixed';
    discount_value: number;
    target_kind: PromotionTargetKind;
    target_value: string | null;
    target_product_ids: string[];
    start_date: string;
    end_date: string | null;
    status: PromotionStatus;
}

export type PromotionInput = Omit<Promotion, 'id' | 'status'>;

export interface AdminReview {
    id: string;
    product_id: string;
    product_name: string;
    user_name: string | null;
    rating: number;
    comment: string | null;
    status: 'published' | 'hidden';
    created_at: string;
    order_id: string | null;
    is_verified_purchase: boolean;
}

// Message delivery health. Three pipelines fail in three different tables (order notifications, login
// codes, push), and a customer who heard nothing cannot tell you which one broke.
export type DeliverySource = 'notification_queue' | 'otp_delivery_log' | 'push_notification_deliveries';

export interface DeliveryFailure {
    source: DeliverySource;
    channel: string;
    status: string;
    recipient: string | null;
    reference: string | null;
    error_message: string | null;
    attempts: number | null;
    order_number: string | null;
    created_at: string;
}

export interface DeliveryChannelStats {
    sent: number;
    pending?: number;
    blocked?: number;
    failed: number;
}

export interface DeliverySummary {
    hours: number;
    email: DeliveryChannelStats;
    whatsapp: DeliveryChannelStats;
    otp: DeliveryChannelStats;
    push: DeliveryChannelStats;
}

export interface CustomerProfile {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    role: string;
    created_at: string;
    beauty_points: number;
    loyalty_lifetime_points: number;
    loyalty_tier: string;
    referral_code: string | null;
    orders_count?: number;
    total_spent?: number;
}

export interface SupervisorProfile {
    id: string;
    email: string | null;
    role: 'warehouse_supervisor';
    assigned_warehouse_id: string | null;
    created_at: string;
}

export interface LoyaltyLedgerEntry {
    id: string;
    customer_id: string;
    order_id: string | null;
    points_delta: number;
    event_type: string;
    note: string | null;
    created_at: string;
}

export type ReturnStatus = 'requested' | 'approved' | 'rejected' | 'received' | 'refunded' | 'closed';

export interface ReturnItem {
    id: string;
    quantity: number;
    name_ar?: string;
    variant_name?: string | null;
}

export interface OrderReturn {
    id: string;
    order_id: string;
    order_number: string | null;
    customer_name: string | null;
    phone: string | null;
    city: string | null;
    state: string | null;
    customer_id: string;
    items: ReturnItem[];
    reason: string;
    requested_resolution: 'refund' | 'exchange';
    status: ReturnStatus;
    customer_note: string | null;
    admin_note: string | null;
    restocked_at: string | null;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
}

export const SUDANESE_STATES = [
    'الخرطوم', 'الجزيرة', 'البحر الأحمر', 'نهر النيل', 'الشمالية',
    'شمال دارفور', 'غرب دارفور', 'جنوب دارفور', 'وسط دارفور', 'شرق دارفور',
    'شمال كردفان', 'جنوب كردفان', 'غرب كردفان', 'سنار', 'النيل الأبيض',
    'النيل الأزرق', 'القضارف', 'كسلا',
];


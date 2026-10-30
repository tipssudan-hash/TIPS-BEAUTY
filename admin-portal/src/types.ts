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
    // Weighted average of purchase invoices and returns (read-only; set by the backend).
    average_cost: number | null;
    category: string;
    category_id: string | null;
    brand: string;
    brand_id: string | null;
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

// The taxonomy is sent as ids; the backend trigger fills the text category/brand from them.
export type ProductInput = Omit<Product, 'id' | 'stock' | 'reviews_count' | 'average_rating' | 'created_at' | 'category' | 'brand' | 'average_cost'>;

// Two levels at most: a category with parent_id null is a top-level group, its children are leaves.
export interface Category {
    id: string;
    parent_id: string | null;
    name_ar: string;
    name_en: string | null;
    slug: string | null;
    image_url: string | null;
    icon: string | null;
    sort_order: number;
    is_active: boolean;
    product_count: number;
}

export interface CategoryInput {
    name_ar: string;
    name_en: string | null;
    slug: string | null;
    image_url: string | null;
    icon: string | null;
    parent_id: string | null;
    sort_order: number;
    is_active: boolean;
}

export interface Brand {
    id: string;
    name_ar: string;
    name_en: string | null;
    slug: string | null;
    logo_url: string | null;
    sort_order: number;
    is_active: boolean;
    product_count: number;
}

export type BrandInput = Omit<Brand, 'id' | 'product_count'>;

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
    per_kg_rate: number;
    per_extra_warehouse_fee: number;
    handling_fee: number;
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
    category_id?: string;
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

export interface AffiliateAccount {
    id: string;
    bank_name: string;
    account_number: string;
    account_holder: string;
    is_default?: boolean;
}

export function parseAffiliateAccounts(details: string | null | undefined, method?: string | null): AffiliateAccount[] {
    if (details) {
        try {
            const parsed = JSON.parse(details);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed.map((acc, index) => ({
                    id: String(acc.id || `acc_${index + 1}`),
                    bank_name: String(acc.bank_name || method || 'بنكك (بنك الخرطوم)'),
                    account_number: String(acc.account_number || ''),
                    account_holder: String(acc.account_holder || ''),
                    is_default: Boolean(acc.is_default || index === 0),
                }));
            }
        } catch {
            return [{
                id: 'acc_1',
                bank_name: method || 'بنكك (بنك الخرطوم)',
                account_number: details,
                account_holder: '',
                is_default: true,
            }];
        }
    }
    if (method) {
        return [{
            id: 'acc_1',
            bank_name: method,
            account_number: '',
            account_holder: '',
            is_default: true,
        }];
    }
    return [
        {
            id: 'acc_1',
            bank_name: 'بنكك (بنك الخرطوم)',
            account_number: '',
            account_holder: '',
            is_default: true,
        }
    ];
}

export function serializeAffiliateAccounts(accounts: AffiliateAccount[]): { payout_method: string; payout_details: string } {
    const validAccounts = accounts.filter(a => a.bank_name.trim() || a.account_number.trim() || a.account_holder.trim());
    if (validAccounts.length === 0) {
        return { payout_method: '', payout_details: '' };
    }
    const defaultAcc = validAccounts.find(a => a.is_default) || validAccounts[0];
    const methodsSummary = Array.from(new Set(validAccounts.map(a => a.bank_name.trim()).filter(Boolean))).join('، ');

    return {
        payout_method: methodsSummary || defaultAcc.bank_name,
        payout_details: JSON.stringify(validAccounts),
    };
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

export type AffiliateCommissionStatus = 'pending' | 'approved' | 'paid' | 'reversed';

export interface AffiliateCommission {
    id: string;
    order_id: string;
    order_number: string | null;
    commission_amount: number;
    commission_rate: number;
    paid_amount: number;
    status: AffiliateCommissionStatus;
    eligible_at: string | null;
    review_note: string | null;
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
        on_hold_balance: number;
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
// item_discount: a percentage or fixed reduction. The other types price by quantity or by bundle.
export type PromotionType = 'item_discount' | 'buy_x_get_y' | 'quantity_tier' | 'bundle';

export interface PromotionTier {
    min_quantity: number;
    percent: number;
}

export interface PromotionBundleItem {
    product_id: string;
    quantity: number;
}

export interface Promotion {
    id: string;
    title: string;
    description: string | null;
    promotion_type: PromotionType;
    discount_type: 'percentage' | 'fixed' | null;
    discount_value: number | null;
    buy_quantity: number | null;
    get_quantity: number | null;
    get_discount_percent: number | null;
    tiers: PromotionTier[];
    bundle_price: number | null;
    bundle_items: PromotionBundleItem[];
    max_applications_per_order: number | null;
    target_kind: PromotionTargetKind;
    target_value: string | null;
    target_category_id: string | null;
    target_brand_id: string | null;
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
    assigned_warehouse_id?: string | null;
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
    order_payment_status?: string | null;
    order_payment_method?: string | null;
    order_total?: number | null;
    refund_amount?: number | null;
    refund_reference?: string | null;
    refunded_at?: string | null;
    returned_items_value: number;
    refundable_cap: number;
}

export interface Supplier {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    tax_number: string | null;
    notes: string | null;
    is_active: boolean;
}

export type SupplierInput = Omit<Supplier, 'id'>;

export type PurchaseInvoiceStatus = 'draft' | 'approved' | 'voided';

export interface PurchaseInvoiceSummary {
    id: string;
    invoice_number: string;
    supplier_id: string;
    supplier_name: string;
    warehouse_id: string;
    warehouse_name: string;
    supplier_invoice_ref: string | null;
    invoice_date: string;
    status: PurchaseInvoiceStatus;
    total: number;
}

export interface PurchaseInvoiceItem {
    id: string;
    line_no: number;
    product_id: string;
    product_name: string;
    variant_id: string | null;
    variant_name: string | null;
    quantity: number;
    unit_cost: number;
    line_total: number;
    landed_unit_cost: number | null;
    expiry_date: string | null;
    batch_number: string | null;
}

export interface PurchaseInvoiceAttachment {
    id: string;
    storage_path: string;
    uploaded_at: string;
}

export interface PurchaseInvoice extends PurchaseInvoiceSummary {
    subtotal: number;
    discount_amount: number;
    extra_costs: number;
    notes: string | null;
    created_at: string;
    approved_at: string | null;
    voided_at: string | null;
    void_reason: string | null;
    items: PurchaseInvoiceItem[];
    attachments: PurchaseInvoiceAttachment[];
}

export type SupplierReturnStatus = 'draft' | 'approved' | 'cancelled';

export interface SupplierReturnSummary {
    id: string;
    return_number: string;
    supplier_id: string;
    supplier_name: string;
    warehouse_id: string;
    warehouse_name: string;
    purchase_invoice_id: string | null;
    invoice_number: string | null;
    status: SupplierReturnStatus;
    reason: string;
    is_void_reversal: boolean;
    created_at: string;
    approved_at: string | null;
}

export interface SupplierReturnItem {
    id: string;
    purchase_invoice_item_id: string | null;
    product_id: string;
    product_name: string;
    variant_id: string | null;
    quantity: number;
    unit_cost: number;
}

export interface SupplierReturn extends SupplierReturnSummary {
    notes: string | null;
    items: SupplierReturnItem[];
}

export interface ProfitByProduct {
    product_id: string;
    product_name: string;
    quantity: number;
    revenue: number;
    cogs: number;
    gross_profit: number;
    margin_pct: number | null;
}

export interface ProfitReport {
    revenue: number;
    cogs: number;
    gross_profit: number;
    margin_pct: number | null;
    by_product: ProfitByProduct[];
    missing_cost_lines: number;
    estimated_cost_lines: number;
    cogs_reversed: number;
}

// Operations: the backend computes these from the order lifecycle; the UI only shapes them.
export type OrderNeedsActionReason = 'delivery_failed' | 'needs_fulfillment_review' | 'stale' | 'failed_return_pending';

export interface OrderNeedsAction {
    order_id: string;
    order_number: string | null;
    status: string;
    reason: OrderNeedsActionReason;
    since: string;
    warehouse_id: string | null;
}

// `packing` is the warehouse checklist before hand-over; `pickup` is the driver's check at hand-over.
export type OrderItemCheckStage = 'packing' | 'pickup';

export interface OrderItemCheck {
    stage: OrderItemCheckStage;
    line_no: number;
    checked_qty: number;
    checked_at: string;
}

export interface FulfillmentBreakdownLine {
    line_no: number;
    product_id: string;
    name_ar: string | null;
    quantity: number;
    warehouse_id: string;
    warehouse_name: string;
    available: number;
    is_fulfillment_warehouse: boolean;
}

export interface DriverLocation {
    driver_id: string;
    name: string;
    status: string;
    latitude: number;
    longitude: number;
    accuracy_meters: number | null;
    updated_at: string;
    active_order_numbers: string[];
}

export type StaffNotificationKind = 'low_stock' | 'delivery_failed' | 'remittance_submitted';

export interface StaffNotification {
    id: string;
    warehouse_id: string | null;
    kind: StaffNotificationKind;
    title: string;
    body: string | null;
    ref_type: string | null;
    ref_id: string | null;
    read_at: string | null;
    created_at: string;
}

// Delivery workflow switches in app_settings. The backend enforces them; the UI only shows them.
export interface DeliveryPolicySettings {
    notification_emails: string[];
    require_packing_check: boolean;
    require_delivery_proof: boolean;
}

export const SUDANESE_STATES = [
    'الخرطوم', 'الجزيرة', 'البحر الأحمر', 'نهر النيل', 'الشمالية',
    'شمال دارفور', 'غرب دارفور', 'جنوب دارفور', 'وسط دارفور', 'شرق دارفور',
    'شمال كردفان', 'جنوب كردفان', 'غرب كردفان', 'سنار', 'النيل الأبيض',
    'النيل الأزرق', 'القضارف', 'كسلا',
];


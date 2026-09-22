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
}

export interface DeliveryZone {
    id: string;
    name: string;
    fee: number;
    is_active: boolean;
    state: string | null;
    warehouse_id: string | null;
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
}

export type CouponInput = Omit<Coupon, 'id' | 'usage_count'>;

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

export const SUDANESE_STATES = [
    'الخرطوم', 'الجزيرة', 'البحر الأحمر', 'نهر النيل', 'الشمالية',
    'شمال دارفور', 'غرب دارفور', 'جنوب دارفور', 'وسط دارفور', 'شرق دارفور',
    'شمال كردفان', 'جنوب كردفان', 'غرب كردفان', 'سنار', 'النيل الأبيض',
    'النيل الأزرق', 'القضارف', 'كسلا',
];

export interface ProductVariant {
    id?: string;
    name_ar: string;
    name_en?: string;
    sku?: string;
    priceOverride?: number;
}

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

export interface Driver {
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

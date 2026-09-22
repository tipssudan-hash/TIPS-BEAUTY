import { supabase } from './supabase';
import type { AdminReview, Banner, Collection, Coupon, CouponInput, CollectionInput, CollectionRuleConfig, CollectionRuleType, DeliveryZone, Driver, InventoryRow, Product, ProductInput, ProductVariant, Promotion, PromotionInput, Warehouse } from '../types';
import type { Json } from './database.types';

// Admin data access for catalogue, logistics and settings over the generated database types.

// Products ------------------------------------------------------------------------

type ProductRow = Omit<Product, 'variants' | 'images' | 'benefits' | 'ingredients' | 'skin_type'> & {
    variants: unknown; images: string[] | null; benefits: string[] | null; ingredients: string[] | null; skin_type: string[] | null;
    name_en: string | null; brand: string | null; category: string | null; image: string | null; description: string | null;
    usage: string | null; origin: string | null; expiry: string | null; discount_percentage: number | null; cost_price: number | null;
    stock: number | null; reviews_count: number | null; average_rating: number | null; is_imported: boolean | null; is_active: boolean | null;
};

function mapVariants(raw: unknown): ProductVariant[] {
    if (!Array.isArray(raw)) return [];
    return (raw as Partial<ProductVariant>[])
        .filter((v) => v && typeof v.id === 'string' && typeof v.name_ar === 'string')
        .map((v) => ({ id: v.id!, name_ar: v.name_ar!, name_en: v.name_en ?? '', price: v.price == null ? null : Number(v.price) }));
}

// Only the keys the CHECK constraint knows; a blank price means "the Product's price".
function variantRows(variants: ProductVariant[]) {
    return variants.map((v) => ({ id: v.id, name_ar: v.name_ar.trim(), name_en: v.name_en?.trim() || null, price: v.price == null || Number.isNaN(v.price) ? null : v.price }));
}

function mapProduct(row: ProductRow): Product {
    return {
        id: row.id,
        name_ar: row.name_ar,
        name_en: row.name_en ?? '',
        price: Number(row.price),
        discount_percentage: Number(row.discount_percentage ?? 0),
        cost_price: Number(row.cost_price ?? 0),
        category: row.category ?? '',
        brand: row.brand ?? '',
        image: row.image ?? '',
        images: row.images ?? [],
        description: row.description ?? '',
        benefits: row.benefits ?? [],
        ingredients: row.ingredients ?? [],
        usage: row.usage ?? '',
        origin: row.origin ?? '',
        expiry: row.expiry ?? '',
        stock: Number(row.stock ?? 0),
        is_imported: Boolean(row.is_imported),
        skin_type: row.skin_type ?? [],
        reviews_count: Number(row.reviews_count ?? 0),
        average_rating: Number(row.average_rating ?? 0),
        variants: mapVariants(row.variants),
        is_active: row.is_active ?? true,
        created_at: row.created_at,
    };
}

export async function fetchAdminProducts(): Promise<Product[]> {
    const { data, error } = await supabase.rpc('get_admin_products');
    if (error) throw error;
    return ((data ?? []) as ProductRow[]).map(mapProduct);
}

export async function fetchAdminProduct(id: string): Promise<Product | null> {
    const { data, error } = await supabase.rpc('get_admin_product', { p_product_id: id });
    if (error) throw error;
    const row = (data as ProductRow[] | null)?.[0];
    return row ? mapProduct(row) : null;
}

function toRow(input: ProductInput) {
    return {
        name_ar: input.name_ar.trim(),
        name_en: input.name_en.trim(),
        price: input.price,
        discount_percentage: input.discount_percentage,
        cost_price: input.cost_price,
        category: input.category.trim(),
        brand: input.brand.trim(),
        image: input.image,
        images: input.images,
        description: input.description,
        benefits: input.benefits,
        ingredients: input.ingredients,
        usage: input.usage,
        origin: input.origin,
        expiry: input.expiry,
        is_imported: input.is_imported,
        skin_type: input.skin_type,
        variants: variantRows(input.variants),
        is_active: input.is_active,
    };
}

export async function createProduct(input: ProductInput): Promise<string> {
    const { data, error } = await supabase.from('products').insert(toRow(input)).select('id').single();
    if (error) throw error;
    return (data as { id: string }).id;
}

export async function updateProduct(id: string, input: ProductInput): Promise<void> {
    const { error } = await supabase.from('products').update(toRow(input)).eq('id', id);
    if (error) throw error;
}

export async function setProductActive(id: string, isActive: boolean): Promise<void> {
    const { error } = await supabase.from('products').update({ is_active: isActive }).eq('id', id);
    if (error) throw error;
}

// Storage -------------------------------------------------------------------------

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function validateImage(file: File): string | null {
    if (!file.type.startsWith('image/')) return 'يرجى اختيار ملف صورة.';
    if (file.size > MAX_IMAGE_BYTES) return 'حجم الصورة يجب ألا يتجاوز 5 ميجابايت.';
    return null;
}

export async function uploadPublicImage(folder: string, file: File): Promise<string> {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${folder}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('products').upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (error) throw error;
    return supabase.storage.from('products').getPublicUrl(path).data.publicUrl;
}

// Warehouses / inventory --------------------------------------------------------------

export async function fetchWarehouses(): Promise<Warehouse[]> {
    const { data, error } = await supabase.from('warehouses').select('id,name,code,state,city,address,phone,is_active').order('created_at');
    if (error) throw error;
    return data ?? [];
}

export type WarehouseInput = Omit<Warehouse, 'id'>;

export async function saveWarehouse(id: string | null, input: WarehouseInput): Promise<void> {
    const query = id ? supabase.from('warehouses').update(input).eq('id', id) : supabase.from('warehouses').insert(input);
    const { error } = await query;
    if (error) throw error;
}

export async function fetchInventory(warehouseId?: string): Promise<InventoryRow[]> {
    let query = supabase.from('warehouse_inventory').select('warehouse_id,product_id,quantity,reorder_level,products(name_ar)');
    if (warehouseId) query = query.eq('warehouse_id', warehouseId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((r) => ({
        warehouse_id: r.warehouse_id,
        product_id: r.product_id,
        quantity: r.quantity,
        reorder_level: r.reorder_level,
        product_name: (r.products as { name_ar: string } | null)?.name_ar ?? '—',
    })).sort((a, b) => a.product_name.localeCompare(b.product_name, 'ar'));
}

export async function adjustInventory(warehouseId: string, productId: string, delta: number, note: string, reorderLevel?: number): Promise<void> {
    const { error } = await supabase.rpc('adjust_warehouse_inventory', {
        p_warehouse_id: warehouseId,
        p_product_id: productId,
        p_quantity_delta: delta,
        p_note: note || undefined,
        p_reorder_level: reorderLevel,
    });
    if (error) throw error;
}

export async function transferInventory(fromId: string, toId: string, productId: string, quantity: number, note: string): Promise<void> {
    const { error } = await supabase.rpc('transfer_warehouse_stock', {
        p_from_warehouse_id: fromId,
        p_to_warehouse_id: toId,
        p_product_id: productId,
        p_quantity: quantity,
        p_note: note || undefined,
    });
    if (error) throw error;
}

// Delivery zones ---------------------------------------------------------------------

export async function fetchDeliveryZones(): Promise<DeliveryZone[]> {
    const { data, error } = await supabase.from('delivery_zones').select('id,name,fee,is_active,state,warehouse_id').order('state').order('name');
    if (error) throw error;
    return (data ?? []).map((z) => ({ ...z, fee: Number(z.fee) }));
}

export type DeliveryZoneInput = Omit<DeliveryZone, 'id'>;

export async function saveDeliveryZone(id: string | null, input: DeliveryZoneInput): Promise<void> {
    const query = id ? supabase.from('delivery_zones').update(input).eq('id', id) : supabase.from('delivery_zones').insert(input);
    const { error } = await query;
    if (error) throw error;
}

export async function deleteDeliveryZone(id: string): Promise<void> {
    const { error } = await supabase.from('delivery_zones').delete().eq('id', id);
    if (error) throw error;
}

// Drivers ----------------------------------------------------------------------------

export async function fetchDrivers(): Promise<Driver[]> {
    const { data, error } = await supabase.from('drivers').select('id,name,phone,company,status,warehouse_id,vehicle').order('name');
    if (error) throw error;
    return (data ?? []).map((d) => ({ ...d, status: d.status as Driver['status'] }));
}

export type DriverInput = Omit<Driver, 'id'>;

export async function saveDriver(id: string | null, input: DriverInput): Promise<void> {
    const query = id ? supabase.from('drivers').update(input).eq('id', id) : supabase.from('drivers').insert(input);
    const { error } = await query;
    if (error) throw error;
}

// Banners ------------------------------------------------------------------------------

export async function fetchBanners(): Promise<Banner[]> {
    const { data, error } = await supabase.from('storefront_banners').select('id,title_ar,subtitle_ar,image_url,action_type,action_value,display_order,is_active,starts_at,ends_at').order('display_order');
    if (error) throw error;
    return (data ?? []).map((b) => ({ ...b, image_url: b.image_url ?? '', action_type: b.action_type as Banner['action_type'] }));
}

export type BannerInput = Omit<Banner, 'id'>;

export async function saveBanner(id: string | null, input: BannerInput): Promise<void> {
    const query = id ? supabase.from('storefront_banners').update(input).eq('id', id) : supabase.from('storefront_banners').insert(input);
    const { error } = await query;
    if (error) throw error;
}

export async function deleteBanner(id: string): Promise<void> {
    const { error } = await supabase.from('storefront_banners').delete().eq('id', id);
    if (error) throw error;
}

// Collections --------------------------------------------------------------------------
// Every read and write goes through the admin RPCs (the tables carry no write grant).

const SLUG_PATTERN = /^[a-z0-9-]+$/;

export function validateCollectionSlug(slug: string): string | null {
    if (!slug.trim()) return 'المعرّف (slug) مطلوب.';
    if (!SLUG_PATTERN.test(slug)) return 'المعرّف يجب أن يحتوي على حروف إنجليزية صغيرة وأرقام وشرطات فقط، مثل: eid-essentials.';
    return null;
}

export const COLLECTION_RULE_LABELS: Record<CollectionRuleType, string> = {
    manual: 'اختيار يدوي',
    newest: 'الأحدث',
    best_sellers: 'الأكثر مبيعاً',
    discount: 'عليها خصم',
    price_under: 'أقل من سعر',
    category: 'من تصنيف',
};

// Names the Storefront knows how to draw (src/lib/collectionIcons.tsx).
export const COLLECTION_ICONS: Record<string, string> = {
    'auto-awesome': 'لمعة',
    star: 'نجمة',
    tag: 'وسم',
    gift: 'هدية',
    flame: 'الأكثر رواجاً',
    heart: 'قلب',
    leaf: 'طبيعي',
};

export async function fetchCollections(): Promise<Collection[]> {
    const { data, error } = await supabase.rpc('admin_get_collections');
    if (error) throw error;
    return (data ?? []).map((row) => ({
        ...row,
        rule_type: row.rule_type as CollectionRuleType,
        rule_config: (row.rule_config ?? {}) as CollectionRuleConfig,
        product_ids: row.product_ids ?? [],
    }));
}

export async function fetchCollection(id: string): Promise<Collection | null> {
    return (await fetchCollections()).find((c) => c.id === id) ?? null;
}

// For a hand-picked Collection pass its members: the backend writes row and members in one transaction.
export async function saveCollection(id: string | null, input: CollectionInput, productIds?: string[]): Promise<string> {
    const { data, error } = await supabase.rpc('admin_save_collection', {
        p_id: id ?? undefined,
        p_slug: input.slug.trim(),
        p_name_ar: input.name_ar.trim(),
        p_description_ar: input.description_ar?.trim() || undefined,
        p_icon: input.icon,
        p_rule_type: input.rule_type,
        p_rule_config: input.rule_type === 'manual' ? {} : (input.rule_config as Json),
        p_display_order: input.display_order,
        p_is_active: input.is_active,
        p_product_ids: input.rule_type === 'manual' ? productIds : undefined,
    });
    if (error) throw error;
    return data;
}

export async function deleteCollection(id: string): Promise<void> {
    const { error } = await supabase.rpc('admin_delete_collection', { p_id: id });
    if (error) throw error;
}

// Coupons ------------------------------------------------------------------------------
// Eligibility data: reads under the admin policy, every write through the admin RPCs.

export async function fetchCoupons(): Promise<Coupon[]> {
    const { data, error } = await supabase.rpc('admin_get_coupons');
    if (error) throw error;
    return (data ?? []).map((row) => ({
        ...row,
        discount_type: row.discount_type as Coupon['discount_type'],
        discount_value: Number(row.discount_value),
        max_discount_amount: row.max_discount_amount == null ? null : Number(row.max_discount_amount),
        min_order_amount: Number(row.min_order_amount),
    }));
}

export async function saveCoupon(id: string | null, input: CouponInput): Promise<string> {
    const { data, error } = await supabase.rpc('admin_save_coupon', {
        p_id: id ?? undefined,
        p_code: input.code.trim(),
        p_name: input.name.trim(),
        p_description: input.description?.trim() || undefined,
        p_discount_type: input.discount_type,
        p_discount_value: input.discount_value,
        p_max_discount_amount: input.max_discount_amount ?? undefined,
        p_min_order_amount: input.min_order_amount,
        p_usage_limit: input.usage_limit ?? undefined,
        p_per_user_limit: input.per_user_limit,
        p_starts_at: input.starts_at,
        p_ends_at: input.ends_at ?? undefined,
        p_is_active: input.is_active,
    });
    if (error) throw error;
    return data;
}

export async function deleteCoupon(id: string): Promise<void> {
    const { error } = await supabase.rpc('admin_delete_coupon', { p_id: id });
    if (error) throw error;
}

// Promotions ---------------------------------------------------------------------------
// Pricing data: the backend derives the status and matches targets; every write is an admin RPC.

export const PROMOTION_TARGET_LABELS: Record<Promotion['target_kind'], string> = {
    all: 'كل المنتجات', category: 'تصنيف', brand: 'علامة تجارية', products: 'منتجات محددة',
};
export const PROMOTION_STATUS_LABELS: Record<Promotion['status'], string> = { scheduled: 'مجدول', active: 'ساري', expired: 'منتهٍ' };

export async function fetchPromotions(): Promise<Promotion[]> {
    const { data, error } = await supabase.rpc('admin_get_promotions');
    if (error) throw error;
    return (data ?? []).map((row) => ({
        ...row,
        discount_type: row.discount_type as Promotion['discount_type'],
        discount_value: Number(row.discount_value),
        target_kind: row.target_kind as Promotion['target_kind'],
        target_product_ids: row.target_product_ids ?? [],
        status: row.status as Promotion['status'],
    }));
}

export async function savePromotion(id: string | null, input: PromotionInput): Promise<string> {
    const { data, error } = await supabase.rpc('admin_save_promotion', {
        p_id: id ?? undefined,
        p_title: input.title.trim(),
        p_description: input.description?.trim() || undefined,
        p_discount_type: input.discount_type,
        p_discount_value: input.discount_value,
        p_target_kind: input.target_kind,
        p_target_value: input.target_value?.trim() || undefined,
        p_target_product_ids: input.target_kind === 'products' ? input.target_product_ids : [],
        p_start_date: input.start_date,
        p_end_date: input.end_date ?? undefined,
    });
    if (error) throw error;
    return data;
}

export async function endPromotion(id: string): Promise<void> {
    const { error } = await supabase.rpc('admin_end_promotion', { p_id: id });
    if (error) throw error;
}

export async function deletePromotion(id: string): Promise<void> {
    const { error } = await supabase.rpc('admin_delete_promotion', { p_id: id });
    if (error) throw error;
}

// Settings -----------------------------------------------------------------------------

export async function fetchNotificationEmails(): Promise<string[]> {
    const { data, error } = await supabase.from('app_settings').select('notification_emails').eq('id', true).maybeSingle();
    if (error) throw error;
    return ((data as { notification_emails: string[] } | null)?.notification_emails) ?? [];
}

export async function saveNotificationEmails(emails: string[]): Promise<void> {
    const { error } = await supabase.from('app_settings').update({ notification_emails: emails, updated_at: new Date().toISOString() }).eq('id', true);
    if (error) throw error;
}

// Reviews ------------------------------------------------------------------------------

export async function fetchAdminReviews(): Promise<AdminReview[]> {
    const { data, error } = await supabase.from('reviews')
        .select('id,product_id,user_name,rating,comment,status,created_at,order_id,is_verified_purchase,products(name_ar)')
        .order('created_at', { ascending: false }).limit(300);
    if (error) throw error;
    return (data ?? []).map((r) => ({
        id: r.id,
        product_id: r.product_id ?? '',
        product_name: (r.products as { name_ar: string } | null)?.name_ar ?? '—',
        user_name: r.user_name,
        rating: r.rating ?? 0,
        comment: r.comment,
        status: r.status as AdminReview['status'],
        created_at: r.created_at,
        order_id: r.order_id,
        is_verified_purchase: r.is_verified_purchase,
    }));
}

export async function moderateReview(id: string, status: 'published' | 'hidden'): Promise<void> {
    const { error } = await supabase.rpc('moderate_product_review', { p_review_id: id, p_status: status, p_remove_images: false });
    if (error) throw error;
}

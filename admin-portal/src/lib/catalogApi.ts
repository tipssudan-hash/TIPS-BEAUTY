import { supabase } from './supabase';
import type { AdminReview, Banner, Brand, BrandInput, Category, CategoryInput, Collection, Coupon, CouponInput, CollectionInput, CollectionRuleConfig, CollectionRuleType, DeliveryPolicySettings, DeliveryPricingConfig, DeliveryQuote, DeliveryZone, Driver, InventoryRow, Product, ProductInput, ProductVariant, Promotion, PromotionBundleItem, PromotionInput, PromotionTier, PromotionType, Warehouse } from '../types';
import type { Json } from './database.types';
import { errorMessage } from './errors';

// Columns and RPCs used below are typed by hand in database.types.ts until `supabase gen types` is re-run.

// Admin data access for catalogue, logistics and settings over the generated database types.

// Products ------------------------------------------------------------------------

type ProductRow = Omit<Product, 'variants' | 'images' | 'benefits' | 'ingredients' | 'skin_type'> & {
    variants: unknown; images: string[] | null; benefits: string[] | null; ingredients: string[] | null; skin_type: string[] | null;
    name_en: string | null; brand: string | null; category: string | null; image: string | null; description: string | null;
    usage: string | null; origin: string | null; expiry: string | null; discount_percentage: number | null; cost_price: number | null;
    stock: number | null; reviews_count: number | null; average_rating: number | null; is_imported: boolean | null; is_active: boolean | null;
    average_cost: number | null; average_cost_updated_at: string | null;
};

export function mapVariants(raw: unknown): ProductVariant[] {
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
        average_cost: row.average_cost == null ? null : Number(row.average_cost),
        category: row.category ?? '',
        category_id: row.category_id ?? null,
        brand: row.brand ?? '',
        brand_id: row.brand_id ?? null,
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
        weight_grams: row.weight_grams ?? null,
        length_cm: row.length_cm != null ? Number(row.length_cm) : null,
        width_cm: row.width_cm != null ? Number(row.width_cm) : null,
        height_cm: row.height_cm != null ? Number(row.height_cm) : null,
        created_at: row.created_at,
    };
}

export interface PageResult<T> {
    rows: T[];
    total: number;
}

export async function fetchAdminProducts(): Promise<Product[]> {
    const { data, error } = await supabase.rpc('get_admin_products');
    if (error) throw error;
    return ((data ?? []) as ProductRow[]).map(mapProduct);
}

export async function fetchAdminProductsPage(params: { search: string; page: number; pageSize: number }): Promise<PageResult<Product>> {
    const { data, error } = await supabase.rpc('get_admin_products', {
        p_limit: params.pageSize,
        p_offset: params.page * params.pageSize,
        p_search: params.search.trim() || null,
    });
    if (error) throw error;
    return { rows: ((data ?? []) as ProductRow[]).map(mapProduct), total: Number(data?.[0]?.total_count ?? 0) };
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
        category_id: input.category_id,
        brand_id: input.brand_id,
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
        weight_grams: input.weight_grams ?? null,
        length_cm: input.length_cm ?? null,
        width_cm: input.width_cm ?? null,
        height_cm: input.height_cm ?? null,
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

export async function bulkSetProductsActive(ids: string[], isActive: boolean): Promise<number> {
    const { data, error } = await supabase.rpc('admin_bulk_set_products_active', { p_ids: ids, p_is_active: isActive });
    if (error) throw error;
    return Number(data ?? 0);
}

export async function bulkAssignProductCategory(ids: string[], categoryId: string): Promise<number> {
    const { data, error } = await supabase.rpc('admin_bulk_assign_category', { p_ids: ids, p_category_id: categoryId });
    if (error) throw error;
    return Number(data ?? 0);
}

// Storage -------------------------------------------------------------------------

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function validateImage(file: File): string | null {
    if (!file.type.startsWith('image/')) return 'يرجى اختيار ملف صورة.';
    if (file.size > MAX_IMAGE_BYTES) return 'حجم الصورة يجب ألا يتجاوز 5 ميجابايت.';
    return null;
}

// Banners are the page's largest paint on a phone: shrink them in the browser before upload so a
// 4 MB camera JPEG becomes a ~150 KB 1600px-wide JPEG. Falls back to the original when decoding fails.
export const BANNER_MAX_WIDTH = 1600;

export async function downscaleImage(file: File, maxWidth = BANNER_MAX_WIDTH, quality = 0.82): Promise<File> {
    if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) return file;
    const scale = Math.min(1, maxWidth / bitmap.width);
    if (scale === 1 && file.size < 400 * 1024) { bitmap.close(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}

export async function uploadPublicImage(folder: string, file: File): Promise<string> {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${folder}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('products').upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (error) throw error;
    return supabase.storage.from('products').getPublicUrl(path).data.publicUrl;
}

// Categories & brands ------------------------------------------------------------------
// Reads and writes go through the admin RPCs; the storefront reads the public variants.

export function catalogError(error: unknown, fallback: string): string {
    const raw = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : '';
    return errorMessage(error, raw || fallback);
}

export async function fetchCategories(): Promise<Category[]> {
    const { data, error } = await supabase.rpc('admin_get_categories');
    if (error) throw error;
    return (data ?? [])
        .map((row) => ({ ...row, product_count: Number(row.product_count ?? 0) }))
        .sort((a, b) => a.sort_order - b.sort_order || a.name_ar.localeCompare(b.name_ar, 'ar'));
}

export async function saveCategory(id: string | null, input: CategoryInput): Promise<string> {
    const { data, error } = await supabase.rpc('admin_save_category', {
        p_name_ar: input.name_ar.trim(),
        p_id: id ?? null,
        p_parent_id: input.parent_id,
        p_name_en: input.name_en?.trim() || null,
        p_slug: input.slug?.trim() || null,
        p_image_url: input.image_url,
        p_icon: input.icon,
        p_sort_order: input.sort_order,
        p_is_active: input.is_active,
    });
    if (error) throw error;
    return data;
}

export async function reorderCategories(ids: string[]): Promise<void> {
    const { error } = await supabase.rpc('admin_reorder_categories', { p_ids: ids });
    if (error) throw error;
}

export async function deleteCategory(id: string): Promise<void> {
    const { error } = await supabase.rpc('admin_delete_category', { p_id: id });
    if (error) throw error;
}

export async function fetchBrands(): Promise<Brand[]> {
    const { data, error } = await supabase.rpc('admin_get_brands');
    if (error) throw error;
    return (data ?? [])
        .map((row) => ({ ...row, product_count: Number(row.product_count ?? 0) }))
        .sort((a, b) => a.sort_order - b.sort_order || a.name_ar.localeCompare(b.name_ar, 'ar'));
}

export async function saveBrand(id: string | null, input: BrandInput): Promise<string> {
    const { data, error } = await supabase.rpc('admin_save_brand', {
        p_name_ar: input.name_ar.trim(),
        p_id: id ?? null,
        p_name_en: input.name_en?.trim() || null,
        p_slug: input.slug?.trim() || null,
        p_logo_url: input.logo_url,
        p_sort_order: input.sort_order,
        p_is_active: input.is_active,
    });
    if (error) throw error;
    return data;
}

export async function reorderBrands(ids: string[]): Promise<void> {
    const { error } = await supabase.rpc('admin_reorder_brands', { p_ids: ids });
    if (error) throw error;
}

export async function deleteBrand(id: string): Promise<void> {
    const { error } = await supabase.rpc('admin_delete_brand', { p_id: id });
    if (error) throw error;
}

// Warehouses / inventory --------------------------------------------------------------

export async function fetchWarehouses(): Promise<Warehouse[]> {
    const { data, error } = await supabase.from('warehouses').select('id,name,code,state,city,address,phone,is_active,latitude,longitude,base_dispatch_minutes').order('created_at');
    if (error) throw error;
    return (data ?? []) as unknown as Warehouse[];
}

export type WarehouseInput = Omit<Warehouse, 'id'>;

export async function saveWarehouse(id: string | null, input: WarehouseInput): Promise<void> {
    const query = id ? supabase.from('warehouses').update(input as never).eq('id', id) : supabase.from('warehouses').insert(input as never);
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

export interface InventoryMovement {
    id: string;
    created_at: string;
    movement_type: string;
    quantity_delta: number;
    note: string | null;
    reference_id: string | null;
    product_name: string;
}

export async function fetchInventoryMovements(warehouseId: string, page: number, pageSize: number): Promise<{ rows: InventoryMovement[]; total: number }> {
    const from = page * pageSize;
    const { data, error, count } = await supabase
        .from('inventory_movements')
        .select('id,created_at,movement_type,quantity_delta,note,reference_id,products(name_ar)', { count: 'exact' })
        .eq('warehouse_id', warehouseId)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
    if (error) throw error;
    return {
        rows: (data ?? []).map((r) => ({
            id: r.id,
            created_at: r.created_at,
            movement_type: r.movement_type,
            quantity_delta: r.quantity_delta,
            note: r.note,
            reference_id: r.reference_id,
            product_name: (r.products as { name_ar: string } | null)?.name_ar ?? '—',
        })),
        total: count ?? 0,
    };
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
    const { data, error } = await supabase.from('delivery_zones').select('id,name,fee,is_active,state,warehouse_id,latitude,longitude').order('state').order('name');
    if (error) throw error;
    return ((data ?? []) as unknown as DeliveryZone[]).map((z) => ({ ...z, fee: Number(z.fee) }));
}

export type DeliveryZoneInput = Omit<DeliveryZone, 'id'>;

export async function saveDeliveryZone(id: string | null, input: DeliveryZoneInput): Promise<void> {
    const query = id ? supabase.from('delivery_zones').update(input as never).eq('id', id) : supabase.from('delivery_zones').insert(input as never);
    const { error } = await query;
    if (error) throw error;
}

export async function deleteDeliveryZone(id: string): Promise<void> {
    const { error } = await supabase.from('delivery_zones').delete().eq('id', id);
    if (error) throw error;
}

// GPS-03: dynamic delivery pricing config -------------------------------------------

export async function fetchPricingConfigs(): Promise<DeliveryPricingConfig[]> {
    const { data, error } = await supabase
        .from('delivery_pricing_config')
        .select('id,warehouse_id,delivery_zone_id,state,base_fee,per_km_rate,weight_multiplier,road_multiplier,min_fee,max_fee,avg_speed_kmh,per_kg_rate,per_extra_warehouse_fee,handling_fee,is_active')
        .order('warehouse_id', { nullsFirst: true })
        .order('delivery_zone_id', { nullsFirst: true });
    if (error) throw error;
    return (data ?? []) as unknown as DeliveryPricingConfig[];
}

export type PricingConfigInput = Omit<DeliveryPricingConfig, 'id'>;

export async function savePricingConfig(id: string | null, input: PricingConfigInput): Promise<void> {
    const query = id
        ? supabase.from('delivery_pricing_config').update(input as never).eq('id', id)
        : supabase.from('delivery_pricing_config').insert(input as never);
    const { error } = await query;
    if (error) throw error;
}

export async function deletePricingConfig(id: string): Promise<void> {
    const { error } = await supabase.from('delivery_pricing_config').delete().eq('id', id);
    if (error) throw error;
}

export async function fetchPricingConfigAudit(configId: string): Promise<{ id: number; action: string; changed_at: string; old_values: Json | null; new_values: Json | null }[]> {
    const { data, error } = await supabase
        .from('delivery_pricing_config_audit')
        .select('id,action,changed_at,old_values,new_values')
        .eq('config_id', configId)
        .order('changed_at', { ascending: false })
        .limit(20);
    if (error) throw error;
    return (data ?? []) as unknown as { id: number; action: string; changed_at: string; old_values: Json | null; new_values: Json | null }[];
}

// Calls the same RPC checkout_order freezes into the Order — never a client-side
// reimplementation of the formula (GPS-03 acceptance criterion).
export async function simulateDeliveryQuote(warehouseId: string, deliveryZoneId: string, orderWeight = 0): Promise<DeliveryQuote> {
    const { data, error } = await supabase.rpc('calculate_delivery_quote', {
        p_warehouse_id: warehouseId,
        p_delivery_zone_id: deliveryZoneId,
        p_order_weight: orderWeight,
    });
    if (error) throw error;
    return (data as unknown as DeliveryQuote[])[0];
}

// Drivers ----------------------------------------------------------------------------

export async function fetchDrivers(): Promise<Driver[]> {
    const { data, error } = await supabase.rpc('admin_get_drivers');
    if (error) throw error;
    return (data ?? []).map((d) => ({ ...d, status: d.status as Driver['status'] })).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

export type DriverInput = Omit<Driver, 'id' | 'user_id' | 'user_email' | 'location_updated_at'>;

// Linking a login makes the account a Driver (profiles.role) and the row theirs (drivers.user_id).
export async function linkDriverUser(driverId: string, email: string): Promise<void> {
    const { error } = await supabase.rpc('admin_link_driver_user', { p_driver_id: driverId, p_email: email.trim() });
    if (error) throw error;
}

export async function unlinkDriverUser(driverId: string): Promise<void> {
    const { error } = await supabase.rpc('admin_unlink_driver_user', { p_driver_id: driverId });
    if (error) throw error;
}

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
        affiliate_id: row.affiliate_id ?? null,
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
        p_affiliate_id: input.affiliate_id ?? undefined,
    });
    if (error) throw error;
    return data;
}

export async function bulkSetCouponsActive(ids: string[], isActive: boolean): Promise<number> {
    const { data, error } = await supabase.rpc('admin_bulk_set_coupons_active', { p_ids: ids, p_is_active: isActive });
    if (error) throw error;
    return Number(data ?? 0);
}

export async function deleteCoupon(id: string): Promise<void> {
    const { error } = await supabase.rpc('admin_delete_coupon', { p_id: id });
    if (error) throw error;
}

// Marketers / Affiliates ---------------------------------------------------------------

export async function fetchAffiliates(): Promise<import('../types').Affiliate[]> {
    const { data, error } = await supabase.rpc('admin_get_affiliates');
    if (error) throw error;
    return (data ?? []).map((row) => ({
        ...row,
        status: row.status as import('../types').Affiliate['status'],
        commission_rate: Number(row.commission_rate ?? 0),
        minimum_payout: Number(row.minimum_payout ?? 0),
        total_orders: Number(row.total_orders ?? 0),
        total_sales: Number(row.total_sales ?? 0),
        total_discount_given: Number(row.total_discount_given ?? 0),
        total_commission_earned: Number(row.total_commission_earned ?? 0),
        total_payouts_paid: Number(row.total_payouts_paid ?? 0),
        pending_balance: Number(row.pending_balance ?? 0),
        coupons_count: Number(row.coupons_count ?? 0),
    }));
}

export async function saveAffiliate(id: string | null, input: import('../types').AffiliateInput): Promise<string> {
    const { data, error } = await supabase.rpc('admin_save_affiliate', {
        p_id: id ?? undefined,
        p_display_name: input.display_name.trim(),
        p_phone: input.phone?.trim() || undefined,
        p_email: input.email?.trim() || undefined,
        p_commission_rate: input.commission_rate,
        p_minimum_payout: input.minimum_payout,
        p_payout_method: input.payout_method?.trim() || undefined,
        p_payout_details: input.payout_details?.trim() || undefined,
        p_admin_note: input.admin_note?.trim() || undefined,
        p_status: input.status,
    });
    if (error) throw error;
    return data;
}

export async function recordAffiliatePayout(input: import('../types').AffiliatePayoutInput): Promise<string> {
    const { data, error } = await supabase.rpc('admin_record_affiliate_payout', {
        p_affiliate_id: input.affiliate_id,
        p_amount: input.amount,
        p_payout_method: input.payout_method.trim(),
        p_reference_number: input.reference_number?.trim() || undefined,
        p_notes: input.notes?.trim() || undefined,
    });
    if (error) throw error;
    return data;
}

type AffiliateDetailsPayload = {
    profile?: import('../types').AffiliateDetails['profile'];
    stats?: Partial<import('../types').AffiliateDetails['stats']>;
    coupons?: import('../types').AffiliateDetails['coupons'];
    orders?: import('../types').AffiliateDetails['orders'];
    commissions?: import('../types').AffiliateCommission[];
    payouts?: import('../types').AffiliatePayout[];
};

export async function fetchAffiliateDetails(id: string): Promise<import('../types').AffiliateDetails> {
    const { data, error } = await supabase.rpc('admin_get_affiliate_details', { p_affiliate_id: id });
    if (error) throw error;
    const res = (data ?? {}) as unknown as AffiliateDetailsPayload;
    return {
        profile: {
            ...res.profile,
            commission_rate: Number(res.profile?.commission_rate ?? 0),
            minimum_payout: Number(res.profile?.minimum_payout ?? 0),
        } as import('../types').AffiliateDetails['profile'],
        stats: {
            total_orders: Number(res.stats?.total_orders ?? 0),
            total_sales: Number(res.stats?.total_sales ?? 0),
            total_discount_given: Number(res.stats?.total_discount_given ?? 0),
            total_commission_earned: Number(res.stats?.total_commission_earned ?? 0),
            total_payouts_paid: Number(res.stats?.total_payouts_paid ?? 0),
            pending_balance: Number(res.stats?.pending_balance ?? 0),
            on_hold_balance: Number(res.stats?.on_hold_balance ?? 0),
        },
        coupons: (res.coupons ?? []).map((c) => ({
            ...c,
            discount_value: Number(c.discount_value ?? 0),
            max_discount_amount: c.max_discount_amount == null ? null : Number(c.max_discount_amount),
            usage_count: Number(c.usage_count ?? 0),
        })),
        orders: (res.orders ?? []).map((o) => ({
            ...o,
            total: Number(o.total ?? 0),
            discount_amount: Number(o.discount_amount ?? 0),
        })),
        commissions: (res.commissions ?? []).map((c) => ({
            ...c,
            commission_amount: Number(c.commission_amount ?? 0),
            commission_rate: Number(c.commission_rate ?? 0),
            paid_amount: Number(c.paid_amount ?? 0),
        })),
        payouts: (res.payouts ?? []).map((p) => ({
            ...p,
            amount: Number(p.amount ?? 0),
        })),
    };
}

export async function reviewAffiliateCommission(commissionId: string, status: 'approved' | 'reversed', note?: string): Promise<void> {
    const { error } = await supabase.rpc('review_affiliate_commission', {
        p_commission_id: commissionId,
        p_status: status,
        p_note: note?.trim() || undefined,
    });
    if (error) throw error;
}

export async function releaseEligibleCommissions(affiliateId?: string | null): Promise<number> {
    const { data, error } = await supabase.rpc('admin_release_eligible_commissions', { p_affiliate_id: affiliateId ?? undefined });
    if (error) throw error;
    return Number(data ?? 0);
}

// Promotions ---------------------------------------------------------------------------
// Pricing data: the backend derives the status and matches targets; every write is an admin RPC.

export const PROMOTION_TARGET_LABELS: Record<Promotion['target_kind'], string> = {
    all: 'كل المنتجات', category: 'تصنيف', brand: 'علامة تجارية', products: 'منتجات محددة',
};
export const PROMOTION_STATUS_LABELS: Record<Promotion['status'], string> = { scheduled: 'مجدول', active: 'ساري', expired: 'منتهٍ' };
export const PROMOTION_TYPE_LABELS: Record<PromotionType, string> = {
    item_discount: 'تخفيض مباشر', buy_x_get_y: 'اشترِ X واحصل على Y', quantity_tier: 'شرائح كمية', bundle: 'حزمة',
};

const numberOrNull = (value: unknown): number | null => (value == null ? null : Number(value));

function parseTiers(raw: unknown): PromotionTier[] {
    if (!Array.isArray(raw)) return [];
    return (raw as { min_quantity: unknown; percent: unknown }[]).map((t) => ({ min_quantity: Number(t.min_quantity), percent: Number(t.percent) }));
}

function parseBundleItems(raw: unknown): PromotionBundleItem[] {
    if (!Array.isArray(raw)) return [];
    return (raw as { product_id: unknown; quantity: unknown }[]).map((i) => ({ product_id: String(i.product_id), quantity: Number(i.quantity) }));
}

export async function fetchPromotions(): Promise<Promotion[]> {
    const { data, error } = await supabase.rpc('admin_get_promotions');
    if (error) throw error;
    return (data ?? []).map((row) => ({
        ...row,
        promotion_type: (row.promotion_type || 'item_discount') as PromotionType,
        discount_type: row.discount_type as Promotion['discount_type'],
        discount_value: numberOrNull(row.discount_value),
        buy_quantity: numberOrNull(row.buy_quantity),
        get_quantity: numberOrNull(row.get_quantity),
        get_discount_percent: numberOrNull(row.get_discount_percent),
        tiers: parseTiers(row.tiers),
        bundle_price: numberOrNull(row.bundle_price),
        bundle_items: parseBundleItems(row.bundle_items),
        max_applications_per_order: numberOrNull(row.max_applications_per_order),
        target_kind: row.target_kind as Promotion['target_kind'],
        target_category_id: row.target_category_id ?? null,
        target_brand_id: row.target_brand_id ?? null,
        target_product_ids: row.target_product_ids ?? [],
        status: row.status as Promotion['status'],
    }));
}

export async function fetchPromotion(id: string): Promise<Promotion | null> {
    return (await fetchPromotions()).find((p) => p.id === id) ?? null;
}

// A bundle prices the Products it lists, so its target is those Products; the type decides which
// fields reach the backend, and the rest are sent as null so an edit clears them.
export async function savePromotion(id: string | null, input: PromotionInput): Promise<string> {
    const type = input.promotion_type;
    const isItem = type === 'item_discount';
    const isBundle = type === 'bundle';
    const isBuyGet = type === 'buy_x_get_y';
    const targetKind = isBundle ? 'products' : input.target_kind;
    const bundleItems = isBundle ? input.bundle_items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })) : null;
    const { data, error } = await supabase.rpc('admin_save_promotion', {
        p_id: id ?? undefined,
        p_title: input.title.trim(),
        p_description: input.description?.trim() || undefined,
        p_discount_type: isItem ? input.discount_type : null,
        p_discount_value: isItem ? input.discount_value : null,
        p_target_kind: targetKind,
        p_target_value: input.target_value?.trim() || undefined,
        p_target_product_ids: isBundle ? (bundleItems ?? []).map((i) => i.product_id) : targetKind === 'products' ? input.target_product_ids : [],
        p_start_date: input.start_date,
        p_end_date: input.end_date ?? undefined,
        p_promotion_type: type,
        p_buy_quantity: isBuyGet ? input.buy_quantity : null,
        p_get_quantity: isBuyGet ? input.get_quantity : null,
        p_get_discount_percent: isBuyGet ? input.get_discount_percent : null,
        p_tiers: type === 'quantity_tier' ? input.tiers.map((t) => ({ min_quantity: t.min_quantity, percent: t.percent })) : null,
        p_bundle_items: bundleItems,
        p_bundle_price: isBundle ? input.bundle_price : null,
        p_max_applications_per_order: isBuyGet || isBundle ? input.max_applications_per_order : null,
        p_target_category_id: targetKind === 'category' ? input.target_category_id : null,
        p_target_brand_id: targetKind === 'brand' ? input.target_brand_id : null,
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

export async function fetchDeliveryPolicySettings(): Promise<DeliveryPolicySettings> {
    const { data, error } = await supabase
        .from('app_settings')
        .select('notification_emails,require_packing_check,require_delivery_proof')
        .eq('id', true)
        .maybeSingle();
    if (error) throw error;
    return {
        notification_emails: data?.notification_emails ?? [],
        require_packing_check: data?.require_packing_check ?? false,
        require_delivery_proof: data?.require_delivery_proof ?? false,
    };
}

export async function saveDeliveryPolicySettings(settings: DeliveryPolicySettings): Promise<void> {
    const { error } = await supabase
        .from('app_settings')
        .update({ ...settings, updated_at: new Date().toISOString() })
        .eq('id', true);
    if (error) throw error;
}

// Reviews ------------------------------------------------------------------------------

export async function fetchAdminReviews(status: 'all' | 'published' | 'hidden', page: number, pageSize: number): Promise<PageResult<AdminReview>> {
    let query = supabase.from('reviews')
        .select('id,product_id,user_name,rating,comment,status,created_at,order_id,is_verified_purchase,products(name_ar)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
    if (status !== 'all') query = query.eq('status', status);
    const { data, error, count } = await query;
    if (error) throw error;
    const rows = (data ?? []).map((r) => ({
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
    return { rows, total: count ?? 0 };
}

export async function moderateReview(id: string, status: 'published' | 'hidden'): Promise<void> {
    const { error } = await supabase.rpc('moderate_product_review', { p_review_id: id, p_status: status, p_remove_images: false });
    if (error) throw error;
}

export async function bulkSetReviewStatus(ids: string[], status: 'published' | 'hidden'): Promise<number> {
    const { data, error } = await supabase.rpc('admin_bulk_set_review_status', { p_ids: ids, p_status: status });
    if (error) throw error;
    return Number(data ?? 0);
}

// Returns (T2-12) ------------------------------------------------------------------

export async function fetchOrderReturns(params: { search: string; page: number; pageSize: number }): Promise<PageResult<import('../types').OrderReturn>> {
    const { data, error } = await supabase.rpc('admin_list_order_returns', {
        p_limit: params.pageSize,
        p_offset: params.page * params.pageSize,
        p_search: params.search.trim() || null,
    });
    if (error) throw error;
    const rows = (data ?? []).map((r) => ({
        ...r,
        status: r.status as import('../types').ReturnStatus,
        requested_resolution: r.requested_resolution as import('../types').OrderReturn['requested_resolution'],
        items: Array.isArray(r.items) ? (r.items as unknown as import('../types').ReturnItem[]) : [],
        order_total: r.order_total == null ? null : Number(r.order_total),
        refund_amount: r.refund_amount == null ? null : Number(r.refund_amount),
        returned_items_value: Number(r.returned_items_value ?? 0),
        refundable_cap: Number(r.refundable_cap ?? 0),
    }));
    return { rows, total: Number(data?.[0]?.total_count ?? 0) };
}

export async function reviewOrderReturn(
    returnId: string,
    status: import('../types').ReturnStatus,
    adminNote?: string,
    restock?: boolean,
    refundAmount?: number,
    refundReference?: string,
): Promise<void> {
    const { error } = await supabase.rpc('review_order_return', {
        p_return_id: returnId,
        p_status: status,
        p_admin_note: adminNote?.trim() || undefined,
        p_restock: restock ?? false,
        p_refund_amount: refundAmount ?? undefined,
        p_refund_reference: refundReference?.trim() || undefined,
    });
    if (error) throw error;
}

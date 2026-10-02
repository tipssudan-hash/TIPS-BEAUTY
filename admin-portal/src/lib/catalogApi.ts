import { supabase } from './supabase';
import type { AdminReview, Banner, Collection, Coupon, CouponInput, CollectionInput, CollectionRuleConfig, CollectionRuleType, DeliveryPricingConfig, DeliveryQuote, DeliveryZone, Driver, InventoryRow, Product, ProductInput, ProductVariant, Promotion, PromotionInput, Warehouse } from '../types';
import type { Json } from './database.types';

// latitude/longitude/base_dispatch_minutes (warehouses), latitude/longitude (delivery_zones):
// added by GPS-01/GPS-02, ahead of generated types until those migrations are applied and
// `supabase gen types` is re-run — same `as any` pattern already used elsewhere in this file
// for RPCs ahead of their types (e.g. admin_get_coupons below).

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
        weight_grams: row.weight_grams ?? null,
        length_cm: row.length_cm != null ? Number(row.length_cm) : null,
        width_cm: row.width_cm != null ? Number(row.width_cm) : null,
        height_cm: row.height_cm != null ? Number(row.height_cm) : null,
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

// Warehouses / inventory --------------------------------------------------------------

export async function fetchWarehouses(): Promise<Warehouse[]> {
    const { data, error } = await supabase.from('warehouses').select('id,name,code,state,city,address,phone,is_active,latitude,longitude,base_dispatch_minutes' as any).order('created_at');
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
    const { data, error } = await supabase.from('delivery_zones').select('id,name,fee,is_active,state,warehouse_id,latitude,longitude' as any).order('state').order('name');
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
        .from('delivery_pricing_config' as any)
        .select('id,warehouse_id,delivery_zone_id,state,base_fee,per_km_rate,weight_multiplier,road_multiplier,min_fee,max_fee,avg_speed_kmh,is_active')
        .order('warehouse_id', { nullsFirst: true })
        .order('delivery_zone_id', { nullsFirst: true });
    if (error) throw error;
    return (data ?? []) as unknown as DeliveryPricingConfig[];
}

export type PricingConfigInput = Omit<DeliveryPricingConfig, 'id'>;

export async function savePricingConfig(id: string | null, input: PricingConfigInput): Promise<void> {
    const query = id
        ? supabase.from('delivery_pricing_config' as any).update(input as never).eq('id', id)
        : supabase.from('delivery_pricing_config' as any).insert(input as never);
    const { error } = await query;
    if (error) throw error;
}

export async function deletePricingConfig(id: string): Promise<void> {
    const { error } = await supabase.from('delivery_pricing_config' as any).delete().eq('id', id);
    if (error) throw error;
}

export async function fetchPricingConfigAudit(configId: string): Promise<{ id: number; action: string; changed_at: string; old_values: Json | null; new_values: Json | null }[]> {
    const { data, error } = await supabase
        .from('delivery_pricing_config_audit' as any)
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
    const { data, error } = await supabase.rpc('calculate_delivery_quote' as any, {
        p_warehouse_id: warehouseId,
        p_delivery_zone_id: deliveryZoneId,
        p_order_weight: orderWeight,
    } as any);
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
    const { data, error } = await supabase.rpc('admin_get_coupons' as any);
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
        ...row,
        discount_type: row.discount_type as Coupon['discount_type'],
        discount_value: Number(row.discount_value),
        max_discount_amount: row.max_discount_amount == null ? null : Number(row.max_discount_amount),
        min_order_amount: Number(row.min_order_amount),
        affiliate_id: row.affiliate_id ?? null,
    }));
}

export async function saveCoupon(id: string | null, input: CouponInput): Promise<string> {
    const { data, error } = await supabase.rpc('admin_save_coupon' as any, {
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
    } as any);
    if (error) throw error;
    return data;
}

export async function deleteCoupon(id: string): Promise<void> {
    const { error } = await supabase.rpc('admin_delete_coupon' as any, { p_id: id } as any);
    if (error) throw error;
}

// Marketers / Affiliates ---------------------------------------------------------------

export async function fetchAffiliates(): Promise<import('../types').Affiliate[]> {
    const { data, error } = await supabase.rpc('admin_get_affiliates' as any);
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
        ...row,
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
    const { data, error } = await supabase.rpc('admin_save_affiliate' as any, {
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
    } as any);
    if (error) throw error;
    return data;
}

export async function recordAffiliatePayout(input: import('../types').AffiliatePayoutInput): Promise<string> {
    const { data, error } = await supabase.rpc('admin_record_affiliate_payout' as any, {
        p_affiliate_id: input.affiliate_id,
        p_amount: input.amount,
        p_payout_method: input.payout_method.trim(),
        p_reference_number: input.reference_number?.trim() || undefined,
        p_notes: input.notes?.trim() || undefined,
    } as any);
    if (error) throw error;
    return data;
}

export async function fetchAffiliateDetails(id: string): Promise<import('../types').AffiliateDetails> {
    const { data, error } = await supabase.rpc('admin_get_affiliate_details' as any, { p_affiliate_id: id } as any);
    if (error) throw error;
    const res = data as any;
    return {
        profile: {
            ...res.profile,
            commission_rate: Number(res.profile?.commission_rate ?? 0),
            minimum_payout: Number(res.profile?.minimum_payout ?? 0),
        },
        stats: {
            total_orders: Number(res.stats?.total_orders ?? 0),
            total_sales: Number(res.stats?.total_sales ?? 0),
            total_discount_given: Number(res.stats?.total_discount_given ?? 0),
            total_commission_earned: Number(res.stats?.total_commission_earned ?? 0),
            total_payouts_paid: Number(res.stats?.total_payouts_paid ?? 0),
            pending_balance: Number(res.stats?.pending_balance ?? 0),
        },
        coupons: (res.coupons ?? []).map((c: any) => ({
            ...c,
            discount_value: Number(c.discount_value ?? 0),
            max_discount_amount: c.max_discount_amount == null ? null : Number(c.max_discount_amount),
            usage_count: Number(c.usage_count ?? 0),
        })),
        orders: (res.orders ?? []).map((o: any) => ({
            ...o,
            total: Number(o.total ?? 0),
            discount_amount: Number(o.discount_amount ?? 0),
        })),
        commissions: (res.commissions ?? []).map((c: any) => ({
            ...c,
            commission_amount: Number(c.commission_amount ?? 0),
            commission_rate: Number(c.commission_rate ?? 0),
        })),
        payouts: (res.payouts ?? []).map((p: any) => ({
            ...p,
            amount: Number(p.amount ?? 0),
        })),
    };
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

// Returns (T2-12) ------------------------------------------------------------------

export async function fetchOrderReturns(): Promise<import('../types').OrderReturn[]> {
    // admin_list_order_returns is ahead of generated types until this migration is applied and
    // `supabase gen types` is re-run — same as any pattern as elsewhere in this file.
    const { data, error } = await supabase.rpc('admin_list_order_returns' as any);
    if (error) throw error;
    return ((data ?? []) as any[]).map((r) => ({
        ...r,
        items: Array.isArray(r.items) ? r.items : [],
    }));
}

export async function reviewOrderReturn(returnId: string, status: import('../types').ReturnStatus, adminNote?: string, restock?: boolean): Promise<void> {
    const { error } = await supabase.rpc('review_order_return', {
        p_return_id: returnId,
        p_status: status,
        p_admin_note: adminNote?.trim() || undefined,
        p_restock: restock ?? false,
    });
    if (error) throw error;
}

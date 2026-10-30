import { supabase } from '../supabase/client';
import type { Banner, Brand, Category, Collection, DeliveryZone, Offer, PaymentMethod } from '../../domain/entities';
import { staleWhileRevalidate, SHORT_TTL_MS } from '../cache';
import { errorMessage } from '../../application/errors';
import { loadDevMockData } from './devMockData';

function catalogError(error: unknown, fallback: string): Error {
    return new Error(errorMessage(error, fallback));
}

const nullableNumber = (value: number | null) => (value == null ? null : Number(value));

// Offers: the Promotions running now, resolved by the backend (0019 keeps the table itself private).
export function fetchOffers(): Promise<Offer[]> {
    return staleWhileRevalidate<Offer[]>('catalog:offers', async () => {
        const { data, error } = await supabase.rpc('get_active_promotions');
        if (!error && Array.isArray(data)) {
            return data.map((o) => ({
                id: o.id,
                title: o.title,
                description: o.description,
                promotionType: o.promotion_type as Offer['promotionType'],
                discountType: o.discount_type == null ? null : o.discount_type === 'fixed' ? 'fixed' : 'percentage',
                discountValue: nullableNumber(o.discount_value),
                buyQuantity: nullableNumber(o.buy_quantity),
                getQuantity: nullableNumber(o.get_quantity),
                getDiscountPercent: nullableNumber(o.get_discount_percent),
                tiers: ((o.tiers ?? []) as { min_quantity: number; percent: number }[]).map((t) => ({ minQuantity: Number(t.min_quantity), percent: Number(t.percent) })),
                bundlePrice: nullableNumber(o.bundle_price),
                bundleItems: ((o.bundle_items ?? []) as { product_id: string; quantity: number }[]).map((b) => ({ productId: b.product_id, quantity: Number(b.quantity) })),
                targetKind: (['all', 'category', 'brand', 'products'].includes(o.target_kind) ? o.target_kind : 'all') as Offer['targetKind'],
                targetValue: o.target_value,
                endsAt: o.end_date,
                productIds: o.product_ids ?? [],
            }));
        }
        const mocks = await loadDevMockData();
        if (mocks) return mocks.MOCK_OFFERS;
        throw catalogError(error, 'تعذر تحميل العروض، حاولي مرة أخرى.');
    });
}

// Home-page banners. Content, not eligibility data: the public SELECT policy already limits rows to
// active ones inside their schedule, so a direct read is the whole contract.
export function fetchBanners(): Promise<Banner[]> {
    return staleWhileRevalidate<Banner[]>('catalog:banners', async () => {
        const { data, error } = await supabase.from('storefront_banners')
            .select('id,title_ar,subtitle_ar,image_url,action_type,action_value,display_order')
            .order('display_order').order('created_at');
        if (!error && Array.isArray(data)) {
            const kinds: Banner['actionType'][] = ['none', 'category', 'product', 'collection', 'url'];
            return data.filter((b) => b.image_url).map((b) => ({
                id: b.id,
                title_ar: b.title_ar,
                subtitle_ar: b.subtitle_ar,
                imageUrl: b.image_url as string,
                actionType: kinds.includes(b.action_type as Banner['actionType']) ? (b.action_type as Banner['actionType']) : 'none',
                actionValue: b.action_value,
            }));
        }
        const mocks = await loadDevMockData();
        if (mocks) return mocks.MOCK_BANNERS;
        throw catalogError(error, 'تعذر تحميل العروض الترويجية، حاولي مرة أخرى.');
    });
}

export function fetchCollections(): Promise<Collection[]> {
    return staleWhileRevalidate<Collection[]>('catalog:collections', async () => {
        const { data, error } = await supabase.rpc('get_storefront_collections');
        if (!error && Array.isArray(data)) {
            return data.map((c) => ({
                id: c.id,
                slug: c.slug,
                name_ar: c.name_ar,
                description_ar: c.description_ar,
                icon: c.icon,
                displayOrder: c.display_order,
                productIds: c.product_ids ?? [],
            }));
        }
        const mocks = await loadDevMockData();
        if (mocks) return mocks.MOCK_COLLECTIONS;
        throw catalogError(error, 'تعذر تحميل التشكيلات، حاولي مرة أخرى.');
    });
}

type CategoryRow = { id: string; parent_id: string | null; name_ar: string; name_en: string | null; slug: string | null; image_url: string | null; icon: string | null; sort_order: number; product_count: number | null };
type BrandRow = { id: string; name_ar: string; name_en: string | null; slug: string | null; logo_url: string | null; sort_order: number; product_count: number | null };

// Active categories only (the RPC hides the rest). In mock mode the taxonomy stays empty: the mock products carry no category or brand ids.
export function fetchCategories(): Promise<Category[]> {
    return staleWhileRevalidate<Category[]>('catalog:categories', async () => {
        const { data, error } = await supabase.rpc('get_public_categories');
        if (!error && Array.isArray(data)) {
            return (data as CategoryRow[]).map((c) => ({
                id: c.id,
                parentId: c.parent_id,
                name_ar: c.name_ar,
                name_en: c.name_en,
                slug: c.slug,
                imageUrl: c.image_url,
                icon: c.icon,
                sortOrder: Number(c.sort_order),
                productCount: Number(c.product_count ?? 0),
            }));
        }
        if (await loadDevMockData()) return [];
        throw catalogError(error, 'تعذر تحميل التصنيفات، حاولي مرة أخرى.');
    });
}

export function fetchBrands(): Promise<Brand[]> {
    return staleWhileRevalidate<Brand[]>('catalog:brands', async () => {
        const { data, error } = await supabase.rpc('get_public_brands');
        if (!error && Array.isArray(data)) {
            return (data as BrandRow[]).map((b) => ({
                id: b.id,
                name_ar: b.name_ar,
                name_en: b.name_en,
                slug: b.slug,
                logoUrl: b.logo_url,
                sortOrder: Number(b.sort_order),
                productCount: Number(b.product_count ?? 0),
            }));
        }
        if (await loadDevMockData()) return [];
        throw catalogError(error, 'تعذر تحميل العلامات التجارية، حاولي مرة أخرى.');
    });
}

// Checkout cannot proceed without payment methods, so a failed read is an error, never a stand-in list.
export function fetchPaymentMethods(): Promise<PaymentMethod[]> {
    return staleWhileRevalidate<PaymentMethod[]>('catalog:paymentMethods', async () => {
        const { data, error } = await supabase.from('payment_methods').select('code,name_ar,description_ar,requires_proof,account_details').eq('is_active', true).order('display_order');
        if (!error && Array.isArray(data)) {
            return data.map((m) => ({
                code: m.code,
                nameAr: m.name_ar,
                descriptionAr: m.description_ar,
                requiresProof: m.requires_proof,
                accountDetails: (m.account_details ?? {}) as Record<string, string>,
            }));
        }
        const mocks = await loadDevMockData();
        if (mocks) return mocks.MOCK_PAYMENT_METHODS;
        throw catalogError(error, 'تعذر تحميل طرق الدفع، حاولي مرة أخرى.');
    }, SHORT_TTL_MS);
}

// Checkout cannot proceed without delivery zones, so a failed read is an error, never a stand-in list.
export function fetchDeliveryZones(): Promise<DeliveryZone[]> {
    return staleWhileRevalidate<DeliveryZone[]>('catalog:deliveryZones', async () => {
        const { data, error } = await supabase.from('delivery_zones').select('id,name,state,fee').eq('is_active', true).order('name');
        if (!error && Array.isArray(data)) {
            return data.map((z) => ({ id: z.id, name: z.name, state: z.state, fee: Number(z.fee) }));
        }
        const mocks = await loadDevMockData();
        if (mocks) return mocks.MOCK_DELIVERY_ZONES;
        throw catalogError(error, 'تعذر تحميل محليات التوصيل، حاولي مرة أخرى.');
    }, SHORT_TTL_MS);
}

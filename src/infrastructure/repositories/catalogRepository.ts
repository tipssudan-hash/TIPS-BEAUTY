import { supabase } from '../supabase/client';
import { MOCK_BANNERS, MOCK_COLLECTIONS, MOCK_DELIVERY_ZONES, MOCK_OFFERS, MOCK_PAYMENT_METHODS } from '../mockData';
import type { Banner, Collection, DeliveryZone, Offer, PaymentMethod } from '../../domain/entities';

// Offers: the Promotions running now, resolved by the backend (0019 keeps the table itself private).
export async function fetchOffers(): Promise<Offer[]> {
    try {
        const { data, error } = await supabase.rpc('get_active_promotions');
        if (!error && Array.isArray(data) && data.length > 0) {
            return data.map((o) => ({
                id: o.id,
                title: o.title,
                description: o.description,
                discountType: o.discount_type === 'fixed' ? 'fixed' : 'percentage',
                discountValue: Number(o.discount_value),
                targetKind: (['all', 'category', 'brand', 'products'].includes(o.target_kind) ? o.target_kind : 'all') as Offer['targetKind'],
                targetValue: o.target_value,
                endsAt: o.end_date,
                productIds: o.product_ids ?? [],
            }));
        }
    } catch {
        // Fallback below
    }
    return MOCK_OFFERS;
}

// Home-page banners. Content, not eligibility data: the public SELECT policy already limits rows to
// active ones inside their schedule, so a direct read is the whole contract.
export async function fetchBanners(): Promise<Banner[]> {
    try {
        const { data, error } = await supabase.from('storefront_banners')
            .select('id,title_ar,subtitle_ar,image_url,action_type,action_value,display_order')
            .order('display_order').order('created_at');
        if (!error && Array.isArray(data) && data.length > 0) {
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
    } catch {
        // Fallback below
    }
    return MOCK_BANNERS;
}

export async function fetchCollections(): Promise<Collection[]> {
    try {
        const { data, error } = await supabase.rpc('get_storefront_collections');
        if (!error && Array.isArray(data) && data.length > 0) {
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
    } catch {
        // Fallback below
    }
    return MOCK_COLLECTIONS;
}

export async function fetchPaymentMethods(): Promise<PaymentMethod[]> {
    try {
        const { data, error } = await supabase.from('payment_methods').select('code,name_ar,description_ar,requires_proof,account_details').eq('is_active', true).order('display_order');
        if (!error && Array.isArray(data) && data.length > 0) {
            return data.map((m) => ({
                code: m.code,
                nameAr: m.name_ar,
                descriptionAr: m.description_ar,
                requiresProof: m.requires_proof,
                accountDetails: (m.account_details ?? {}) as Record<string, string>,
            }));
        }
    } catch {
        // Fallback below
    }
    return MOCK_PAYMENT_METHODS;
}

export async function fetchDeliveryZones(): Promise<DeliveryZone[]> {
    try {
        const { data, error } = await supabase.from('delivery_zones').select('id,name,state,fee').eq('is_active', true).order('name');
        if (!error && Array.isArray(data) && data.length > 0) {
            return data.map((z) => ({ id: z.id, name: z.name, state: z.state, fee: Number(z.fee) }));
        }
    } catch {
        // Fallback below
    }
    return MOCK_DELIVERY_ZONES;
}

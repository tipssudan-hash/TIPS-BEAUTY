import { supabase } from '../supabase/client';
import { MOCK_PRODUCTS } from '../mockData';
import type { PricingRule, Product, ProductVariant } from '../../domain/entities';

// Thin typed wrappers over the backend RPCs. All pricing, stock and permission rules live in
// the database; this file only maps rows to app types.

type ProductRow = {
    id: string; name_ar: string; name_en: string | null; price: number; discount_percentage: number | null;
    effective_price: number | null; pricing_rule_kind: string | null; pricing_rule_label: string | null;
    category: string | null; brand: string | null; image: string | null; images: string[] | null; description: string | null;
    benefits: string[] | null; ingredients: string[] | null; usage: string | null; origin: string | null; expiry: string | null;
    stock: number | null; is_imported: boolean | null; skin_type: string[] | null; reviews_count: number | null;
    average_rating: number | null; created_at: string; variants: unknown;
};

function mapPricingRule(kind: string | null | undefined, label: string | null | undefined): PricingRule | null {
    return (kind === 'discount' || kind === 'promotion') && label ? { kind, label } : null;
}

type VariantRow = { id: string; name_ar: string; name_en: string | null; price: number | null; effective_price: number | null; pricing_rule_kind: string | null; pricing_rule_label: string | null };

// Variants arrive enriched by the catalogue RPCs (public_variants) with the price each one is charged at.
function mapVariants(raw: unknown, fallbackPrice: number): ProductVariant[] {
    if (!Array.isArray(raw)) return [];
    return (raw as VariantRow[])
        .filter((v) => v && typeof v.id === 'string' && typeof v.name_ar === 'string')
        .map((v) => ({
            id: v.id,
            name_ar: v.name_ar,
            name_en: v.name_en ?? '',
            price: v.price == null ? null : Number(v.price),
            effectivePrice: Number(v.effective_price ?? v.price ?? fallbackPrice),
            pricingRule: mapPricingRule(v.pricing_rule_kind, v.pricing_rule_label),
        }));
}

export function mapProduct(row: ProductRow): Product {
    return {
        id: row.id,
        name_ar: row.name_ar,
        name_en: row.name_en ?? '',
        price: Number(row.price),
        discountPercentage: Number(row.discount_percentage ?? 0),
        effectivePrice: Number(row.effective_price ?? row.price),
        pricingRule: mapPricingRule(row.pricing_rule_kind, row.pricing_rule_label),
        category: row.category ?? '',
        brand: row.brand ?? '',
        image: row.image ?? (row.images?.[0] ?? ''),
        images: row.images?.length ? row.images : row.image ? [row.image] : [],
        description: row.description ?? '',
        benefits: row.benefits ?? [],
        ingredients: row.ingredients ?? [],
        usage: row.usage ?? '',
        origin: row.origin ?? '',
        expiry: row.expiry ?? '',
        stock: Number(row.stock ?? 0),
        isImported: Boolean(row.is_imported),
        skinType: row.skin_type ?? [],
        rating: Number(row.average_rating ?? 0),
        reviewCount: Number(row.reviews_count ?? 0),
        variants: mapVariants(row.variants, Number(row.effective_price ?? row.price)),
        createdAt: row.created_at,
    };
}

export async function fetchProducts(): Promise<Product[]> {
    try {
        const { data, error } = await supabase.rpc('get_public_products');
        if (!error && Array.isArray(data) && data.length > 0) {
            return (data as ProductRow[]).map(mapProduct);
        }
    } catch {
        // Fallback below
    }
    try {
        const { data, error } = await supabase.from('products').select('*');
        if (!error && Array.isArray(data) && data.length > 0) {
            return (data as unknown as ProductRow[]).map(mapProduct);
        }
    } catch {
        // Fallback to mock catalog
    }
    return MOCK_PRODUCTS;
}

export async function fetchProduct(id: string): Promise<Product | null> {
    try {
        const { data, error } = await supabase.rpc('get_public_product', { p_product_id: id });
        if (!error && data && (data as ProductRow[]).length > 0) {
            const row = (data as ProductRow[])[0];
            return row ? mapProduct(row) : null;
        }
    } catch {
        // Fallback below
    }
    try {
        const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
        if (!error && data) {
            return mapProduct(data as unknown as ProductRow);
        }
    } catch {
        // Fallback to mock product
    }
    return MOCK_PRODUCTS.find((p) => p.id === id) ?? null;
}

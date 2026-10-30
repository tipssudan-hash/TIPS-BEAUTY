import { supabase } from '../supabase/client';
import type { PricingRule, Product, ProductVariant } from '../../domain/entities';
import { cachedFetch, staleWhileRevalidate, CATALOG_TTL_MS } from '../cache';
import { errorMessage } from '../../application/errors';
import { loadDevMockData } from './devMockData';

const STORAGE_OBJECT_PATH = '/storage/v1/object/public/';
const STORAGE_RENDER_PATH = '/storage/v1/render/image/public/';

// Returns a resized and optimized image URL (Unsplash, Supabase Storage, etc.).
// Storage images go through the render endpoint; when image transformation is off for the project, the
// <img> falls back to the original URL (see ProductImage).
export function imgUrl(
    raw: string | null | undefined,
    width: number,
    quality = 75,
): string {
    if (!raw) return '';

    // Handle Unsplash images: optimize dimension, quality and format
    if (raw.includes('images.unsplash.com')) {
        try {
            const url = new URL(raw);
            url.searchParams.set('w', width.toString());
            url.searchParams.set('q', quality.toString());
            url.searchParams.set('auto', 'format');
            url.searchParams.set('fit', 'crop');
            return url.toString();
        } catch {
            return raw;
        }
    }

    // Handle Supabase Storage URLs
    if (raw.includes(STORAGE_OBJECT_PATH)) {
        try {
            // Check if transformation endpoint is available or add query params
            const url = new URL(raw);
            url.searchParams.set('width', width.toString());
            url.searchParams.set('quality', quality.toString());
            url.searchParams.set('format', 'webp');
            return url.toString();
        } catch {
            return raw;
        }
    }

    return raw;
}

// Storage images through the render endpoint, which resizes on the server. It is only used where the caller
// can fall back to the original URL (ProductImage): a project without image transformations answers with an error.
export function imgRenderUrl(raw: string | null | undefined, width: number, quality = 75): string {
    if (!raw) return '';
    if (!raw.includes(STORAGE_OBJECT_PATH)) return imgUrl(raw, width, quality);
    try {
        const url = new URL(raw.replace(STORAGE_OBJECT_PATH, STORAGE_RENDER_PATH));
        url.searchParams.set('width', width.toString());
        url.searchParams.set('quality', quality.toString());
        return url.toString();
    } catch {
        return raw;
    }
}

export function imgRenderSrcSet(raw: string | null | undefined, width: number, quality = 75): string {
    if (!raw || !raw.includes(STORAGE_OBJECT_PATH)) return imgSrcSet(raw, width, quality);
    return `${imgRenderUrl(raw, width, quality)} 1x, ${imgRenderUrl(raw, Math.min(width * 2, 800), quality)} 2x`;
}


// Returns a srcSet string for 1x and 2x display widths.
export function imgSrcSet(raw: string | null | undefined, width: number, quality = 75): string {
    if (!raw) return '';
    if (raw.includes('images.unsplash.com') || raw.includes('/storage/v1/object/public/')) {
        return `${imgUrl(raw, width, quality)} 1x, ${imgUrl(raw, Math.min(width * 2, 800), quality)} 2x`;
    }
    return '';
}

// Thin typed wrappers over the backend RPCs. All pricing, stock and permission rules live in
// the database; this file only maps rows to app types.

type ProductRow = {
    id: string; name_ar: string; name_en: string | null; price: number; discount_percentage: number | null;
    effective_price: number | null; pricing_rule_kind: string | null; pricing_rule_label: string | null;
    category: string | null; brand: string | null; category_id: string | null; brand_id: string | null; image: string | null; images: string[] | null; description: string | null;
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
        categoryId: row.category_id ?? undefined,
        brandId: row.brand_id ?? undefined,
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

const PRODUCTS_ERROR = 'تعذر تحميل المنتجات، تحققي من الاتصال وحاولي مرة أخرى.';
const PRODUCT_ERROR = 'تعذر تحميل المنتج، تحققي من الاتصال وحاولي مرة أخرى.';

// An empty catalogue is a real answer; only a failed read falls through to the table and then to an error.
async function _fetchProducts(): Promise<Product[]> {
    const { data, error } = await supabase.rpc('get_public_products');
    if (!error && Array.isArray(data)) return (data as ProductRow[]).map(mapProduct);

    const table = await supabase.from('products').select('*');
    if (!table.error && Array.isArray(table.data)) return (table.data as unknown as ProductRow[]).map(mapProduct);

    const mocks = await loadDevMockData();
    if (mocks) return mocks.MOCK_PRODUCTS;
    throw new Error(errorMessage(error ?? table.error, PRODUCTS_ERROR));
}

export function fetchProducts(): Promise<Product[]> {
    return staleWhileRevalidate('products:all', _fetchProducts, CATALOG_TTL_MS);
}

async function _fetchProduct(id: string): Promise<Product | null> {
    const { data, error } = await supabase.rpc('get_public_product', { p_product_id: id });
    if (!error && Array.isArray(data) && data.length > 0) return mapProduct((data as ProductRow[])[0]);

    const table = await supabase.from('products').select('*').eq('id', id).eq('is_active', true).maybeSingle();
    if (!table.error) return table.data ? mapProduct(table.data as unknown as ProductRow) : null;

    const mocks = await loadDevMockData();
    if (mocks) return mocks.MOCK_PRODUCTS.find((p) => p.id === id) ?? null;
    throw new Error(errorMessage(error ?? table.error, PRODUCT_ERROR));
}

export function fetchProduct(id: string): Promise<Product | null> {
    return cachedFetch(`product:${id}`, () => _fetchProduct(id));
}


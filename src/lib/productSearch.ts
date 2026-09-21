import { Product } from '../types';

// Shared by HomePage's quick in-place filtering and SearchPage's URL-addressable browse/search,
// so the two never define "matches this filter" differently (extracted from HomePage, which
// previously carried this logic alone — see design-system audit).
export const ALL_CATEGORIES = 'الكل';
export const ALL_BRANDS = 'الكل';

export type ProductSortBy = 'newest' | 'price-low' | 'price-high' | 'rating' | 'popular';

export interface ProductFilters {
    query: string;
    category: string;
    brand: string;
    sortBy: ProductSortBy;
}

export function filterAndSortProducts(products: Product[], { query, category, brand, sortBy }: ProductFilters): Product[] {
    const q = query.trim();
    const result = products.filter((p) => {
        const matchSearch = q === '' || p.name_ar.includes(q) || p.brand.includes(q) || p.name_en.toLowerCase().includes(q.toLowerCase());
        const matchCat = category === ALL_CATEGORIES || p.category === category;
        const matchBrand = brand === ALL_BRANDS || p.brand === brand;
        return matchSearch && matchCat && matchBrand;
    });

    switch (sortBy) {
        case 'newest':
            result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            break;
        case 'price-low':
            result.sort((a, b) => a.price - b.price);
            break;
        case 'price-high':
            result.sort((a, b) => b.price - a.price);
            break;
        case 'rating':
            result.sort((a, b) => (b.rating || 0) - (a.rating || 0));
            break;
        case 'popular':
            result.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
            break;
    }
    return result;
}

export function availableCategories(products: Product[]): string[] {
    return Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort();
}

export function availableBrands(products: Product[]): string[] {
    return Array.from(new Set(products.map((p) => p.brand).filter(Boolean))).sort();
}

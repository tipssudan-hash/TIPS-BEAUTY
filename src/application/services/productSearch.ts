import type { Brand, Category, Product } from '../../domain/entities';

// Shared by HomePage's quick in-place filtering and SearchPage's URL-addressable browse/search,
// so the two never define "matches this filter" differently (extracted from HomePage, which
// previously carried this logic alone — see design-system audit).
export const ALL_CATEGORIES = 'الكل';
export const ALL_BRANDS = 'الكل';

export type ProductSortBy = 'newest' | 'price-low' | 'price-high' | 'rating' | 'popular';

export interface ProductFilters {
    query: string;
    categoryId: string | null;
    brand: string;
    sortBy: ProductSortBy;
}

export interface TaxonomyOrdered {
    sortOrder: number;
    name_ar: string;
}

export function sortTaxonomy<T extends TaxonomyOrdered>(items: T[]): T[] {
    return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.name_ar.localeCompare(b.name_ar, 'ar'));
}

// The category itself plus every descendant. Two levels today, but walking the tree keeps the rule honest.
export function categoryScopeIds(categories: Category[], categoryId: string): Set<string> {
    const scope = new Set<string>([categoryId]);
    let frontier = [categoryId];
    while (frontier.length > 0) {
        const children = categories
            .filter((c) => c.parentId !== null && frontier.includes(c.parentId) && !scope.has(c.id))
            .map((c) => c.id);
        children.forEach((id) => scope.add(id));
        frontier = children;
    }
    return scope;
}

// Links and URLs carry the category name; an unknown name resolves to an id no Product has, so it matches nothing.
export const UNKNOWN_CATEGORY_ID = '';

export function categoryIdForName(categories: Category[], name: string): string {
    return categories.find((c) => c.name_ar === name)?.id ?? UNKNOWN_CATEGORY_ID;
}

export function storefrontCategories(categories: Category[]): Category[] {
    return sortTaxonomy(categories.filter((c) => c.parentId === null && c.productCount > 0));
}

export function childCategories(categories: Category[], parentId: string): Category[] {
    return sortTaxonomy(categories.filter((c) => c.parentId === parentId && c.productCount > 0));
}

export function storefrontBrands(brands: Brand[]): Brand[] {
    return sortTaxonomy(brands.filter((b) => b.productCount > 0));
}

export function filterAndSortProducts(products: Product[], { query, categoryId, brand, sortBy }: ProductFilters, categories: Category[] = []): Product[] {
    const q = query.trim();
    const scope = categoryId === null ? null : categoryScopeIds(categories, categoryId);
    const result = products.filter((p) => {
        const matchSearch = q === '' || p.name_ar.includes(q) || p.brand.includes(q) || p.name_en.toLowerCase().includes(q.toLowerCase());
        const matchCat = scope === null || (p.categoryId !== undefined && scope.has(p.categoryId));
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

// Degraded mode when the categories read fails: top-level categories rebuilt from already-loaded
// products, ordered by product count like the backfill's sort_order. Never mock data.
export function categoriesFromProducts(products: Product[]): Category[] {
    const groups = new Map<string, { name: string; count: number }>();
    for (const p of products) {
        if (!p.categoryId || !p.category) continue;
        const group = groups.get(p.categoryId) ?? { name: p.category, count: 0 };
        group.count += 1;
        groups.set(p.categoryId, group);
    }
    return [...groups.entries()]
        .sort(([, a], [, b]) => b.count - a.count || a.name.localeCompare(b.name, 'ar'))
        .map(([id, group], index) => ({
            id,
            parentId: null,
            name_ar: group.name,
            name_en: null,
            slug: null,
            imageUrl: null,
            icon: null,
            sortOrder: index,
            productCount: group.count,
        }));
}

export function brandsFromProducts(products: Product[]): Brand[] {
    const groups = new Map<string, { id: string; count: number }>();
    for (const p of products) {
        if (!p.brand) continue;
        const group = groups.get(p.brand) ?? { id: p.brandId ?? p.brand, count: 0 };
        group.count += 1;
        groups.set(p.brand, group);
    }
    return [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'ar'))
        .map(([name, group], index) => ({
            id: group.id,
            name_ar: name,
            name_en: null,
            slug: null,
            logoUrl: null,
            sortOrder: index,
            productCount: group.count,
        }));
}

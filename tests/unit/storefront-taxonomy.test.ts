import { describe, expect, it } from 'vitest';
import type { Brand, Category, Product } from '../../src/domain/entities';
import {
    ALL_BRANDS,
    UNKNOWN_CATEGORY_ID,
    brandsFromProducts,
    categoriesFromProducts,
    categoryIdForName,
    categoryScopeIds,
    childCategories,
    filterAndSortProducts,
    sortTaxonomy,
    storefrontBrands,
    storefrontCategories,
} from '../../src/application/services/productSearch';

function category(id: string, overrides: Partial<Category> = {}): Category {
    return { id, parentId: null, name_ar: `تصنيف ${id}`, name_en: null, slug: null, imageUrl: null, icon: null, sortOrder: 0, productCount: 1, ...overrides };
}

function product(id: string, overrides: Partial<Product> = {}): Product {
    return {
        id,
        name_ar: `منتج ${id}`,
        name_en: id,
        price: 1000,
        discountPercentage: 0,
        effectivePrice: 1000,
        pricingRule: null,
        category: '',
        brand: 'براند',
        image: '',
        images: [],
        description: '',
        benefits: [],
        ingredients: [],
        usage: '',
        origin: '',
        expiry: '',
        stock: 1,
        isImported: false,
        skinType: [],
        rating: 0,
        reviewCount: 0,
        variants: [],
        createdAt: '2024-01-01T00:00:00Z',
        ...overrides,
    };
}

const noFilter = { query: '', categoryId: null, brand: ALL_BRANDS, sortBy: 'newest' as const };

describe('categoryScopeIds', () => {
    const categories = [
        category('makeup'),
        category('lips', { parentId: 'makeup' }),
        category('eyes', { parentId: 'makeup' }),
        category('skin'),
    ];

    it('returns the category and its children, not siblings or other trees', () => {
        expect([...categoryScopeIds(categories, 'makeup')].sort()).toEqual(['eyes', 'lips', 'makeup']);
    });

    it('returns only the category itself for a leaf', () => {
        expect([...categoryScopeIds(categories, 'lips')]).toEqual(['lips']);
    });

    it('terminates when the parent links form a cycle', () => {
        const cyclic = [category('a', { parentId: 'b' }), category('b', { parentId: 'a' })];
        expect([...categoryScopeIds(cyclic, 'a')].sort()).toEqual(['a', 'b']);
    });
});

describe('filterAndSortProducts by categoryId', () => {
    const categories = [category('makeup'), category('lips', { parentId: 'makeup' }), category('skin')];
    const products = [
        product('p-makeup', { categoryId: 'makeup', createdAt: '2024-01-01T00:00:00Z' }),
        product('p-lips', { categoryId: 'lips', createdAt: '2024-02-01T00:00:00Z' }),
        product('p-skin', { categoryId: 'skin' }),
        product('p-unclassified'),
    ];

    it('includes the children products when filtering by a parent', () => {
        const result = filterAndSortProducts(products, { ...noFilter, categoryId: 'makeup' }, categories);
        expect(result.map((p) => p.id).sort()).toEqual(['p-lips', 'p-makeup']);
    });

    it('filters a child category on its own products only', () => {
        const result = filterAndSortProducts(products, { ...noFilter, categoryId: 'lips' }, categories);
        expect(result.map((p) => p.id)).toEqual(['p-lips']);
    });

    it('returns every product when no category is selected, including unclassified ones', () => {
        expect(filterAndSortProducts(products, noFilter, categories)).toHaveLength(4);
    });

    it('drops products without a categoryId once a category is selected', () => {
        const result = filterAndSortProducts(products, { ...noFilter, categoryId: 'skin' }, categories);
        expect(result.map((p) => p.id)).toEqual(['p-skin']);
    });

    it('matches nothing for an unknown category name', () => {
        const unknown = categoryIdForName(categories, 'تصنيف غير موجود');
        expect(unknown).toBe(UNKNOWN_CATEGORY_ID);
        expect(filterAndSortProducts(products, { ...noFilter, categoryId: unknown }, categories)).toEqual([]);
    });

    it('resolves a category name from a legacy ?category= link to its id', () => {
        const id = categoryIdForName(categories, 'تصنيف makeup');
        expect(id).toBe('makeup');
        expect(filterAndSortProducts(products, { ...noFilter, categoryId: id }, categories).map((p) => p.id).sort()).toEqual(['p-lips', 'p-makeup']);
    });
});

describe('ordering by sort_order', () => {
    it('sorts by sortOrder, then by Arabic name for ties', () => {
        const items = [
            category('c', { sortOrder: 2, name_ar: 'ب' }),
            category('a', { sortOrder: 1, name_ar: 'ج' }),
            category('b', { sortOrder: 2, name_ar: 'أ' }),
        ];
        expect(sortTaxonomy(items).map((c) => c.id)).toEqual(['a', 'b', 'c']);
    });

    it('does not mutate the input', () => {
        const items = [category('b', { sortOrder: 2 }), category('a', { sortOrder: 1 })];
        sortTaxonomy(items);
        expect(items.map((c) => c.id)).toEqual(['b', 'a']);
    });

    it('lists top-level categories with products, in sort order, and their children separately', () => {
        const categories = [
            category('late', { sortOrder: 5 }),
            category('early', { sortOrder: 1 }),
            category('empty', { sortOrder: 0, productCount: 0 }),
            category('child-late', { parentId: 'early', sortOrder: 9 }),
            category('child-early', { parentId: 'early', sortOrder: 2 }),
        ];
        expect(storefrontCategories(categories).map((c) => c.id)).toEqual(['early', 'late']);
        expect(childCategories(categories, 'early').map((c) => c.id)).toEqual(['child-early', 'child-late']);
    });

    it('lists brands with products in sort order', () => {
        const brands: Brand[] = [
            { id: 'b1', name_ar: 'ثاني', name_en: null, slug: null, logoUrl: null, sortOrder: 2, productCount: 3 },
            { id: 'b2', name_ar: 'أول', name_en: null, slug: null, logoUrl: null, sortOrder: 1, productCount: 1 },
            { id: 'b3', name_ar: 'مخفي', name_en: null, slug: null, logoUrl: null, sortOrder: 0, productCount: 0 },
        ];
        expect(storefrontBrands(brands).map((b) => b.id)).toEqual(['b2', 'b1']);
    });
});

describe('fallback taxonomy built from loaded products', () => {
    it('groups classified products by categoryId, most products first', () => {
        const products = [
            product('1', { categoryId: 'skin', category: 'العناية بالبشرة' }),
            product('2', { categoryId: 'makeup', category: 'المكياج' }),
            product('3', { categoryId: 'makeup', category: 'المكياج' }),
            product('4'),
        ];
        const derived = categoriesFromProducts(products);
        expect(derived.map((c) => [c.id, c.name_ar, c.productCount, c.sortOrder])).toEqual([
            ['makeup', 'المكياج', 2, 0],
            ['skin', 'العناية بالبشرة', 1, 1],
        ]);
        expect(filterAndSortProducts(products, { ...noFilter, categoryId: 'makeup' }, derived).map((p) => p.id).sort()).toEqual(['2', '3']);
    });

    it('lists each brand name once', () => {
        const products = [product('1', { brand: 'Nivea' }), product('2', { brand: 'Nivea' }), product('3', { brand: 'OGX' }), product('4', { brand: '' })];
        expect(brandsFromProducts(products).map((b) => [b.name_ar, b.productCount])).toEqual([['Nivea', 2], ['OGX', 1]]);
    });
});

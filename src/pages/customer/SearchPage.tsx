import React, { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { ProductCard } from '../../components/ui/ProductCard';
import {
    ALL_BRANDS,
    ALL_CATEGORIES,
    ProductSortBy,
    availableBrands,
    availableCategories,
    filterAndSortProducts,
} from '../../lib/productSearch';

const SORT_OPTIONS: { value: ProductSortBy; label: string }[] = [
    { value: 'newest', label: 'الأحدث' },
    { value: 'price-low', label: 'السعر: الأقل للأعلى' },
    { value: 'price-high', label: 'السعر: الأعلى للأقل' },
    { value: 'rating', label: 'الأعلى تقييماً' },
    { value: 'popular', label: 'الأكثر شعبية' },
];

function isSortBy(value: string): value is ProductSortBy {
    return SORT_OPTIONS.some((o) => o.value === value);
}

// A URL-addressable discovery surface (?q=&category=&brand=&sort=), unlike HomePage's inline
// filtering: shareable, bookmarkable, and reachable directly from the header search icon —
// see the design-system audit's "no dedicated browse/search page" finding.
export const SearchPage: React.FC = () => {
    const { products, productsLoading, productsError, reloadProducts, wishlist, addToCart, toggleWishlist } = useStore();
    const [searchParams, setSearchParams] = useSearchParams();
    const inputRef = useRef<HTMLInputElement>(null);

    const query = searchParams.get('q') ?? '';
    const category = searchParams.get('category') ?? ALL_CATEGORIES;
    const brand = searchParams.get('brand') ?? ALL_BRANDS;
    const sortParam = searchParams.get('sort') ?? 'newest';
    const sortBy: ProductSortBy = isSortBy(sortParam) ? sortParam : 'newest';

    useEffect(() => {
        // Focus the search field on arrival, but not when a query already came in via the URL
        // (e.g. a shared link) — the results are then the more useful thing to land on.
        if (!query) inputRef.current?.focus();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const updateParam = (key: string, value: string, fallback: string) => {
        const next = new URLSearchParams(searchParams);
        if (value === fallback || value === '') next.delete(key);
        else next.set(key, value);
        setSearchParams(next, { replace: true });
    };

    const brands = useMemo(() => availableBrands(products), [products]);
    const categories = useMemo(() => availableCategories(products), [products]);

    const results = useMemo(
        () => filterAndSortProducts(products, { query, category, brand, sortBy }),
        [products, query, category, brand, sortBy]
    );

    const hasActiveFilters = query !== '' || category !== ALL_CATEGORIES || brand !== ALL_BRANDS;

    const clearAll = () => setSearchParams({}, { replace: true });

    return (
        <div className="animate-fadeIn pb-20 max-w-4xl mx-auto px-4 pt-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-6">تصفح المنتجات</h1>

            <div className="mb-4 relative">
                <input
                    ref={inputRef}
                    type="text"
                    placeholder="ابحثي عن منتجات الجمال..."
                    className="w-full bg-white border border-gray-100 rounded-2xl px-6 py-4 outline-none shadow-card-glow focus:ring-2 focus:ring-brand-blue text-gray-700 placeholder-gray-400 font-medium"
                    value={query}
                    onChange={(e) => updateParam('q', e.target.value, '')}
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-brand-blue p-2 rounded-lg pointer-events-none">
                    <Search className="w-4 h-4 text-white" />
                </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 flex-1">
                    <button
                        onClick={() => updateParam('category', ALL_CATEGORIES, ALL_CATEGORIES)}
                        className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${category === ALL_CATEGORIES ? 'bg-brand-blue text-white shadow-md shadow-blue-100' : 'bg-white border border-brand-blue-soft text-gray-500'}`}
                    >
                        الكل
                    </button>
                    {categories.map((c) => (
                        <button
                            key={c}
                            onClick={() => updateParam('category', c, ALL_CATEGORIES)}
                            className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${category === c ? 'bg-brand-blue text-white shadow-md shadow-blue-100' : 'bg-white border border-brand-blue-soft text-gray-500'}`}
                        >
                            {c}
                        </button>
                    ))}
                </div>

                <div className="flex gap-2">
                    <select
                        value={brand}
                        onChange={(e) => updateParam('brand', e.target.value, ALL_BRANDS)}
                        className="bg-white border border-brand-blue-soft text-gray-600 text-sm rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-brand-blue"
                    >
                        <option value={ALL_BRANDS}>كل الماركات</option>
                        {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>

                    <select
                        value={sortBy}
                        onChange={(e) => updateParam('sort', e.target.value, 'newest')}
                        className="bg-white border border-brand-blue-soft text-gray-600 text-sm rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-brand-blue"
                    >
                        {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>
            </div>

            {hasActiveFilters && (
                <button onClick={clearAll} className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-red-500">
                    <X className="w-3.5 h-3.5" /> مسح الفلاتر
                </button>
            )}

            <h2 className="text-sm font-bold text-gray-500 mb-4">{results.length} منتج</h2>

            {productsLoading && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-5" aria-busy="true">
                    {Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-[4/6] rounded-2xl bg-gray-100 animate-pulse" />)}
                </div>
            )}

            {productsError && !productsLoading && (
                <div className="text-center py-16 bg-red-50 rounded-2xl border border-red-100">
                    <p className="text-red-700 font-medium">{productsError}</p>
                    <button onClick={() => void reloadProducts()} className="mt-4 text-brand-blue font-bold hover:underline">إعادة المحاولة</button>
                </div>
            )}

            {!productsLoading && !productsError && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                    {results.map((p) => (
                        <ProductCard
                            key={p.id}
                            product={p}
                            isInWishlist={wishlist.includes(p.id)}
                            onToggleWishlist={toggleWishlist}
                            onAddToCart={addToCart}
                        />
                    ))}
                </div>
            )}

            {!productsLoading && !productsError && results.length === 0 && (
                <div className="text-center py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                    <p className="text-gray-500 font-medium">لا توجد منتجات تطابق بحثك</p>
                    <button onClick={clearAll} className="mt-4 text-brand-blue font-bold hover:underline">عرض كل المنتجات</button>
                </div>
            )}
        </div>
    );
};

import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '../../context/StoreContext';
import { ProductCard } from '../../components/ui/ProductCard';
import { ProductRow } from '../../components/ui/ProductRow';
import { RecentlyViewed } from '../../components/ui/RecentlyViewed';
import { fetchCollections } from '../../lib/api';
import { Collection } from '../../types';
import { collectionIcon } from '../../lib/collectionIcons';

export const HomePage: React.FC = () => {
    const { products, productsLoading, productsError, reloadProducts, wishlist, addToCart, toggleWishlist } = useStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('الكل');
    const [activeBrand, setActiveBrand] = useState('الكل');
    const [sortBy, setSortBy] = useState('newest');
    const [collections, setCollections] = useState<Collection[]>([]);

    useEffect(() => {
        let cancelled = false;
        fetchCollections()
            .then((data) => { if (!cancelled) setCollections(data); })
            .catch((err) => console.error('Failed to load collections', err));
        return () => { cancelled = true; };
    }, []);

    const isFiltered = searchQuery.trim() !== '' || activeCategory !== 'الكل' || activeBrand !== 'الكل';

    const productsById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
    const collectionProducts = useMemo(
        () => collections.map(c => ({ collection: c, products: c.productIds.map(id => productsById.get(id)).filter((p): p is typeof products[number] => Boolean(p)) })),
        [collections, productsById]
    );

    const availableBrands = useMemo(() => Array.from(new Set(products.map(p => p.brand).filter(Boolean))).sort(), [products]);
    const availableCategories = useMemo(() => Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort(), [products]);

    const sortedAndFilteredProducts = useMemo(() => {
        const result = products.filter(p => {
            const matchSearch = p.name_ar.includes(searchQuery) || p.brand.includes(searchQuery) || p.name_en.toLowerCase().includes(searchQuery.toLowerCase());
            const matchCat = activeCategory === 'الكل' || p.category === activeCategory;
            const matchBrand = activeBrand === 'الكل' || p.brand === activeBrand;
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
            default:
                break;
        }
        return result;
    }, [searchQuery, activeCategory, activeBrand, products, sortBy]);

    return (
        <div className="animate-fadeIn pb-20">
            {/* Hero Section */}
            <div className="relative h-64 md:h-80 bg-gradient-to-r from-brand-blue to-teal-500 mb-8 overflow-hidden">
                <div className="absolute inset-0 bg-black/20"></div>
                <div className="absolute inset-0 flex flex-col justify-center px-8 md:px-16 text-white max-w-4xl mx-auto">
                    <span className="text-sm md:text-base font-medium mb-2 bg-white/20 w-fit px-3 py-1 rounded-full backdrop-blur-sm">أحدث صيحات الجمال ✨</span>
                    <h1 className="text-3xl md:text-5xl font-bold mb-4 leading-tight">اكتشفي جمالك الطبيعي<br />مع منتجاتنا المميزة</h1>
                    <p className="mb-6 opacity-90 max-w-md text-sm md:text-base">تشكيلة واسعة من مستحضرات التجميل والعناية بالبشرة من أشهر الماركات العالمية.</p>
                    <a href="#products" className="bg-white text-brand-blue px-8 py-3 rounded-xl font-bold hover:bg-brand-blue-soft transition-colors w-fit shadow-lg">
                        تسوقي الآن
                    </a>
                </div>
                {/* Decorative Circles */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-brand-cyan/20 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2"></div>
            </div>

            <div id="products" className="max-w-4xl mx-auto px-4">
                {/* Search */}
                <div className="mb-8 relative z-10">
                    <input
                        type="text"
                        placeholder="ابحثي عن منتجات الجمال..."
                        className="w-full bg-white border border-gray-100 rounded-2xl px-6 py-4 outline-none shadow-lg shadow-brand-blue/10 focus:ring-2 focus:ring-brand-blue text-gray-700 placeholder-gray-400 font-medium"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-brand-blue p-2 rounded-lg">
                        <span className="text-white">🔍</span>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    {/* Categories - Compact */}
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 flex-1">
                        <button onClick={() => setActiveCategory('الكل')} className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${activeCategory === 'الكل' ? 'bg-brand-blue text-white shadow-md shadow-blue-100' : 'bg-white border border-brand-blue-soft text-gray-500'}`}>الكل</button>
                        {availableCategories.map(c => (
                            <button key={c} onClick={() => setActiveCategory(c)} className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${activeCategory === c ? 'bg-brand-blue text-white shadow-md shadow-blue-100' : 'bg-white border border-brand-blue-soft text-gray-500'}`}>{c}</button>
                        ))}
                    </div>

                    {/* Sort & Brand Filter */}
                    <div className="flex gap-2">
                        <select
                            value={activeBrand}
                            onChange={(e) => setActiveBrand(e.target.value)}
                            className="bg-white border border-brand-blue-soft text-gray-600 text-sm rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-brand-blue"
                        >
                            <option value="الكل">كل الماركات</option>
                            {availableBrands.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>

                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="bg-white border border-brand-blue-soft text-gray-600 text-sm rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-brand-blue"
                        >
                            <option value="newest">الأحدث</option>
                            <option value="price-low">السعر: الأقل للكبرى</option>
                            <option value="price-high">السعر: الكبرى للأقل</option>
                            <option value="rating">الأعلى تقييماً</option>
                            <option value="popular">الأكثر شعبية</option>
                        </select>
                    </div>
                </div>

                {/* Collections: only in the unfiltered default state, so they never contradict an active search/filter */}
                {!isFiltered && collectionProducts.map(({ collection, products: collectionItems }) => (
                    <ProductRow
                        key={collection.id}
                        id={`collection-${collection.slug}`}
                        title={collection.name_ar}
                        icon={collectionIcon(collection.icon)}
                        subtitle={collection.description_ar}
                        products={collectionItems}
                        wishlist={wishlist}
                        onToggleWishlist={toggleWishlist}
                        onAddToCart={addToCart}
                        className="mb-10"
                    />
                ))}

                {/* Products Grid */}
                <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                    <span>منتجات مميزة</span>
                    <span className="text-xs bg-brand-blue-soft text-brand-blue px-2 py-1 rounded-full">
                        {sortedAndFilteredProducts.length}
                    </span>
                </h2>

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
                        {sortedAndFilteredProducts.map(p => (
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

                {!productsLoading && !productsError && sortedAndFilteredProducts.length === 0 && (
                    <div className="text-center py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                        <p className="text-gray-500 font-medium">لا توجد منتجات تطابق بحثك</p>
                        <button onClick={() => { setSearchQuery(''); setActiveCategory('الكل'); }} className="mt-4 text-brand-blue font-bold hover:underline">
                            عرض كل المنتجات
                        </button>
                    </div>
                )}

                <RecentlyViewed />
            </div>
        </div>
    );
};

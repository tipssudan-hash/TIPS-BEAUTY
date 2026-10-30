import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ChevronLeft, Heart } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { useAuth } from '../../context/AuthContext';
import { ProductCard } from '../../components/ui/ProductCard';
import { ProductRow } from '../../components/ui/ProductRow';
import { RecentlyViewed } from '../../components/ui/RecentlyViewed';
import { BannerCarousel } from '../../components/ui/BannerCarousel';
import { fetchBanners, fetchCollections, fetchOffers } from '@infrastructure/repositories';
import { offerEndsLabel, offerValueLabel } from '@application/services/offers';
import { Banner, Collection, Offer } from '@domain/entities';
import { collectionIcon } from '@presentation/utils/collectionIcons';
import { ALL_BRANDS, ProductSortBy, categoryIdForName, filterAndSortProducts, storefrontBrands } from '@application/services/productSearch';
import { useIntersectionLoader } from '@presentation/hooks/useIntersectionLoader';
import { useCatalogTaxonomy } from '@presentation/hooks/useCatalogTaxonomy';
import { getCached, subscribeCache } from '@infrastructure/cache';
import { usePageMeta } from '@presentation/hooks/usePageMeta';
import { DiscountIcon } from '@presentation/components/ui/DiscountIcon';
import { CategoryChips } from '@presentation/components/ui/CategoryChips';

const PAGE_SIZE = 20;

export const HomePage: React.FC = () => {
    const { user } = useAuth();
    const { products, productsLoading, productsError, reloadProducts, wishlist, favoriteProducts, addToCart, toggleWishlist } = useStore();
    const { categories, brands: brandList } = useCatalogTaxonomy(products);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
    const [activeBrand, setActiveBrand] = useState(ALL_BRANDS);
    const [sortBy, setSortBy] = useState<ProductSortBy>('newest');
    const [collections, setCollections] = useState<Collection[]>(() => getCached<Collection[]>('catalog:collections') ?? []);
    const [banners, setBanners] = useState<Banner[]>(() => getCached<Banner[]>('catalog:banners') ?? []);
    const [offers, setOffers] = useState<Offer[]>(() => getCached<Offer[]>('catalog:offers') ?? []);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const navigate = useNavigate();

    // A failed section keeps what it had (the static hero stands in for banners) and says so, with a retry.
    const loadCatalog = useCallback(async () => {
        setCatalogError(null);
        const [c, b, o] = await Promise.allSettled([fetchCollections(), fetchBanners(), fetchOffers()]);
        if (c.status === 'fulfilled') setCollections(c.value);
        if (b.status === 'fulfilled') setBanners(b.value);
        if (o.status === 'fulfilled') setOffers(o.value);
        const failed = [c, b, o].filter((r) => r.status === 'rejected');
        if (failed.length > 0) {
            failed.forEach((r) => console.error('Failed to load storefront section', r.reason));
            setCatalogError('تعذر تحميل بعض أقسام الصفحة، تحققي من الاتصال وحاولي مرة أخرى.');
        }
    }, []);

    useEffect(() => { void loadCatalog(); }, [loadCatalog]);
    // Background refreshes (stale-while-revalidate) update the sections in place.
    useEffect(() => subscribeCache<Collection[]>('catalog:collections', setCollections), []);
    useEffect(() => subscribeCache<Banner[]>('catalog:banners', setBanners), []);
    useEffect(() => subscribeCache<Offer[]>('catalog:offers', setOffers), []);
    usePageMeta({
        title: 'Tips Beauty | تيبس بيوتي',
        description: 'متجر تيبس بيوتي لمستحضرات التجميل والعناية بالبشرة في السودان',
        path: '/',
    });

    const clearFilters = () => { setSearchQuery(''); setActiveCategoryId(null); setActiveBrand(ALL_BRANDS); };
    const scrollToId = (id: string) => window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));

    // Where a banner takes the customer; the admin stores the kind and the value it points at.
    const onBanner = (banner: Banner) => {
        const value = banner.actionValue?.trim() ?? '';
        switch (banner.actionType) {
            case 'product':
                navigate(`/product/${value}`);
                break;
            case 'category':
                setSearchQuery(''); setActiveBrand(ALL_BRANDS); setActiveCategoryId(categoryIdForName(categories, value));
                scrollToId('products');
                break;
            case 'collection':
                clearFilters();
                scrollToId(`collection-${value}`);
                break;
            case 'url':
                if (/^https?:\/\//i.test(value)) window.open(value, '_blank', 'noopener');
                else if (value.startsWith('/')) navigate(value);
                break;
            default:
                break;
        }
    };

    const isFiltered = searchQuery.trim() !== '' || activeCategoryId !== null || activeBrand !== ALL_BRANDS;

    const productsById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
    const collectionProducts = useMemo(
        () => collections.map(c => ({ collection: c, products: c.productIds.map(id => productsById.get(id)).filter((p): p is typeof products[number] => Boolean(p)) })),
        [collections, productsById]
    );

    const brands = useMemo(() => storefrontBrands(brandList), [brandList]);

    const sortedAndFilteredProducts = useMemo(
        () => filterAndSortProducts(products, { query: searchQuery, categoryId: activeCategoryId, brand: activeBrand, sortBy }, categories),
        [searchQuery, activeCategoryId, activeBrand, products, sortBy, categories]
    );

    const visibleProducts = sortedAndFilteredProducts.slice(0, visibleCount);

    const loadMore = useCallback(() => setVisibleCount(prev => prev + PAGE_SIZE), []);
    const hasMore = visibleCount < sortedAndFilteredProducts.length;
    const loadMoreRef = useIntersectionLoader(loadMore, hasMore && !productsLoading);

    useEffect(() => { setVisibleCount(PAGE_SIZE); }, [searchQuery, activeCategoryId, activeBrand, sortBy]);

    return (
        <div className="animate-fadeIn pb-20">
            {/* Banners replace the static hero whenever staff have any live; the hero stays as the empty state. */}
            {banners.length > 0 ? (
                <div className="pt-2 sm:pt-4">
                    <BannerCarousel banners={banners} onSelect={onBanner} />
                </div>
            ) : (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 sm:pt-4 mb-6 md:mb-8">
                <div className="relative h-60 sm:h-72 md:h-80 bg-gradient-to-r from-brand-blue to-teal-500 rounded-3xl overflow-hidden shadow-sm">
                    <div className="absolute inset-0 bg-black/20"></div>
                    <div className="absolute inset-0 flex flex-col justify-center px-6 sm:px-10 md:px-16 text-white max-w-3xl">
                        <span className="text-xs sm:text-sm font-medium mb-2 bg-white/20 w-fit px-3 py-1 rounded-full backdrop-blur-sm">أحدث صيحات الجمال ✨</span>
                        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 leading-tight">اكتشفي جمالك الطبيعي<br />مع منتجاتنا المميزة</h1>
                        <p className="mb-4 sm:mb-6 opacity-90 max-w-md text-xs sm:text-sm md:text-base line-clamp-2">تشكيلة واسعة من مستحضرات التجميل والعناية بالبشرة من أشهر الماركات العالمية.</p>
                        <a href="#products" className="bg-white text-brand-blue px-6 sm:px-8 py-2.5 sm:py-3 rounded-xl font-bold hover:bg-brand-blue-soft transition-colors w-fit shadow-md text-sm sm:text-base">
                            تسوقي الآن
                        </a>
                    </div>
                    {/* Decorative Circles */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-brand-cyan/20 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2"></div>
                </div>
            </div>
            )}

            <div id="products" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Search Bar */}
                <div className="mb-4 md:mb-6">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            placeholder="ابحثي عن منتجات الجمال، الماركات، والعناية..."
                            className="w-full bg-white border border-gray-200 rounded-2xl px-5 py-3.5 pr-5 pl-12 outline-none shadow-xs focus:ring-2 focus:ring-brand-blue text-gray-700 placeholder-gray-400 font-medium text-sm"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 bg-brand-blue p-1.5 rounded-lg">
                            <Search className="w-4 h-4 text-white" />
                        </div>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
                    {/* Categories - Compact */}
                    <CategoryChips categories={categories} activeId={activeCategoryId} onSelect={setActiveCategoryId} showImages />

                    {/* Sort & Brand Filter */}
                    <div className="flex gap-2">
                        <select
                            value={activeBrand}
                            onChange={(e) => setActiveBrand(e.target.value)}
                            className="bg-white border border-brand-blue-soft text-gray-700 text-xs sm:text-sm rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-brand-blue font-medium"
                        >
                            <option value={ALL_BRANDS}>كل الماركات</option>
                            {brands.map(b => <option key={b.id} value={b.name_ar}>{b.name_ar}</option>)}
                        </select>

                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as ProductSortBy)}
                            className="bg-white border border-brand-blue-soft text-gray-700 text-xs sm:text-sm rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-brand-blue font-medium"
                        >
                            <option value="newest">الأحدث</option>
                            <option value="price-low">السعر: الأقل للأعلى</option>
                            <option value="price-high">السعر: الأعلى للأقل</option>
                            <option value="rating">الأعلى تقييماً</option>
                            <option value="popular">الأكثر شعبية</option>
                        </select>
                    </div>
                </div>

                {catalogError && (
                    <div role="alert" className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                        <span className="font-medium">{catalogError}</span>
                        <button type="button" onClick={() => void loadCatalog()} className="shrink-0 font-bold text-brand-blue hover:underline">إعادة المحاولة</button>
                    </div>
                )}

                {/* Offers strip: only when something is running (no empty section), only in the default state */}
                {!isFiltered && offers.length > 0 && (
                    <Link to="/offers" className="mb-8 flex items-center gap-3.5 rounded-2xl border border-red-100 bg-gradient-to-r from-red-50/80 to-rose-50/60 p-4 hover:border-red-200 transition-colors shadow-xs">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-xs p-2">
                            <DiscountIcon className="w-7 h-7" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block font-bold text-gray-800 text-sm sm:text-base">{offers.length === 1 ? offers[0].title : `${offers.length} عروض جارية الآن`}</span>
                            <span className="block text-xs text-gray-600">{offers.length === 1 ? `${offerValueLabel(offers[0])} · ${offerEndsLabel(offers[0])}` : offers.map((o) => offerValueLabel(o)).join(' · ')}</span>
                        </span>
                        <ChevronLeft className="w-5 h-5 shrink-0 text-red-400" />
                    </Link>
                )}

                {/* Favorites Section: displayed only for logged-in users with personal favorites */}
                {!isFiltered && Boolean(user) && favoriteProducts.length > 0 && (
                    <ProductRow
                        id="wishlist-products"
                        title="منتجاتي المفضلة"
                        icon={<Heart className="w-5 h-5 text-red-500 fill-red-500" />}
                        subtitle="المنتجات التي اخترتِها في قائمتك المفضلة"
                        products={favoriteProducts}
                        wishlist={wishlist}
                        onToggleWishlist={toggleWishlist}
                        onAddToCart={addToCart}
                        className="mb-8 md:mb-12"
                    />
                )}

                {/* Recently Viewed: placed before collections, only for logged in users */}
                {!isFiltered && Boolean(user) && (
                    <RecentlyViewed className="mb-8 md:mb-12" />
                )}

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
                        className="mb-8 md:mb-12"
                    />
                ))}

                {/* Products Grid */}
                <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <h2 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center gap-2">
                        <span>منتجات مميزة</span>
                        <span className="text-xs bg-brand-blue-soft text-brand-blue px-2.5 py-0.5 rounded-full font-bold">
                            {sortedAndFilteredProducts.length}
                        </span>
                    </h2>
                </div>

                {productsLoading && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 lg:gap-5" aria-busy="true">
                        {Array.from({ length: 10 }).map((_, i) => <div key={i} className="aspect-[4/5] rounded-2xl bg-gray-100 animate-pulse" />)}
                    </div>
                )}

                {productsError && !productsLoading && (
                    <div className="text-center py-16 bg-red-50 rounded-2xl border border-red-100">
                        <p className="text-red-700 font-medium">{productsError}</p>
                        <button onClick={() => void reloadProducts()} className="mt-4 text-brand-blue font-bold hover:underline">إعادة المحاولة</button>
                    </div>
                )}

                {!productsLoading && !productsError && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 lg:gap-5">
                        {visibleProducts.map((p, index) => (
                            <ProductCard
                                key={p.id}
                                product={p}
                                isInWishlist={wishlist.includes(p.id)}
                                onToggleWishlist={toggleWishlist}
                                onAddToCart={addToCart}
                                priority={index < 8}
                            />
                        ))}
                    </div>
                )}

                {!productsLoading && !productsError && visibleCount < sortedAndFilteredProducts.length && (
                    <div ref={loadMoreRef} className="mt-8 flex justify-center py-6" aria-hidden="true">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-blue border-t-transparent" />
                    </div>
                )}

                {!productsLoading && !productsError && sortedAndFilteredProducts.length === 0 && (
                    <div className="text-center py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                        <p className="text-gray-500 font-medium">لا توجد منتجات تطابق بحثك</p>
                        <button onClick={() => { setSearchQuery(''); setActiveCategoryId(null); }} className="mt-4 text-brand-blue font-bold hover:underline">
                            عرض كل المنتجات
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

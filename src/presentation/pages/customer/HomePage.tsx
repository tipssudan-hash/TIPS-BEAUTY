import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Percent, ChevronLeft } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { ProductCard } from '../../components/ui/ProductCard';
import { ProductRow } from '../../components/ui/ProductRow';
import { RecentlyViewed } from '../../components/ui/RecentlyViewed';
import { BannerCarousel } from '../../components/ui/BannerCarousel';
import { fetchBanners, fetchCollections, fetchOffers } from '@infrastructure/repositories';
import { offerEndsLabel, offerValueLabel } from '@application/services/offers';
import { Banner, Collection, Offer } from '@domain/entities';
import { collectionIcon } from '@presentation/utils/collectionIcons';
import { ALL_BRANDS, ALL_CATEGORIES, ProductSortBy, availableBrands, availableCategories, filterAndSortProducts } from '@application/services/productSearch';

export const HomePage: React.FC = () => {
    const { products, productsLoading, productsError, reloadProducts, wishlist, addToCart, toggleWishlist } = useStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState(ALL_CATEGORIES);
    const [activeBrand, setActiveBrand] = useState(ALL_BRANDS);
    const [sortBy, setSortBy] = useState<ProductSortBy>('newest');
    const [collections, setCollections] = useState<Collection[]>([]);
    const [banners, setBanners] = useState<Banner[]>([]);
    const [offers, setOffers] = useState<Offer[]>([]);
    const navigate = useNavigate();

    useEffect(() => {
        let cancelled = false;
        fetchCollections()
            .then((data) => { if (!cancelled) setCollections(data); })
            .catch((err) => console.error('Failed to load collections', err));
        // Banners are decoration: a failure leaves the static hero in place.
        fetchBanners()
            .then((data) => { if (!cancelled) setBanners(data); })
            .catch((err) => console.error('Failed to load banners', err));
        fetchOffers()
            .then((data) => { if (!cancelled) setOffers(data); })
            .catch((err) => console.error('Failed to load offers', err));
        return () => { cancelled = true; };
    }, []);

    const clearFilters = () => { setSearchQuery(''); setActiveCategory(ALL_CATEGORIES); setActiveBrand(ALL_BRANDS); };
    const scrollToId = (id: string) => window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));

    // Where a banner takes the customer; the admin stores the kind and the value it points at.
    const onBanner = (banner: Banner) => {
        const value = banner.actionValue?.trim() ?? '';
        switch (banner.actionType) {
            case 'product':
                navigate(`/product/${value}`);
                break;
            case 'category':
                setSearchQuery(''); setActiveBrand(ALL_BRANDS); setActiveCategory(value);
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

    const isFiltered = searchQuery.trim() !== '' || activeCategory !== ALL_CATEGORIES || activeBrand !== ALL_BRANDS;

    const productsById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
    const collectionProducts = useMemo(
        () => collections.map(c => ({ collection: c, products: c.productIds.map(id => productsById.get(id)).filter((p): p is typeof products[number] => Boolean(p)) })),
        [collections, productsById]
    );

    const brands = useMemo(() => availableBrands(products), [products]);
    const categories = useMemo(() => availableCategories(products), [products]);

    const sortedAndFilteredProducts = useMemo(
        () => filterAndSortProducts(products, { query: searchQuery, category: activeCategory, brand: activeBrand, sortBy }),
        [searchQuery, activeCategory, activeBrand, products, sortBy]
    );

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
                {/* Search & Action Bar */}
                <div className="mb-4 md:mb-6 flex flex-col md:flex-row md:items-center gap-3">
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

                    <Link to="/search" className="hidden sm:inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-white border border-brand-blue-soft text-brand-blue hover:bg-brand-blue-soft/50 font-bold text-xs whitespace-nowrap shadow-xs transition-colors">
                        <Search className="w-3.5 h-3.5" /> تصفحي جميع المنتجات
                    </Link>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
                    {/* Categories - Compact */}
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 flex-1">
                        <button onClick={() => setActiveCategory(ALL_CATEGORIES)} className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${activeCategory === ALL_CATEGORIES ? 'bg-brand-blue text-white shadow-sm' : 'bg-white border border-brand-blue-soft text-gray-600 hover:border-brand-blue'}`}>الكل</button>
                        {categories.map(c => (
                            <button key={c} onClick={() => setActiveCategory(c)} className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${activeCategory === c ? 'bg-brand-blue text-white shadow-sm' : 'bg-white border border-brand-blue-soft text-gray-600 hover:border-brand-blue'}`}>{c}</button>
                        ))}
                    </div>

                    {/* Sort & Brand Filter */}
                    <div className="flex gap-2">
                        <select
                            value={activeBrand}
                            onChange={(e) => setActiveBrand(e.target.value)}
                            className="bg-white border border-brand-blue-soft text-gray-700 text-xs sm:text-sm rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-brand-blue font-medium"
                        >
                            <option value={ALL_BRANDS}>كل الماركات</option>
                            {brands.map(b => <option key={b} value={b}>{b}</option>)}
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

                {/* Offers strip: only when something is running (no empty section), only in the default state */}
                {!isFiltered && offers.length > 0 && (
                    <Link to="/offers" className="mb-8 flex items-center gap-3 rounded-2xl border border-red-100 bg-red-50/60 p-4 hover:border-red-200 transition-colors">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600"><Percent className="w-5 h-5" /></span>
                        <span className="min-w-0 flex-1">
                            <span className="block font-bold text-gray-800 text-sm sm:text-base">{offers.length === 1 ? offers[0].title : `${offers.length} عروض جارية الآن`}</span>
                            <span className="block text-xs text-gray-600">{offers.length === 1 ? `${offerValueLabel(offers[0])} · ${offerEndsLabel(offers[0])}` : offers.map((o) => offerValueLabel(o)).join(' · ')}</span>
                        </span>
                        <ChevronLeft className="w-5 h-5 shrink-0 text-red-400" />
                    </Link>
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
                        <button onClick={() => { setSearchQuery(''); setActiveCategory(ALL_CATEGORIES); }} className="mt-4 text-brand-blue font-bold hover:underline">
                            عرض كل المنتجات
                        </button>
                    </div>
                )}

                <div className="mt-12">
                    <RecentlyViewed />
                </div>
            </div>
        </div>
    );
};

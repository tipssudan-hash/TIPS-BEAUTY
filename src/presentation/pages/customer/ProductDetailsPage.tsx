import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Offer, Product } from '@domain/entities';
import { remainingStock } from '@domain/valueObjects';
import { fetchOffers, fetchProduct, subscribeRestock } from '@infrastructure/repositories';
import { formatSDG } from '@application/services/format';
import { offerValueLabel, productCartOffer } from '@application/services/offers';
import { errorMessage } from '@application/errors';
import { Heart, Share2, ShoppingCart, Check, Minus, Plus, Bell } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { useAuth } from '../../context/AuthContext';
import { ReviewSection } from '../../components/ui/ReviewSection';
import { RelatedProducts } from '../../components/ui/RelatedProducts';
import { ProductImage } from '../../components/ui/ProductImage';
import { Card, EmptyState, Notice, Spinner } from '../../components/ui';
import { usePageMeta } from '../../hooks/usePageMeta';

type RestockState = 'idle' | 'sending' | 'subscribed' | 'error';

export const ProductDetailsPage: React.FC = () => {
    const { id } = useParams();
    const { user } = useAuth();
    const { products, cart, addToCart, wishlist, favoriteProducts, toggleWishlist, addToRecentlyViewed } = useStore();
    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const [notice, setNotice] = useState<string | null>(null);
    // The chosen Variant (shade/size); a Product with Variants is only added with one.
    const [variantId, setVariantId] = useState<string | null>(null);
    const [variantHint, setVariantHint] = useState(false);
    const [quantity, setQuantity] = useState(1);
    const [isAdded, setIsAdded] = useState(false);
    const [offers, setOffers] = useState<Offer[]>([]);
    const [restock, setRestock] = useState<RestockState>('idle');

    useEffect(() => {
        let cancelled = false;
        fetchOffers()
            .then((o) => { if (!cancelled) setOffers(o); })
            .catch((err: unknown) => console.error('Offers load failed', err));
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!id) return;
        const cached = products.find(p => p.id === id);
        if (cached && !cached.isRemoved) {
            setProduct(cached);
            setLoading(false);
            addToRecentlyViewed(cached);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setLoadError(null);
        fetchProduct(id)
            .then((data) => {
                if (cancelled) return;
                if (data && !data.isRemoved) {
                    setProduct(data);
                    setVariantId(data.variants.length === 1 ? data.variants[0].id : null);
                    addToRecentlyViewed(data);
                } else {
                    const fav = favoriteProducts.find(p => p.id === id);
                    if (fav) {
                        setProduct(fav);
                    } else {
                        setProduct(null);
                    }
                }
            })
            .catch((error) => {
                console.error('Error fetching product:', error);
                if (cancelled) return;
                const fav = favoriteProducts.find(p => p.id === id);
                setProduct(fav ?? null);
                if (!fav) setLoadError(errorMessage(error, 'تعذر تحميل المنتج، حاولي مرة أخرى.'));
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [id, products, favoriteProducts, addToRecentlyViewed, attempt]);

    useEffect(() => {
        if (!notice) return;
        const timer = setTimeout(() => setNotice(null), 2500);
        return () => clearTimeout(timer);
    }, [notice]);

    const selectedVariant = product?.variants.find((v) => v.id === variantId) ?? null;
    const finalPrice = selectedVariant ? selectedVariant.effectivePrice : product?.effectivePrice ?? 0;
    const basePrice = selectedVariant?.price ?? product?.price ?? 0;
    const pricingRule = selectedVariant ? selectedVariant.pricingRule : product?.pricingRule ?? null;
    const addable = product ? remainingStock(cart, product.id, product.stock) : 0;
    const effectiveQuantity = Math.max(1, Math.min(quantity, addable));
    const description = product?.description.slice(0, 140) ?? '';

    usePageMeta({
        title: product ? `${product.name_ar} | Tips Beauty` : 'المنتج | Tips Beauty',
        description: product ? `${product.name_ar} بسعر ${formatSDG(finalPrice)}. ${description}`.trim() : undefined,
        image: product?.image || null,
        path: id ? `/product/${id}` : undefined,
        type: 'product',
        price: product ? { amount: finalPrice, currency: 'SDG' } : null,
    });

    const handleShare = async () => {
        if (!product) return;
        const shareData = {
            title: `Tips Beauty - ${product.name_ar}`,
            text: product.description.substring(0, 100),
            url: window.location.href,
        };
        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                await navigator.clipboard.writeText(window.location.href);
                setNotice('تم نسخ الرابط');
            }
        } catch (err) {
            console.error('Error sharing:', err);
        }
    };

    const handleAddToCart = () => {
        if (!product || isAdded) return;
        const variant = product.variants.find((v) => v.id === variantId) ?? null;
        if (product.variants.length > 0 && !variant) {
            setVariantHint(true);
            return;
        }
        if (effectiveQuantity <= 0) return;
        setIsAdded(true);
        addToCart(product, variant, effectiveQuantity);
        setTimeout(() => setIsAdded(false), 1200);
        setNotice(variant ? `تمت إضافة ${product.name_ar} (${variant.name_ar}) للسلة` : 'تمت إضافة المنتج للسلة');
    };

    const handleRestock = async () => {
        if (!product || restock === 'sending') return;
        setRestock('sending');
        try {
            await subscribeRestock(product.id);
            setRestock('subscribed');
        } catch (err) {
            console.error('Restock subscription failed', err);
            setRestock('error');
        }
    };

    if (loading) return <Spinner />;

    if (!product && loadError) {
        return (
            <div className="p-8">
                <div className="text-center py-16 bg-red-50 rounded-2xl border border-red-100">
                    <p className="text-red-700 font-medium">{loadError}</p>
                    <button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-4 text-brand-blue font-bold hover:underline">إعادة المحاولة</button>
                </div>
            </div>
        );
    }

    if (!product) {
        return (
            <div className="p-8">
                <EmptyState title="المنتج غير موجود" action={<Link to="/" className="text-brand-blue underline font-bold">العودة للرئيسية</Link>} />
            </div>
        );
    }

    const images = product.images.length > 0 ? product.images : [product.image];
    const isInWishlist = wishlist.includes(product.id);
    const cartOffer = productCartOffer(offers, product);
    const canRestock = !product.isRemoved && product.stock <= 0;
    const canAddMore = addable > 0;

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 animate-fadeIn">
            {notice && (
                <div role="status" className="fixed top-4 inset-x-4 z-50 mx-auto max-w-sm bg-gray-900 text-white text-sm rounded-xl px-4 py-3 flex items-center gap-2 shadow-lg">
                    <Check className="w-4 h-4" /> {notice}
                </div>
            )}
            <Link to="/" className="text-brand-blue text-sm mb-4 inline-block hover:underline font-medium">
                ← العودة للمنتجات
            </Link>

            <Card className="overflow-hidden mb-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-0">
                    {/* Image Gallery */}
                    <div className="lg:col-span-5 relative aspect-square md:aspect-auto md:min-h-[420px] bg-gray-50 flex flex-col items-center justify-center p-4">
                        <ProductImage
                            key={images[activeImageIndex]}
                            src={images[activeImageIndex]}
                            alt={product.name_ar}
                            width={800}
                            height={800}
                            quality={85}
                            sizes="(max-width: 768px) 100vw, 50vw"
                            loading="eager"
                            fetchPriority="high"
                            className="w-full h-full max-h-[500px] object-contain transition-opacity duration-300"
                        />
                        {images.length > 1 && (
                            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 z-10">
                                {images.map((_, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        aria-label={`الصورة ${idx + 1}`}
                                        onClick={() => setActiveImageIndex(idx)}
                                        className={`w-2 h-2 rounded-full transition-all ${idx === activeImageIndex ? 'bg-brand-blue w-6' : 'bg-gray-300'
                                            }`}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Product Info */}
                    <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between border-t md:border-t-0 md:border-r border-brand-blue-soft/40">
                        <div>
                            <div className="flex items-start justify-between gap-4 mb-4">
                                <div>
                                    <p className="text-xs text-brand-blue font-bold uppercase tracking-widest mb-1">
                                        {product.brand}
                                    </p>
                                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-800 mb-1">{product.name_ar}</h1>
                                    <p className="text-xs sm:text-sm text-gray-500">{product.name_en}</p>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => toggleWishlist(product.id, product)}
                                        className="p-2.5 rounded-full bg-brand-blue-soft hover:bg-blue-100 transition-colors"
                                        aria-label={isInWishlist ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                                        aria-pressed={isInWishlist}
                                    >
                                        <Heart className={`w-5 h-5 ${isInWishlist ? 'fill-brand-blue text-brand-blue' : 'text-brand-blue/60'}`} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleShare}
                                        className="p-2.5 rounded-full bg-brand-blue-soft hover:bg-blue-100 transition-colors"
                                        aria-label="مشاركة"
                                    >
                                        <Share2 className="w-5 h-5 text-brand-blue/60" />
                                    </button>
                                </div>
                            </div>

                            <div className="mb-6 p-4 rounded-2xl bg-gray-50 border border-gray-100">
                                <div className="flex items-baseline gap-3 flex-wrap">
                                    <p className="text-2xl sm:text-3xl font-black text-brand-blue">{formatSDG(finalPrice)}</p>
                                    {pricingRule && (
                                        <>
                                            <p className="text-base text-gray-400 line-through">{formatSDG(basePrice)}</p>
                                            <span className="text-xs font-bold bg-red-100 text-red-600 rounded-full px-2.5 py-0.5">{pricingRule.label}</span>
                                        </>
                                    )}
                                </div>
                                {cartOffer && <span className="mt-2 inline-block text-xs font-bold bg-green-100 text-green-700 rounded-full px-2.5 py-0.5">{offerValueLabel(cartOffer)}</span>}
                                {product.isRemoved ? (
                                    <p className="text-xs sm:text-sm text-rose-600 mt-1 font-bold">تمت إزالة هذا المنتج من المتجر</p>
                                ) : product.stock > 0 ? (
                                    <p className="text-xs sm:text-sm text-green-600 mt-1 font-medium">{product.stock <= 5 ? 'الكمية محدودة' : 'متوفر في المخزون'}</p>
                                ) : (
                                    <p className="text-xs sm:text-sm text-red-600 mt-1 font-medium">غير متوفر حالياً</p>
                                )}
                            </div>

                            {product.variants.length > 0 && (
                                <fieldset className="mb-6">
                                    <legend className="font-bold text-gray-800 mb-2 text-sm">الخيار:</legend>
                                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="الخيار">
                                        {product.variants.map((variant) => {
                                            const active = variant.id === variantId;
                                            return (
                                                <button
                                                    key={variant.id}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={active}
                                                    onClick={() => { setVariantId(variant.id); setVariantHint(false); }}
                                                    className={`min-h-10 px-4 py-2 rounded-xl border text-xs sm:text-sm font-bold transition-colors ${active ? 'border-brand-blue bg-brand-blue-soft text-brand-blue shadow-xs' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                                                >
                                                    {variant.name_ar}
                                                    {variant.effectivePrice !== product.effectivePrice && (
                                                        <span className="block text-[10px] font-medium text-gray-500">{formatSDG(variant.effectivePrice)}</span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {variantHint && <p role="alert" className="text-xs text-red-600 mt-2">اختاري الخيار أولاً</p>}
                                </fieldset>
                            )}

                            <p className="text-gray-700 mb-6 leading-relaxed text-sm sm:text-base">{product.description}</p>

                            {product.benefits && product.benefits.length > 0 && (
                                <div className="mb-6">
                                    <h3 className="font-bold text-gray-800 mb-2 text-sm">الفوائد:</h3>
                                    <ul className="list-disc list-inside space-y-1 text-gray-700 text-sm">
                                        {product.benefits.map((benefit, idx) => (
                                            <li key={idx}>{benefit}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {product.ingredients && product.ingredients.length > 0 && (
                                <div className="mb-6">
                                    <h3 className="font-bold text-gray-800 mb-2 text-sm">المكونات:</h3>
                                    <p className="text-gray-700 text-sm">{product.ingredients.join(', ')}</p>
                                </div>
                            )}

                            {product.usage && (
                                <div className="mb-6">
                                    <h3 className="font-bold text-gray-800 mb-2 text-sm">طريقة الاستخدام:</h3>
                                    <p className="text-gray-700 text-sm">{product.usage}</p>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4 mb-6 text-xs sm:text-sm bg-gray-50 p-4 rounded-xl">
                                <div>
                                    <p className="text-gray-500">المنشأ:</p>
                                    <p className="font-semibold text-gray-800">{product.origin}</p>
                                </div>
                                <div>
                                    <p className="text-gray-500">تاريخ الانتهاء:</p>
                                    <p className="font-semibold text-gray-800">{product.expiry}</p>
                                </div>
                            </div>
                        </div>

                        {canAddMore && !product.isRemoved && (
                            <div className="flex items-center gap-3 mb-3">
                                <span id="quantity-label" className="text-sm font-bold text-gray-700">الكمية:</span>
                                <div role="group" aria-labelledby="quantity-label" className="inline-flex items-center rounded-xl border border-gray-200">
                                    <button
                                        type="button"
                                        aria-label="إنقاص الكمية"
                                        onClick={() => setQuantity((q) => Math.max(1, Math.min(q, addable) - 1))}
                                        disabled={effectiveQuantity <= 1}
                                        className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                                    >
                                        <Minus className="w-4 h-4" />
                                    </button>
                                    <span className="w-12 text-center font-bold text-gray-800" aria-live="polite">{effectiveQuantity}</span>
                                    <button
                                        type="button"
                                        aria-label="زيادة الكمية"
                                        onClick={() => setQuantity((q) => Math.min(q + 1, addable))}
                                        disabled={effectiveQuantity >= addable}
                                        className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                                {effectiveQuantity >= addable && (
                                    <span className="text-xs text-amber-700">الحد المتاح في المخزون {product.stock}</span>
                                )}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={handleAddToCart}
                            disabled={product.stock <= 0 || product.isRemoved || isAdded || !canAddMore}
                            className={`w-full font-bold py-3.5 sm:py-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 active:scale-98 shadow-md disabled:cursor-not-allowed ${
                                isAdded
                                    ? 'bg-green-600 text-white shadow-green-600/30'
                                    : 'bg-brand-blue hover:bg-sky-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none text-white shadow-brand-blue/20'
                            }`}
                        >
                            {isAdded ? (
                                <>
                                    <Check className="w-5 h-5" />
                                    <span>تمت الإضافة للسلة بنجاح</span>
                                </>
                            ) : (
                                <>
                                    <ShoppingCart className="w-5 h-5" />
                                    <span>
                                        {product.isRemoved
                                            ? 'غير متوفر بالمتجر'
                                            : product.stock <= 0
                                                ? 'غير متوفر'
                                                : canAddMore
                                                    ? 'أضيفي للسلة'
                                                    : 'الكمية المتاحة كلها في سلتك'}
                                    </span>
                                </>
                            )}
                        </button>

                        {canRestock && (
                            <div className="mt-4 space-y-2">
                                {restock === 'subscribed' ? (
                                    <Notice kind="success">سنعلمك عند توفر هذا المنتج.</Notice>
                                ) : user ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => void handleRestock()}
                                            disabled={restock === 'sending'}
                                            className="w-full flex items-center justify-center gap-2 rounded-control border border-brand-blue bg-white px-6 py-3.5 font-bold text-brand-blue transition-all hover:bg-brand-blue-soft disabled:opacity-50"
                                        >
                                            <Bell className="w-5 h-5" />
                                            {restock === 'sending' ? 'جاري التسجيل...' : 'أعلميني عند التوفر'}
                                        </button>
                                        {restock === 'error' && <Notice kind="error">تعذر تسجيل التنبيه، حاولي مرة أخرى.</Notice>}
                                    </>
                                ) : (
                                    <Link to="/login" state={{ from: { pathname: `/product/${product.id}` } }} className="block text-center text-sm font-bold text-brand-blue hover:underline">
                                        سجّلي دخولك لتصلك إشعارات توفر المنتج
                                    </Link>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            {!product.isRemoved && (
                <div className="space-y-8">
                    <RelatedProducts currentProduct={product} />
                    <ReviewSection productId={product.id} />
                </div>
            )}
        </div>
    );
};

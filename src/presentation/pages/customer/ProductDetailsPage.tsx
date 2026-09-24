import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Product } from '@domain/entities';
import { fetchProduct } from '@infrastructure/repositories';
import { formatSDG } from '@application/services/format';
import { Heart, Share2, ShoppingCart, Check } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { ReviewSection } from '../../components/ui/ReviewSection';
import { RelatedProducts } from '../../components/ui/RelatedProducts';
import { Card, EmptyState, Spinner } from '../../components/ui';

export const ProductDetailsPage: React.FC = () => {
    const { id } = useParams();
    const { addToCart, wishlist, toggleWishlist, addToRecentlyViewed } = useStore();
    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const [notice, setNotice] = useState<string | null>(null);
    // The chosen Variant (shade/size); a Product with Variants is only added with one.
    const [variantId, setVariantId] = useState<string | null>(null);
    const [variantHint, setVariantHint] = useState(false);

    useEffect(() => {
        if (!id) return;
        let cancelled = false;
        setLoading(true);
        fetchProduct(id)
            .then((data) => {
                if (cancelled) return;
                setProduct(data);
                setVariantId(data && data.variants.length === 1 ? data.variants[0].id : null);
                if (data) addToRecentlyViewed(data);
            })
            .catch((error) => console.error('Error fetching product:', error))
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [id, addToRecentlyViewed]);

    useEffect(() => {
        if (!notice) return;
        const timer = setTimeout(() => setNotice(null), 2500);
        return () => clearTimeout(timer);
    }, [notice]);

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
        if (!product) return;
        const variant = product.variants.find((v) => v.id === variantId) ?? null;
        if (product.variants.length > 0 && !variant) {
            setVariantHint(true);
            return;
        }
        addToCart(product, variant);
        setNotice(variant ? `تمت إضافة ${product.name_ar} (${variant.name_ar}) للسلة` : 'تمت إضافة المنتج للسلة');
    };

    if (loading) return <Spinner />;

    if (!product) {
        return (
            <div className="p-8">
                <EmptyState title="المنتج غير موجود" action={<Link to="/" className="text-brand-blue underline font-bold">العودة للرئيسية</Link>} />
            </div>
        );
    }

    const images = product.images.length > 0 ? product.images : [product.image];
    const isInWishlist = wishlist.includes(product.id);
    const selectedVariant = product.variants.find((v) => v.id === variantId) ?? null;
    // The price shown is the one the backend will charge for what is selected.
    const finalPrice = selectedVariant ? selectedVariant.effectivePrice : product.effectivePrice;
    const basePrice = selectedVariant?.price ?? product.price;
    const pricingRule = selectedVariant ? selectedVariant.pricingRule : product.pricingRule;

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
                        <img
                            src={images[activeImageIndex]}
                            alt={product.name_ar}
                            className="w-full h-full max-h-[500px] object-contain"
                        />
                        {images.length > 1 && (
                            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
                                {images.map((_, idx) => (
                                    <button
                                        key={idx}
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
                                        onClick={() => toggleWishlist(product.id)}
                                        className="p-2.5 rounded-full bg-brand-blue-soft hover:bg-blue-100 transition-colors"
                                        aria-label="إضافة للمفضلة"
                                    >
                                        <Heart className={`w-5 h-5 ${isInWishlist ? 'fill-brand-blue text-brand-blue' : 'text-brand-blue/60'}`} />
                                    </button>
                                    <button
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
                                {product.stock > 0 ? (
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

                        <button
                            onClick={handleAddToCart}
                            disabled={product.stock === 0}
                            className="w-full bg-brand-blue hover:bg-sky-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold py-3.5 sm:py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-98 shadow-md shadow-brand-blue/20"
                        >
                            <ShoppingCart className="w-5 h-5" />
                            {product.stock > 0 ? 'أضيفي للسلة' : 'غير متوفر'}
                        </button>
                    </div>
                </div>
            </Card>

            <div className="space-y-8">
                <RelatedProducts currentProduct={product} />
                <ReviewSection productId={product.id} />
            </div>
        </div>
    );
};

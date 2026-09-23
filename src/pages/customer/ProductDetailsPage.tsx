import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Product } from '../../types';
import { fetchProduct } from '../../lib/api';
import { formatSDG } from '../../lib/format';
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
        <div className="max-w-4xl mx-auto p-4 animate-fadeIn">
            {notice && (
                <div role="status" className="fixed top-4 inset-x-4 z-50 mx-auto max-w-sm bg-gray-900 text-white text-sm rounded-xl px-4 py-3 flex items-center gap-2 shadow-lg">
                    <Check className="w-4 h-4" /> {notice}
                </div>
            )}
            <Link to="/" className="text-brand-blue text-sm mb-4 inline-block hover:underline">
                ← العودة للمنتجات
            </Link>

            <Card className="overflow-hidden">
                {/* Image Gallery */}
                <div className="relative aspect-square bg-gray-50">
                    <img
                        src={images[activeImageIndex]}
                        alt={product.name_ar}
                        className="w-full h-full object-cover"
                    />
                    {images.length > 1 && (
                        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
                            {images.map((_, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setActiveImageIndex(idx)}
                                    className={`w-2 h-2 rounded-full transition-all ${idx === activeImageIndex ? 'bg-brand-blue w-6' : 'bg-white/50'
                                        }`}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Product Info */}
                <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <p className="text-xs text-brand-blue font-bold uppercase tracking-widest mb-1">
                                {product.brand}
                            </p>
                            <h1 className="text-2xl font-bold text-gray-800 mb-1">{product.name_ar}</h1>
                            <p className="text-sm text-gray-500">{product.name_en}</p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => toggleWishlist(product.id)}
                                className="p-2 rounded-full bg-brand-blue-soft hover:bg-blue-100 transition-colors"
                            >
                                <Heart className={`w-5 h-5 ${isInWishlist ? 'fill-brand-blue text-brand-blue' : 'text-brand-blue/60'}`} />
                            </button>
                            <button
                                onClick={handleShare}
                                className="p-2 rounded-full bg-brand-blue-soft hover:bg-blue-100 transition-colors"
                            >
                                <Share2 className="w-5 h-5 text-brand-blue/60" />
                            </button>
                        </div>
                    </div>

                    <div className="mb-6">
                        <div className="flex items-baseline gap-3 flex-wrap">
                            <p className="text-3xl font-black text-brand-blue">{formatSDG(finalPrice)}</p>
                            {pricingRule && (
                                <>
                                    <p className="text-lg text-gray-400 line-through">{formatSDG(basePrice)}</p>
                                    <span className="text-xs font-bold bg-red-100 text-red-600 rounded-full px-2 py-1">{pricingRule.label}</span>
                                </>
                            )}
                        </div>
                        {product.stock > 0 ? (
                            <p className="text-sm text-green-600 mt-1">{product.stock <= 5 ? 'الكمية محدودة' : 'متوفر'}</p>
                        ) : (
                            <p className="text-sm text-red-600 mt-1">غير متوفر حالياً</p>
                        )}
                    </div>

                    {product.variants.length > 0 && (
                        <fieldset className="mb-6">
                            <legend className="font-bold text-gray-800 mb-2">الخيار:</legend>
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
                                            className={`min-h-11 px-4 py-2 rounded-xl border text-sm font-bold transition-colors ${active ? 'border-brand-blue bg-brand-blue-soft text-brand-blue' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                                        >
                                            {variant.name_ar}
                                            {variant.effectivePrice !== product.effectivePrice && (
                                                <span className="block text-xs font-medium text-gray-500">{formatSDG(variant.effectivePrice)}</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                            {variantHint && <p role="alert" className="text-sm text-red-600 mt-2">اختاري الخيار أولاً</p>}
                        </fieldset>
                    )}

                    <p className="text-gray-700 mb-6 leading-relaxed">{product.description}</p>

                    {product.benefits && product.benefits.length > 0 && (
                        <div className="mb-6">
                            <h3 className="font-bold text-gray-800 mb-2">الفوائد:</h3>
                            <ul className="list-disc list-inside space-y-1 text-gray-700">
                                {product.benefits.map((benefit, idx) => (
                                    <li key={idx}>{benefit}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {product.ingredients && product.ingredients.length > 0 && (
                        <div className="mb-6">
                            <h3 className="font-bold text-gray-800 mb-2">المكونات:</h3>
                            <p className="text-gray-700">{product.ingredients.join(', ')}</p>
                        </div>
                    )}

                    {product.usage && (
                        <div className="mb-6">
                            <h3 className="font-bold text-gray-800 mb-2">طريقة الاستخدام:</h3>
                            <p className="text-gray-700">{product.usage}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                        <div>
                            <p className="text-gray-500">المنشأ:</p>
                            <p className="font-semibold text-gray-800">{product.origin}</p>
                        </div>
                        <div>
                            <p className="text-gray-500">تاريخ الانتهاء:</p>
                            <p className="font-semibold text-gray-800">{product.expiry}</p>
                        </div>
                    </div>

                    <button
                        onClick={handleAddToCart}
                        disabled={product.stock === 0}
                        className="w-full bg-brand-blue hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-blue-100"
                    >
                        <ShoppingCart className="w-5 h-5" />
                        {product.stock > 0 ? 'أضيفي للسلة' : 'غير متوفر'}
                    </button>
                </div>
            </Card>

            <RelatedProducts currentProduct={product} />
            <ReviewSection productId={product.id} />
        </div>
    );
};

import React, { useState } from 'react';
import { Heart, Share2, ShoppingCart, Sparkles, Package, Check } from 'lucide-react';
import { Product } from '@domain/entities';
import clsx from 'clsx';
import { Link, useNavigate } from 'react-router-dom';
import { formatSDG } from '@application/services/format';
import { DiscountIcon } from './DiscountIcon';
import { ProductImage } from './ProductImage';

interface ProductCardProps {
    product: Product;
    isInWishlist: boolean;
    onToggleWishlist: (id: string, product?: Product) => void;
    onAddToCart: (product: Product) => void;
    priority?: boolean; // true for first ~8 cards visible on load
}

const ProductCardInner: React.FC<ProductCardProps> = ({ product, isInWishlist, onToggleWishlist, onAddToCart, priority = false }) => {
    const navigate = useNavigate();
    const [imgLoaded, setImgLoaded] = useState(false);
    const [imgError, setImgError] = useState(false);
    const [isAdded, setIsAdded] = useState(false);

    const finalPrice = product.effectivePrice;
    const hasDiscount = !product.isRemoved && (finalPrice < product.price || Boolean(product.discountPercentage && product.discountPercentage > 0));
    const discountPct = product.discountPercentage || Math.round(((product.price - finalPrice) / product.price) * 100);
    const outOfStock = product.stock <= 0;
    const hasVariants = product.variants.length > 0;
    const productPath = `/product/${product.id}`;
    const productUrl = `${window.location.origin}${productPath}`;

    const share = async () => {
        try {
            if (navigator.share) {
                await navigator.share({ title: product.name_ar, text: `شاهدي هذا المنتج الرائع: ${product.name_ar}`, url: productUrl });
            } else {
                await navigator.clipboard.writeText(productUrl);
            }
        } catch (err) {
            console.error('Share failed', err);
        }
    };

    const addClicked = () => {
        if (product.isRemoved || isAdded) return;
        if (hasVariants) {
            navigate(productPath);
            return;
        }
        setIsAdded(true);
        onAddToCart(product);
        setTimeout(() => setIsAdded(false), 1200);
    };

    return (
        <article className="bg-white rounded-2xl overflow-hidden shadow-card hover:shadow-card-glow border border-brand-blue-soft hover:border-brand-blue/40 transition-all duration-200 relative group flex flex-col h-full">
            <div className="relative shrink-0">
                <div className="absolute top-2 left-2 z-10 flex flex-col gap-1.5">
                    <button
                        type="button"
                        aria-label={isInWishlist ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                        onClick={() => onToggleWishlist(product.id, product)}
                        className="bg-white/90 backdrop-blur-xs w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full shadow-sm text-brand-blue hover:scale-110 active:scale-95 transition-transform"
                    >
                        <Heart className={clsx('w-4 h-4', isInWishlist && 'fill-current text-red-500')} />
                    </button>
                </div>

                <div className="absolute top-2 right-2 z-10 flex flex-col gap-1.5">
                    <button
                        type="button"
                        aria-label="مشاركة"
                        onClick={() => void share()}
                        className="bg-white/90 backdrop-blur-xs w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full shadow-sm text-gray-600 hover:text-brand-blue hover:scale-110 active:scale-95 transition-transform"
                    >
                        <Share2 className="w-4 h-4" />
                    </button>
                </div>

                <Link to={productPath} className="relative block aspect-[4/5] overflow-hidden bg-gray-100 flex items-center justify-center">
                    {/* Shimmer Placeholder while downloading */}
                    {!imgLoaded && !imgError && (
                        <div className="absolute inset-0 bg-gradient-to-r from-gray-100 via-gray-200/60 to-gray-100 animate-pulse flex items-center justify-center">
                            <Sparkles className="w-6 h-6 text-brand-blue/20" />
                        </div>
                    )}

                    {/* Graceful Fallback if image fails */}
                    {imgError ? (
                        <div className="flex flex-col items-center justify-center p-3 text-center text-gray-400 w-full h-full">
                            <Package className="w-8 h-8 mb-1 text-gray-300" />
                            <span className="text-[10px] text-gray-400 font-medium line-clamp-1">{product.brand}</span>
                        </div>
                    ) : (
                        <ProductImage
                            src={product.image}
                            alt={product.name_ar}
                            width={280}
                            height={350}
                            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 210px"
                            loading={priority ? 'eager' : 'lazy'}
                            fetchPriority={priority ? 'high' : 'auto'}
                            onLoad={() => setImgLoaded(true)}
                            onError={() => setImgError(true)}
                            className={clsx(
                                'w-full h-full object-cover group-hover:scale-105 transition-all duration-300',
                                imgLoaded ? 'opacity-100' : 'opacity-0',
                            )}
                        />
                    )}

                    {/* High Visibility Discount Badge with custom tag icon */}
                    {hasDiscount && (
                        <span className="absolute bottom-2 right-2 bg-gradient-to-r from-red-600 to-rose-500 text-white text-[10px] sm:text-[11px] px-2.5 py-1 rounded-full font-black shadow-md flex items-center gap-1.5 animate-in fade-in">
                            <DiscountIcon className="w-4 h-4 drop-shadow-xs" />
                            {product.pricingRule?.label || `خصم ${discountPct}%`}
                        </span>
                    )}
                    {product.isRemoved ? (
                        <span className="absolute inset-0 bg-white/80 backdrop-blur-[2px] flex flex-col items-center justify-center p-2 text-center text-xs font-bold text-rose-600 gap-1">
                            <Package className="w-5 h-5 text-rose-500" />
                            <span>تمت إزالته من المتجر</span>
                        </span>
                    ) : outOfStock ? (
                        <span className="absolute inset-0 bg-white/75 backdrop-blur-[2px] flex items-center justify-center text-xs font-bold text-gray-700">
                            غير متوفر
                        </span>
                    ) : null}
                </Link>
            </div>

            <div className="p-2.5 sm:p-3 flex flex-col flex-1">
                <p className="text-[10px] text-brand-blue font-bold uppercase tracking-wider mb-0.5 truncate">{product.brand}</p>
                <Link to={productPath} className="block">
                    <h3 className="text-xs sm:text-sm font-bold text-gray-800 line-clamp-2 min-h-[2rem] sm:min-h-[2.5rem] mb-1.5 leading-snug hover:text-brand-blue">
                        {product.name_ar}
                    </h3>
                </Link>
                <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
                    <p className="font-black text-xs sm:text-sm text-brand-blue">{formatSDG(finalPrice)}</p>
                    {hasDiscount && (
                        <>
                            <p className="text-[10px] text-gray-400 line-through">{formatSDG(product.price)}</p>
                            <span className="text-[10px] font-extrabold text-red-600 bg-red-50 px-1.5 py-0.2 rounded">
                                -{discountPct}%
                            </span>
                        </>
                    )}
                </div>
                <button
                    type="button"
                    disabled={outOfStock || product.isRemoved || isAdded}
                    onClick={addClicked}
                    className={clsx(
                        "mt-auto w-full py-2 rounded-xl text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all duration-200 active:scale-95 disabled:cursor-not-allowed",
                        isAdded
                            ? "bg-green-600 text-white shadow-green-600/30"
                            : "bg-brand-blue hover:bg-sky-700 text-white disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
                    )}
                >
                    {product.isRemoved ? (
                        'غير متوفر بالمتجر'
                    ) : isAdded ? (
                        <>تمت الإضافة <Check className="w-3.5 h-3.5" /></>
                    ) : hasVariants ? (
                        <>اختاري الخيار <ShoppingCart className="w-3.5 h-3.5" /></>
                    ) : (
                        <>أضيفي للسلة <ShoppingCart className="w-3.5 h-3.5" /></>
                    )}
                </button>
            </div>
        </article>
    );
};

export const ProductCard = React.memo(ProductCardInner, (prev, next) =>
    prev.product.id === next.product.id &&
    prev.product.effectivePrice === next.product.effectivePrice &&
    prev.product.stock === next.product.stock &&
    prev.product.isRemoved === next.product.isRemoved &&
    prev.product.pricingRule?.label === next.product.pricingRule?.label &&
    prev.isInWishlist === next.isInWishlist &&
    prev.priority === next.priority,
);

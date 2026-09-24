import React from 'react';
import { Heart, Share2, ShoppingCart } from 'lucide-react';
import { Product } from '@domain/entities';
import clsx from 'clsx';
import { Link, useNavigate } from 'react-router-dom';
import { formatSDG } from '@application/services/format';

interface ProductCardProps {
    product: Product;
    isInWishlist: boolean;
    onToggleWishlist: (id: string) => void;
    onAddToCart: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, isInWishlist, onToggleWishlist, onAddToCart }) => {
    const navigate = useNavigate();
    const finalPrice = product.effectivePrice;
    const hasDiscount = finalPrice < product.price;
    const outOfStock = product.stock <= 0;
    // A Product with Variants is chosen on its page (shade/size), not from the card.
    const hasVariants = product.variants.length > 0;
    const productUrl = `${window.location.origin}/product/${product.id}`;

    const share = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
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

    return (
        <Link
            to={`/product/${product.id}`}
            className="bg-white rounded-2xl overflow-hidden shadow-card hover:shadow-card-glow border border-brand-blue-soft hover:border-brand-blue/40 cursor-pointer active:scale-[0.98] transition-all duration-200 relative group flex flex-col h-full"
        >
            <div className="absolute top-2 left-2 z-10 flex flex-col gap-1.5">
                <button
                    type="button"
                    aria-label={isInWishlist ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleWishlist(product.id); }}
                    className="bg-white/90 backdrop-blur-xs w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full shadow-sm text-brand-blue hover:scale-110 active:scale-95 transition-transform"
                >
                    <Heart className={clsx('w-4 h-4', isInWishlist && 'fill-current')} />
                </button>
            </div>

            <div className="absolute top-2 right-2 z-10 flex flex-col gap-1.5">
                <button
                    type="button"
                    aria-label="مشاركة"
                    onClick={share}
                    className="bg-white/90 backdrop-blur-xs w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full shadow-sm text-gray-600 hover:text-brand-blue hover:scale-110 active:scale-95 transition-transform"
                >
                    <Share2 className="w-4 h-4" />
                </button>
            </div>

            <div className="relative aspect-[4/5] overflow-hidden shrink-0 bg-gray-50">
                <img
                    src={product.image}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    alt={product.name_ar}
                />
                {product.pricingRule && (
                    <span className="absolute bottom-2 right-2 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black shadow-sm">
                        {product.pricingRule.label}
                    </span>
                )}
                {outOfStock && (
                    <span className="absolute inset-0 bg-white/75 backdrop-blur-[2px] flex items-center justify-center text-xs font-bold text-gray-700">
                        غير متوفر
                    </span>
                )}
            </div>

            <div className="p-2.5 sm:p-3 flex flex-col flex-1">
                <p className="text-[10px] text-brand-blue font-bold uppercase tracking-wider mb-0.5 truncate">{product.brand}</p>
                <h3 className="text-xs sm:text-sm font-bold text-gray-800 line-clamp-2 min-h-[2rem] sm:min-h-[2.5rem] mb-1.5 leading-snug">
                    {product.name_ar}
                </h3>
                <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
                    <p className="font-black text-xs sm:text-sm text-brand-blue">{formatSDG(finalPrice)}</p>
                    {hasDiscount && <p className="text-[10px] text-gray-400 line-through">{formatSDG(product.price)}</p>}
                </div>
                <button
                    type="button"
                    disabled={outOfStock}
                    onClick={(e) => { e.preventDefault(); if (hasVariants) navigate(`/product/${product.id}`); else onAddToCart(product); }}
                    className="mt-auto w-full py-2 rounded-xl text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95 bg-brand-blue hover:bg-sky-700 text-white disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed"
                >
                    {hasVariants ? 'اختاري الخيار' : 'أضيفي للسلة'} <ShoppingCart className="w-3.5 h-3.5" />
                </button>
            </div>
        </Link>
    );
};

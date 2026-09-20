import React from 'react';
import { Heart, Share2, ShoppingCart } from 'lucide-react';
import { Product } from '../../types';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { discountedPrice, formatSDG } from '../../lib/pricing';

interface ProductCardProps {
    product: Product;
    isInWishlist: boolean;
    onToggleWishlist: (id: string) => void;
    onAddToCart: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, isInWishlist, onToggleWishlist, onAddToCart }) => {
    const finalPrice = discountedPrice(product.price, product.discountPercentage);
    const hasDiscount = finalPrice < product.price;
    const outOfStock = product.stock <= 0;
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
            className="bg-white rounded-2xl overflow-hidden shadow-sm border border-brand-blue-soft cursor-pointer active:scale-95 transition-all relative group flex flex-col h-full"
        >
            <div className="absolute top-2 left-2 z-10 flex flex-col gap-2">
                <button
                    type="button"
                    aria-label={isInWishlist ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleWishlist(product.id); }}
                    className="bg-white/90 min-w-11 min-h-11 flex items-center justify-center rounded-full shadow-sm text-brand-blue hover:scale-110 transition-transform"
                >
                    <Heart className={clsx('w-4 h-4', isInWishlist && 'fill-current')} />
                </button>
            </div>

            <div className="absolute top-2 right-2 z-10 flex flex-col gap-2">
                <button type="button" aria-label="مشاركة" onClick={share} className="bg-white/90 min-w-11 min-h-11 flex items-center justify-center rounded-full shadow-sm text-gray-600 hover:text-blue-500 hover:scale-110 transition-transform">
                    <Share2 className="w-4 h-4" />
                </button>
            </div>

            <div className="relative aspect-[4/5] overflow-hidden shrink-0 bg-gray-50">
                <img src={product.image} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={product.name_ar} />
                {hasDiscount && (
                    <span className="absolute bottom-2 right-2 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black shadow">خصم {product.discountPercentage}%</span>
                )}
                {outOfStock && (
                    <span className="absolute inset-0 bg-white/70 flex items-center justify-center text-xs font-bold text-gray-700">غير متوفر</span>
                )}
            </div>

            <div className="p-3 flex flex-col flex-1">
                <p className="text-[10px] text-brand-blue font-bold uppercase tracking-widest mb-0.5">{product.brand}</p>
                <h3 className="text-xs font-bold text-gray-800 truncate mb-1">{product.name_ar}</h3>
                <div className="flex items-center gap-2 mb-3">
                    <p className="font-black text-sm text-brand-blue">{formatSDG(finalPrice)}</p>
                    {hasDiscount && <p className="text-[10px] text-gray-400 line-through">{formatSDG(product.price)}</p>}
                </div>
                <button
                    type="button"
                    disabled={outOfStock}
                    onClick={(e) => { e.preventDefault(); onAddToCart(product); }}
                    className="mt-auto w-full py-2 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-95 bg-brand-blue hover:bg-blue-700 shadow-blue-100 text-white disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed"
                >
                    أضيفي للسلة <ShoppingCart className="w-3 h-3" />
                </button>
            </div>
        </Link>
    );
};

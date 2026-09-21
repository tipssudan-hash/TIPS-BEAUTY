import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Product } from '../../types';
import { ProductCard } from './ProductCard';

interface ProductRowProps {
    id?: string;
    title: string;
    icon?: React.ReactNode;
    subtitle?: string | null;
    products: Product[];
    wishlist: string[];
    onToggleWishlist: (id: string) => void;
    onAddToCart: (product: Product) => void;
    className?: string;
}

const SCROLL_AMOUNT = 420;

export const ProductRow: React.FC<ProductRowProps> = ({ id, title, icon, subtitle, products, wishlist, onToggleWishlist, onAddToCart, className = '' }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    if (products.length === 0) return null;

    const scrollBy = (amount: number) => scrollRef.current?.scrollBy({ left: amount, behavior: 'smooth' });

    return (
        <div id={id} className={className}>
            <h2 className={`text-xl font-bold text-gray-800 flex items-center gap-2 ${subtitle ? 'mb-1' : 'mb-6'}`}>
                {icon}
                {title}
            </h2>
            {subtitle && <p className="text-sm text-gray-500 mb-6">{subtitle}</p>}
            <div className="relative">
                <div
                    ref={scrollRef}
                    role="region"
                    aria-label={title}
                    tabIndex={0}
                    className="flex gap-4 overflow-x-auto no-scrollbar pb-4 scroll-smooth"
                >
                    {products.map(p => (
                        <div key={p.id} className="min-w-[160px] md:min-w-[200px] max-w-[200px]">
                            <ProductCard
                                product={p}
                                isInWishlist={wishlist.includes(p.id)}
                                onToggleWishlist={onToggleWishlist}
                                onAddToCart={onAddToCart}
                            />
                        </div>
                    ))}
                </div>
                <button
                    type="button"
                    aria-label="السابق"
                    onClick={() => scrollBy(-SCROLL_AMOUNT)}
                    className="hidden md:flex absolute right-1 top-1/3 -translate-y-1/2 w-9 h-9 items-center justify-center bg-white/90 shadow-md rounded-full text-gray-600 hover:text-brand-blue"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
                <button
                    type="button"
                    aria-label="التالي"
                    onClick={() => scrollBy(SCROLL_AMOUNT)}
                    className="hidden md:flex absolute left-1 top-1/3 -translate-y-1/2 w-9 h-9 items-center justify-center bg-white/90 shadow-md rounded-full text-gray-600 hover:text-brand-blue"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};

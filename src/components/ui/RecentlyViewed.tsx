import React from 'react';
import { useStore } from '../../context/StoreContext';
import { ProductCard } from './ProductCard';

export const RecentlyViewed: React.FC = () => {
    const { recentlyViewed, addToCart, wishlist, toggleWishlist } = useStore();

    if (recentlyViewed.length === 0) return null;

    return (
        <div className="mt-12 bg-gray-50 p-6 rounded-2xl">
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <span className="text-2xl">👀</span>
                شاهدتِ مؤخراً
            </h2>
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4">
                {recentlyViewed.map(p => (
                    <div key={p.id} className="min-w-[160px] md:min-w-[200px] max-w-[200px]">
                        <ProductCard
                            product={p}
                            isInWishlist={wishlist.includes(p.id)}
                            onToggleWishlist={toggleWishlist}
                            onAddToCart={addToCart}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};

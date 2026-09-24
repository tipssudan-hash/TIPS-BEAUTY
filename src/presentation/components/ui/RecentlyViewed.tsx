import React from 'react';
import { useStore } from '../../context/StoreContext';
import { ProductRow } from './ProductRow';

export const RecentlyViewed: React.FC = () => {
    const { recentlyViewed, addToCart, wishlist, toggleWishlist } = useStore();

    if (recentlyViewed.length === 0) return null;

    return (
        <div className="mt-12 bg-gray-50 p-6 rounded-2xl">
            <ProductRow
                title="شاهدتِ مؤخراً"
                icon={<span className="text-2xl">👀</span>}
                products={recentlyViewed}
                wishlist={wishlist}
                onToggleWishlist={toggleWishlist}
                onAddToCart={addToCart}
            />
        </div>
    );
};

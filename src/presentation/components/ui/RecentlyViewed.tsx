import React from 'react';
import { useStore } from '../../context/StoreContext';
import { useAuth } from '../../context/AuthContext';
import { ProductRow } from './ProductRow';
import { Clock } from 'lucide-react';

export const RecentlyViewed: React.FC<{ className?: string }> = ({ className = '' }) => {
    const { recentlyViewed, addToCart, wishlist, toggleWishlist } = useStore();
    const { user } = useAuth();

    if (!user || recentlyViewed.length === 0) return null;

    return (
        <ProductRow
            id="recently-viewed"
            title="شاهدتِ مؤخراً"
            icon={<Clock className="w-5 h-5 text-brand-blue" />}
            products={recentlyViewed}
            wishlist={wishlist}
            onToggleWishlist={toggleWishlist}
            onAddToCart={addToCart}
            className={className}
        />
    );
};


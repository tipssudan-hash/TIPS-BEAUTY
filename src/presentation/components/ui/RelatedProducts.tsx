import React from 'react';
import { Product } from '@domain/entities';
import { ProductCard } from './ProductCard';
import { useStore } from '../../context/StoreContext';

interface RelatedProductsProps {
    currentProduct: Product;
}

export const RelatedProducts: React.FC<RelatedProductsProps> = ({ currentProduct }) => {
    const { products, addToCart, wishlist, toggleWishlist } = useStore();

    const related = products
        .filter(p => p.category === currentProduct.category && p.id !== currentProduct.id)
        .slice(0, 4);

    if (related.length === 0) return null;

    return (
        <div className="mt-8 md:mt-12">
            <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-6">منتجات قد تعجبك</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-3 sm:gap-4">
                {related.map(p => (
                    <ProductCard
                        key={p.id}
                        product={p}
                        isInWishlist={wishlist.includes(p.id)}
                        onToggleWishlist={toggleWishlist}
                        onAddToCart={addToCart}
                    />
                ))}
            </div>
        </div>
    );
};

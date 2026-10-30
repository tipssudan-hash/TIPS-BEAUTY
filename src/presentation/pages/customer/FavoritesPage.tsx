import React from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { ProductCard } from '../../components/ui/ProductCard';
import { EmptyState, primaryButtonClass } from '../../components/ui';
import { usePageMeta } from '../../hooks/usePageMeta';

export const FavoritesPage: React.FC = () => {
    const { favoriteProducts, wishlist, addToCart, toggleWishlist, productsLoading } = useStore();

    usePageMeta({ title: 'المفضلة | Tips Beauty', noindex: true });

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 animate-fadeIn">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6">المفضلة</h1>
            {favoriteProducts.length === 0 ? (
                <EmptyState
                    icon={<Heart className="w-7 h-7" />}
                    title="لا توجد منتجات في المفضلة"
                    body={productsLoading ? 'جاري تحميل المنتجات...' : 'أضيفي المنتجات التي تعجبك لتجديها هنا.'}
                    action={<Link to="/" className={primaryButtonClass}>تصفحي المنتجات</Link>}
                />
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
                    {favoriteProducts.map((product) => (
                        <ProductCard
                            key={product.id}
                            product={product}
                            isInWishlist={wishlist.includes(product.id)}
                            onToggleWishlist={toggleWishlist}
                            onAddToCart={(p) => addToCart(p)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

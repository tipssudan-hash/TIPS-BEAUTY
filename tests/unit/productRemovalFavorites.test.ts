import { describe, expect, it } from 'vitest';
import type { Product } from '@domain/entities';

// Helper simulating StoreContext favoriteProducts logic
function computeFavoriteProducts(
    wishlist: string[],
    activeProducts: Product[],
    favoriteSnapshots: Record<string, Product>
): Product[] {
    const productsMap = new Map(activeProducts.map(p => [p.id, p]));
    return wishlist.map(id => {
        const active = productsMap.get(id);
        if (active) return active;
        const snapshot = favoriteSnapshots[id];
        if (snapshot) {
            return {
                ...snapshot,
                isRemoved: true,
                stock: 0,
            };
        }
        return null;
    }).filter((p): p is Product => Boolean(p));
}

// Helper simulating StoreContext activeRecentlyViewed logic
function computeActiveRecentlyViewed(
    recentlyViewed: Product[],
    activeProducts: Product[]
): Product[] {
    if (activeProducts.length === 0) return recentlyViewed.filter(p => !p.isRemoved);
    const activeIds = new Set(activeProducts.map(p => p.id));
    return recentlyViewed.filter(p => activeIds.has(p.id) && !p.isRemoved);
}

// Helper simulating StoreContext addToRecentlyViewed logic
function canAddToRecentlyViewed(product: Product, activeProducts: Product[]): boolean {
    if (product.isRemoved) return false;
    if (activeProducts.length > 0 && !activeProducts.some(p => p.id === product.id)) return false;
    return true;
}

// Helper simulating StoreContext addToCart logic
function canAddToCart(product: Product, activeProducts: Product[]): boolean {
    if (product.isRemoved) return false;
    if (activeProducts.length > 0 && !activeProducts.some(p => p.id === product.id)) return false;
    return true;
}

const mockProductA: Product = {
    id: 'prod-a',
    name_ar: 'منتج أ',
    name_en: 'Product A',
    price: 1000,
    discountPercentage: 0,
    effectivePrice: 1000,
    pricingRule: null,
    category: 'عناية',
    brand: 'Tips',
    image: 'https://example.com/a.jpg',
    images: ['https://example.com/a.jpg'],
    description: 'وصف أ',
    benefits: [],
    ingredients: [],
    usage: '',
    origin: 'فرنسا',
    expiry: '2027',
    stock: 10,
    isImported: true,
    skinType: [],
    rating: 5,
    reviewCount: 1,
    variants: [],
    createdAt: '2026-01-01T00:00:00Z',
};

const mockProductDeleted: Product = {
    id: 'prod-deleted',
    name_ar: 'منتج محذوف',
    name_en: 'Deleted Product',
    price: 2000,
    discountPercentage: 0,
    effectivePrice: 2000,
    pricingRule: null,
    category: 'مكياج',
    brand: 'Tips',
    image: 'https://example.com/del.jpg',
    images: ['https://example.com/del.jpg'],
    description: 'منتج قديم تم حذفه من المتجر',
    benefits: [],
    ingredients: [],
    usage: '',
    origin: 'إيطاليا',
    expiry: '2026',
    stock: 5,
    isImported: true,
    skinType: [],
    rating: 4,
    reviewCount: 3,
    variants: [],
    createdAt: '2026-01-01T00:00:00Z',
};

describe('Product removal handling for Recently Viewed and Favorites', () => {
    const activeCatalogue = [mockProductA];
    const favoriteSnapshots = {
        'prod-a': mockProductA,
        'prod-deleted': mockProductDeleted,
    };

    it('does NOT put deleted or removed products in recently viewed', () => {
        const storedRecentlyViewed = [mockProductDeleted, mockProductA];
        const result = computeActiveRecentlyViewed(storedRecentlyViewed, activeCatalogue);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('prod-a');
        expect(result.some(p => p.id === 'prod-deleted')).toBe(false);
    });

    it('rejects adding deleted/removed product to recently viewed', () => {
        expect(canAddToRecentlyViewed(mockProductDeleted, activeCatalogue)).toBe(false);
        expect(canAddToRecentlyViewed({ ...mockProductDeleted, isRemoved: true }, activeCatalogue)).toBe(false);
        expect(canAddToRecentlyViewed(mockProductA, activeCatalogue)).toBe(true);
    });

    it('SHOWS deleted or removed products if they are in favorites (wishlist)', () => {
        const wishlist = ['prod-a', 'prod-deleted'];
        const favProducts = computeFavoriteProducts(wishlist, activeCatalogue, favoriteSnapshots);

        expect(favProducts).toHaveLength(2);

        const activeFav = favProducts.find(p => p.id === 'prod-a');
        expect(activeFav).toBeDefined();
        expect(activeFav?.isRemoved).toBeFalsy();
        expect(activeFav?.stock).toBe(10);

        const deletedFav = favProducts.find(p => p.id === 'prod-deleted');
        expect(deletedFav).toBeDefined();
        expect(deletedFav?.isRemoved).toBe(true);
        expect(deletedFav?.stock).toBe(0);
        expect(deletedFav?.name_ar).toBe('منتج محذوف');
    });

    it('prevents adding deleted/removed products to cart', () => {
        expect(canAddToCart(mockProductDeleted, activeCatalogue)).toBe(false);
        expect(canAddToCart({ ...mockProductDeleted, isRemoved: true }, activeCatalogue)).toBe(false);
        expect(canAddToCart(mockProductA, activeCatalogue)).toBe(true);
    });

    describe('Personal favorites & authentication scoping', () => {
        const computeUserFavoriteProducts = (
            userId: string | null,
            wishlist: string[],
            catalogue: Product[],
            snapshots: Record<string, Product>
        ) => {
            if (!userId || wishlist.length === 0) return [];
            return computeFavoriteProducts(wishlist, catalogue, snapshots);
        };

        const shouldRenderFavoritesSection = (
            user: { id: string } | null,
            isFiltered: boolean,
            favoriteProducts: Product[]
        ) => {
            return !isFiltered && Boolean(user) && favoriteProducts.length > 0;
        };

        it('does NOT return favorite products if user is not logged in', () => {
            const wishlist = ['prod-a'];
            const result = computeUserFavoriteProducts(null, wishlist, activeCatalogue, favoriteSnapshots);
            expect(result).toEqual([]);
        });

        it('removes the section if user is logged out', () => {
            expect(shouldRenderFavoritesSection(null, false, [mockProductA])).toBe(false);
        });

        it('removes the section if logged-in user has no favorites', () => {
            expect(shouldRenderFavoritesSection({ id: 'user-1' }, false, [])).toBe(false);
        });

        it('shows the section only when user is logged in AND has favorites', () => {
            expect(shouldRenderFavoritesSection({ id: 'user-1' }, false, [mockProductA])).toBe(true);
            expect(shouldRenderFavoritesSection({ id: 'user-1' }, true, [mockProductA])).toBe(false);
        });

        it('isolates favorites so User A favorites do not appear for User B', () => {
            const userAWishlist = ['prod-a'];
            const userBWishlist = ['prod-deleted'];

            const userAFavorites = computeUserFavoriteProducts('user-A', userAWishlist, activeCatalogue, favoriteSnapshots);
            const userBFavorites = computeUserFavoriteProducts('user-B', userBWishlist, activeCatalogue, favoriteSnapshots);

            expect(userAFavorites.map(p => p.id)).toEqual(['prod-a']);
            expect(userBFavorites.map(p => p.id)).toEqual(['prod-deleted']);
            expect(userAFavorites.some(p => p.id === 'prod-deleted')).toBe(false);
            expect(userBFavorites.some(p => p.id === 'prod-a')).toBe(false);
        });
    });

    describe('Personalized Recently Viewed & authentication scoping', () => {
        const computeUserActiveRecentlyViewed = (
            userId: string | null,
            history: Product[],
            activeProducts: Product[]
        ) => {
            if (!userId || history.length === 0) return [];
            return computeActiveRecentlyViewed(history, activeProducts);
        };

        const canUserAddToRecentlyViewed = (
            userId: string | null,
            product: Product,
            activeProducts: Product[]
        ) => {
            if (!userId) return false;
            return canAddToRecentlyViewed(product, activeProducts);
        };

        it('does NOT show recently viewed for logged-out users', () => {
            const history = [mockProductA];
            const result = computeUserActiveRecentlyViewed(null, history, activeCatalogue);
            expect(result).toEqual([]);
        });

        it('rejects adding to recently viewed when not logged in', () => {
            expect(canUserAddToRecentlyViewed(null, mockProductA, activeCatalogue)).toBe(false);
            expect(canUserAddToRecentlyViewed('user-1', mockProductA, activeCatalogue)).toBe(true);
        });

        it('isolates recently viewed history between different users', () => {
            const userAHistory = [mockProductA];
            const userBHistory = [mockProductDeleted]; // say user B had another product

            const userARecent = computeUserActiveRecentlyViewed('user-A', userAHistory, activeCatalogue);
            const userBRecent = computeUserActiveRecentlyViewed('user-B', userBHistory, activeCatalogue);

            expect(userARecent.map(p => p.id)).toEqual(['prod-a']);
            expect(userBRecent.map(p => p.id)).toEqual([]); // deleted product filtered out
        });
    });
});

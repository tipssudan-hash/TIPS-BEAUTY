import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { Product, ProductVariant, CartItem } from '@domain/entities';
import { fetchProducts } from '@infrastructure/repositories';
import { cartLineKey } from '@domain/valueObjects';
import { getCached, setCache, invalidateCache } from '@infrastructure/cache';
import { useAuth } from './AuthContext';
import { supabase } from '@infrastructure/supabase';
import { useNavigate } from 'react-router-dom';

export interface CartNotificationData {
    productId: string;
    productName: string;
    variantName?: string | null;
    image: string;
    price: number;
}

interface StoreContextType {
    products: Product[];
    productsLoading: boolean;
    productsError: string | null;
    reloadProducts: () => Promise<void>;
    cart: CartItem[];
    wishlist: string[];
    favoriteProducts: Product[];
    // A Product with Variants is added with one of them; lines are addressed by cartLineKey.
    addToCart: (product: Product, variant?: ProductVariant | null, quantity?: number) => void;
    removeFromCart: (lineKey: string) => void;
    updateQuantity: (lineKey: string, quantity: number) => void;
    clearCart: () => void;
    toggleWishlist: (productId: string, product?: Product) => void;
    addToRecentlyViewed: (product: Product) => void;
    recentlyViewed: Product[];
    cartCount: number;
    cartNotification: CartNotificationData | null;
    dismissCartNotification: () => void;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

function readJson<T>(key: string, validate: (value: unknown) => value is T, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed: unknown = JSON.parse(raw);
        return validate(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

const isCart = (value: unknown): value is CartItem[] =>
    Array.isArray(value) && value.every((i) => i && typeof i.productId === 'string' && typeof i.quantity === 'number');
// Carts persisted before Variants have no variantId; treat them as plain Product lines.
const withVariantFields = (items: CartItem[]): CartItem[] => items.map((i) => ({ ...i, variantId: i.variantId ?? null, variantName: i.variantName ?? null }));
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === 'string');
const isProductArray = (value: unknown): value is Product[] => Array.isArray(value) && value.every((p) => p && typeof p.id === 'string' && typeof p.name_ar === 'string');
const isProductRecord = (value: unknown): value is Record<string, Product> =>
    value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every((p) => p && typeof (p as Product).id === 'string' && typeof (p as Product).name_ar === 'string');
const MAX_RECENTLY_VIEWED_ITEMS = 10;

export const StoreProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const userId = user?.id ?? null;
    const navigate = useNavigate();

    const [products, setProducts] = useState<Product[]>(() => getCached<Product[]>('products:all') ?? []);
    const [productsLoading, setProductsLoading] = useState(() => getCached<Product[]>('products:all') === null);
    const [productsError, setProductsError] = useState<string | null>(null);

    const reloadProducts = useCallback(async (force = false) => {
        if (force) invalidateCache('products:all');
        const cached = getCached<Product[]>('products:all');
        if (cached) {
            setProducts(cached);
            setProductsLoading(false);
        } else {
            setProductsLoading(true);
        }
        setProductsError(null);
        try {
            const fresh = await fetchProducts();
            setCache('products:all', fresh);
            setProducts(fresh);
        } catch (error) {
            console.error('Failed to load products', error);
            if (!cached) setProductsError('تعذر تحميل المنتجات، تحققي من الاتصال وحاولي مرة أخرى.');
        } finally {
            setProductsLoading(false);
        }
    }, []);

    useEffect(() => { void reloadProducts(); }, [reloadProducts]);

    const [cart, setCart] = useState<CartItem[]>(() => withVariantFields(readJson('sb_cart', isCart, [])));
    const [wishlist, setWishlist] = useState<string[]>(() => {
        if (!userId) return [];
        const userWishlist = readJson(`sb_wishlist_${userId}`, isStringArray, null as string[] | null);
        if (userWishlist !== null) return userWishlist;
        return readJson('sb_wishlist', isStringArray, []);
    });

    const [favoriteSnapshots, setFavoriteSnapshots] = useState<Record<string, Product>>(() => {
        if (!userId) return {};
        const userSnapshots = readJson(`sb_favorite_snapshots_${userId}`, isProductRecord, null as Record<string, Product> | null);
        if (userSnapshots !== null) return userSnapshots;
        return readJson('sb_favorite_snapshots', isProductRecord, {});
    });

    const [recentlyViewed, setRecentlyViewed] = useState<Product[]>(() => {
        if (!userId) return [];
        const userRecent = readJson(`sb_recently_viewed_${userId}`, isProductArray, null as Product[] | null);
        if (userRecent !== null) return userRecent.slice(0, MAX_RECENTLY_VIEWED_ITEMS);
        return readJson('sb_recently_viewed', isProductArray, []).slice(0, MAX_RECENTLY_VIEWED_ITEMS);
    });

    useEffect(() => localStorage.setItem('sb_cart', JSON.stringify(cart)), [cart]);

    // Handle user switching: synchronize personal favorites and snapshots
    useEffect(() => {
        if (!userId) {
            setWishlist([]);
            setFavoriteSnapshots({});
            setRecentlyViewed([]);
            return;
        }

        const userRecentKey = `sb_recently_viewed_${userId}`;
        const cachedRecent = readJson<Product[] | null>(userRecentKey, isProductArray, null);
        if (cachedRecent !== null) {
            setRecentlyViewed(cachedRecent.slice(0, MAX_RECENTLY_VIEWED_ITEMS));
        } else {
            const legacyRecent = readJson('sb_recently_viewed', isProductArray, []);
            setRecentlyViewed(legacyRecent.slice(0, MAX_RECENTLY_VIEWED_ITEMS));
            if (legacyRecent.length > 0) {
                localStorage.setItem(userRecentKey, JSON.stringify(legacyRecent.slice(0, MAX_RECENTLY_VIEWED_ITEMS)));
                localStorage.removeItem('sb_recently_viewed');
            }
        }

        const userWishlistKey = `sb_wishlist_${userId}`;
        const userSnapshotsKey = `sb_favorite_snapshots_${userId}`;

        const cachedWishlist = readJson<string[] | null>(userWishlistKey, isStringArray, null);
        const cachedSnapshots = readJson<Record<string, Product> | null>(userSnapshotsKey, isProductRecord, null);

        let initialList: string[] = [];
        if (cachedWishlist !== null) {
            initialList = cachedWishlist;
        } else {
            const legacy = readJson('sb_wishlist', isStringArray, []);
            initialList = legacy;
            if (legacy.length > 0) {
                localStorage.setItem(userWishlistKey, JSON.stringify(legacy));
                localStorage.removeItem('sb_wishlist');
            }
        }
        setWishlist(initialList);

        if (cachedSnapshots !== null) {
            setFavoriteSnapshots(cachedSnapshots);
        } else {
            const legacySnapshots = readJson('sb_favorite_snapshots', isProductRecord, {});
            setFavoriteSnapshots(legacySnapshots);
            if (Object.keys(legacySnapshots).length > 0) {
                localStorage.setItem(userSnapshotsKey, JSON.stringify(legacySnapshots));
                localStorage.removeItem('sb_favorite_snapshots');
            }
        }

        let cancelled = false;
        void (async () => {
            try {
                const { data, error } = await supabase
                    .from('customer_favorites')
                    .select('product_id')
                    .eq('customer_id', userId);
                if (cancelled || error || !Array.isArray(data)) return;
                const remoteIds = data.map((row: { product_id: string }) => row.product_id);
                setWishlist(prev => Array.from(new Set([...prev, ...remoteIds])));
            } catch {
                // Ignore offline / network errors
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [userId]);

    useEffect(() => {
        if (userId) {
            localStorage.setItem(`sb_wishlist_${userId}`, JSON.stringify(wishlist));
        }
    }, [wishlist, userId]);

    useEffect(() => {
        if (userId) {
            localStorage.setItem(`sb_favorite_snapshots_${userId}`, JSON.stringify(favoriteSnapshots));
        }
    }, [favoriteSnapshots, userId]);

    useEffect(() => {
        if (userId) {
            localStorage.setItem(`sb_recently_viewed_${userId}`, JSON.stringify(recentlyViewed));
        }
    }, [recentlyViewed, userId]);

    // Keep favorite snapshots fresh for active items
    useEffect(() => {
        if (userId && products.length > 0 && wishlist.length > 0) {
            setFavoriteSnapshots(prev => {
                let changed = false;
                const next = { ...prev };
                for (const id of wishlist) {
                    const active = products.find(p => p.id === id);
                    if (active && (!next[id] || next[id].effectivePrice !== active.effectivePrice || next[id].name_ar !== active.name_ar)) {
                        next[id] = active;
                        changed = true;
                    }
                }
                return changed ? next : prev;
            });
        }
    }, [userId, products, wishlist]);

    // Prune removed or deleted products from recentlyViewed once catalogue is loaded
    useEffect(() => {
        if (!productsLoading && products.length > 0) {
            setRecentlyViewed(prev => {
                const activeIds = new Set(products.map(p => p.id));
                const filtered = prev.filter(p => activeIds.has(p.id) && !p.isRemoved);
                return filtered.length !== prev.length ? filtered : prev;
            });
        }
    }, [products, productsLoading]);

    const activeRecentlyViewed = useMemo(() => {
        if (!userId || recentlyViewed.length === 0) return [];
        if (products.length === 0) return recentlyViewed.filter(p => !p.isRemoved);
        const activeIds = new Set(products.map(p => p.id));
        return recentlyViewed.filter(p => activeIds.has(p.id) && !p.isRemoved);
    }, [userId, recentlyViewed, products]);

    const favoriteProducts = useMemo<Product[]>(() => {
        if (!userId || wishlist.length === 0) return [];
        const productsMap = new Map(products.map(p => [p.id, p]));
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
    }, [userId, wishlist, products, favoriteSnapshots]);

    const addToRecentlyViewed = useCallback((product: Product) => {
        if (!userId) return;
        if (product.isRemoved) return;
        if (products.length > 0 && !products.some(p => p.id === product.id)) return;
        setRecentlyViewed(prev => [product, ...prev.filter(p => p.id !== product.id)].slice(0, MAX_RECENTLY_VIEWED_ITEMS));
    }, [userId, products]);

    const [cartNotification, setCartNotification] = useState<CartNotificationData | null>(null);
    const dismissCartNotification = useCallback(() => setCartNotification(null), []);

    useEffect(() => {
        if (!cartNotification) return;
        const timer = setTimeout(() => {
            setCartNotification(null);
        }, 3500);
        return () => clearTimeout(timer);
    }, [cartNotification]);

    const addToCart = useCallback((product: Product, variant: ProductVariant | null = null, quantity = 1) => {
        if (product.isRemoved) return;
        if (products.length > 0 && !products.some(p => p.id === product.id)) return;
        setCart(prev => {
            const line: CartItem = {
                productId: product.id,
                variantId: variant?.id ?? null,
                variantName: variant?.name_ar ?? null,
                name_ar: product.name_ar,
                image: product.image,
                price: variant?.price ?? product.price,
                discountPercentage: product.discountPercentage,
                effectivePrice: variant ? variant.effectivePrice : product.effectivePrice,
                pricingRule: variant ? variant.pricingRule : product.pricingRule,
                quantity,
            };
            const key = cartLineKey(line);
            const existing = prev.find(item => cartLineKey(item) === key);
            if (existing) {
                return prev.map(item => cartLineKey(item) === key ? { ...item, quantity: item.quantity + quantity } : item);
            }
            return [...prev, line];
        });
        setCartNotification({
            productId: product.id,
            productName: product.name_ar,
            variantName: variant?.name_ar ?? null,
            image: product.image,
            price: variant ? variant.effectivePrice : product.effectivePrice,
        });
    }, [products]);

    const removeFromCart = useCallback((lineKey: string) => {
        setCart(prev => prev.filter(item => cartLineKey(item) !== lineKey));
    }, []);

    const updateQuantity = useCallback((lineKey: string, quantity: number) => {
        if (quantity <= 0) {
            removeFromCart(lineKey);
            return;
        }
        setCart(prev => prev.map(item => cartLineKey(item) === lineKey ? { ...item, quantity } : item));
    }, [removeFromCart]);

    const clearCart = useCallback(() => setCart([]), []);

    const toggleWishlist = useCallback((productId: string, product?: Product) => {
        if (!userId) {
            if (navigate) {
                navigate('/login');
            } else if (typeof window !== 'undefined') {
                window.location.assign('/login');
            }
            return;
        }

        setWishlist(prev => {
            const exists = prev.includes(productId);
            if (exists) {
                void supabase
                    .from('customer_favorites')
                    .delete()
                    .eq('customer_id', userId)
                    .eq('product_id', productId);
                return prev.filter(id => id !== productId);
            } else {
                const snapshot = product
                    || products.find(p => p.id === productId)
                    || recentlyViewed.find(p => p.id === productId);
                if (snapshot) {
                    setFavoriteSnapshots(current => ({ ...current, [productId]: snapshot }));
                }
                void supabase
                    .from('customer_favorites')
                    .insert({ customer_id: userId, product_id: productId });
                return [...prev, productId];
            }
        });
    }, [userId, products, recentlyViewed, navigate]);

    const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    return (
        <StoreContext.Provider value={{
            products,
            productsLoading,
            productsError,
            reloadProducts,
            cart,
            wishlist,
            favoriteProducts,
            recentlyViewed: activeRecentlyViewed,
            addToCart,
            removeFromCart,
            updateQuantity,
            clearCart,
            toggleWishlist,
            addToRecentlyViewed,
            cartCount,
            cartNotification,
            dismissCartNotification,
        }}>
            {children}
        </StoreContext.Provider>
    );
};

export const useStore = () => {
    const context = useContext(StoreContext);
    if (!context) throw new Error('useStore must be used within a StoreProvider');
    return context;
};

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Product, CartItem } from '../types';
import { fetchProducts } from '../lib/api';

interface StoreContextType {
    products: Product[];
    productsLoading: boolean;
    productsError: string | null;
    reloadProducts: () => Promise<void>;
    cart: CartItem[];
    wishlist: string[];
    addToCart: (product: Product, quantity?: number) => void;
    removeFromCart: (productId: string) => void;
    updateQuantity: (productId: string, quantity: number) => void;
    clearCart: () => void;
    toggleWishlist: (productId: string) => void;
    addToRecentlyViewed: (product: Product) => void;
    recentlyViewed: Product[];
    cartCount: number;
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
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === 'string');
const isProductArray = (value: unknown): value is Product[] => Array.isArray(value) && value.every((p) => p && typeof p.id === 'string' && typeof p.name_ar === 'string');

export const StoreProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [products, setProducts] = useState<Product[]>([]);
    const [productsLoading, setProductsLoading] = useState(true);
    const [productsError, setProductsError] = useState<string | null>(null);

    const reloadProducts = React.useCallback(async () => {
        setProductsLoading(true);
        setProductsError(null);
        try {
            setProducts(await fetchProducts());
        } catch (error) {
            console.error('Failed to load products', error);
            setProductsError('تعذر تحميل المنتجات، تحققي من الاتصال وحاولي مرة أخرى.');
        } finally {
            setProductsLoading(false);
        }
    }, []);

    useEffect(() => { void reloadProducts(); }, [reloadProducts]);

    const [cart, setCart] = useState<CartItem[]>(() => readJson('sb_cart', isCart, []));
    const [wishlist, setWishlist] = useState<string[]>(() => readJson('sb_wishlist', isStringArray, []));
    const [recentlyViewed, setRecentlyViewed] = useState<Product[]>(() => readJson('sb_recently_viewed', isProductArray, []));

    useEffect(() => localStorage.setItem('sb_cart', JSON.stringify(cart)), [cart]);
    useEffect(() => localStorage.setItem('sb_wishlist', JSON.stringify(wishlist)), [wishlist]);
    useEffect(() => localStorage.setItem('sb_recently_viewed', JSON.stringify(recentlyViewed)), [recentlyViewed]);

    const addToRecentlyViewed = React.useCallback((product: Product) => {
        setRecentlyViewed(prev => [product, ...prev.filter(p => p.id !== product.id)].slice(0, 10));
    }, []);

    const addToCart = React.useCallback((product: Product, quantity = 1) => {
        setCart(prev => {
            const existing = prev.find(item => item.productId === product.id);
            if (existing) {
                return prev.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + quantity } : item);
            }
            return [...prev, {
                productId: product.id,
                name_ar: product.name_ar,
                image: product.image,
                price: product.price,
                discountPercentage: product.discountPercentage,
                effectivePrice: product.effectivePrice,
                pricingRule: product.pricingRule,
                quantity,
            }];
        });
    }, []);

    const removeFromCart = React.useCallback((productId: string) => {
        setCart(prev => prev.filter(item => item.productId !== productId));
    }, []);

    const updateQuantity = React.useCallback((productId: string, quantity: number) => {
        if (quantity <= 0) {
            removeFromCart(productId);
            return;
        }
        setCart(prev => prev.map(item => item.productId === productId ? { ...item, quantity } : item));
    }, [removeFromCart]);

    const clearCart = React.useCallback(() => setCart([]), []);

    const toggleWishlist = React.useCallback((productId: string) => {
        setWishlist(prev => prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]);
    }, []);

    const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    return (
        <StoreContext.Provider value={{ products, productsLoading, productsError, reloadProducts, cart, wishlist, recentlyViewed, addToCart, removeFromCart, updateQuantity, clearCart, toggleWishlist, addToRecentlyViewed, cartCount }}>
            {children}
        </StoreContext.Provider>
    );
};

export const useStore = () => {
    const context = useContext(StoreContext);
    if (!context) throw new Error('useStore must be used within a StoreProvider');
    return context;
};

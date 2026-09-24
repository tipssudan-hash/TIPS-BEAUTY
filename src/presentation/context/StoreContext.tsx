import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Product, ProductVariant, CartItem } from '@domain/entities';
import { fetchProducts } from '@infrastructure/repositories';
import { cartLineKey } from '@domain/valueObjects';

interface StoreContextType {
    products: Product[];
    productsLoading: boolean;
    productsError: string | null;
    reloadProducts: () => Promise<void>;
    cart: CartItem[];
    wishlist: string[];
    // A Product with Variants is added with one of them; lines are addressed by cartLineKey.
    addToCart: (product: Product, variant?: ProductVariant | null, quantity?: number) => void;
    removeFromCart: (lineKey: string) => void;
    updateQuantity: (lineKey: string, quantity: number) => void;
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
// Carts persisted before Variants have no variantId; treat them as plain Product lines.
const withVariantFields = (items: CartItem[]): CartItem[] => items.map((i) => ({ ...i, variantId: i.variantId ?? null, variantName: i.variantName ?? null }));
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

    const [cart, setCart] = useState<CartItem[]>(() => withVariantFields(readJson('sb_cart', isCart, [])));
    const [wishlist, setWishlist] = useState<string[]>(() => readJson('sb_wishlist', isStringArray, []));
    const [recentlyViewed, setRecentlyViewed] = useState<Product[]>(() => readJson('sb_recently_viewed', isProductArray, []));

    useEffect(() => localStorage.setItem('sb_cart', JSON.stringify(cart)), [cart]);
    useEffect(() => localStorage.setItem('sb_wishlist', JSON.stringify(wishlist)), [wishlist]);
    useEffect(() => localStorage.setItem('sb_recently_viewed', JSON.stringify(recentlyViewed)), [recentlyViewed]);

    const addToRecentlyViewed = React.useCallback((product: Product) => {
        setRecentlyViewed(prev => [product, ...prev.filter(p => p.id !== product.id)].slice(0, 10));
    }, []);

    const addToCart = React.useCallback((product: Product, variant: ProductVariant | null = null, quantity = 1) => {
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
    }, []);

    const removeFromCart = React.useCallback((lineKey: string) => {
        setCart(prev => prev.filter(item => cartLineKey(item) !== lineKey));
    }, []);

    const updateQuantity = React.useCallback((lineKey: string, quantity: number) => {
        if (quantity <= 0) {
            removeFromCart(lineKey);
            return;
        }
        setCart(prev => prev.map(item => cartLineKey(item) === lineKey ? { ...item, quantity } : item));
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

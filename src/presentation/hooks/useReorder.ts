import { useCallback } from 'react';
import type { OrderItem } from '@domain/entities';
import { planReorder } from '@application/services/reorder';
import { useStore } from '../context/StoreContext';

// Puts a past Order's lines back into the Cart at today's prices and stock.
export function useReorder(): (items: OrderItem[]) => { added: number; skipped: number } {
    const { products, addToCart } = useStore();
    return useCallback((items: OrderItem[]) => {
        const plan = planReorder(items, products);
        for (const line of plan.lines) addToCart(line.product, line.variant, line.quantity);
        return { added: plan.lines.length, skipped: plan.skipped };
    }, [products, addToCart]);
}

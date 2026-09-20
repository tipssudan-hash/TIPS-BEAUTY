import { useCallback, useEffect, useState } from 'react';
import { countUnseenOrders, subscribeToOrders } from '../lib/adminApi';

export function useUnseenOrders(): { count: number; refresh: () => Promise<void> } {
    const [count, setCount] = useState(0);

    const refresh = useCallback(async () => {
        try {
            const next = await countUnseenOrders();
            setCount(next);
        } catch (error) {
            console.error('countUnseenOrders failed', error);
        }
    }, []);

    useEffect(() => {
        const load = () => { void refresh(); };
        const unsubscribe = subscribeToOrders(load);
        const initial = setTimeout(load, 0);
        return () => {
            clearTimeout(initial);
            unsubscribe();
        };
    }, [refresh]);

    return { count, refresh };
}

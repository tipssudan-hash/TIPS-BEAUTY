import { useEffect, useState } from 'react';
import { countOrdersNeedingAction, subscribeToOrders } from '../lib/adminApi';

export function useOrdersNeedingActionCount(enabled = true): number {
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!enabled) return;
        let active = true;
        const load = () => {
            countOrdersNeedingAction()
                .then((next) => { if (active) setCount(next); })
                .catch((error) => console.error('countOrdersNeedingAction failed', error));
        };
        load();
        const unsubscribe = subscribeToOrders(load);
        return () => {
            active = false;
            unsubscribe();
        };
    }, [enabled]);

    return enabled ? count : 0;
}

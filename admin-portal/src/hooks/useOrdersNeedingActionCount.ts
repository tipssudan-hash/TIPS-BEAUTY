import { useEffect, useState } from 'react';
import { countOrdersNeedingAction, subscribeToOrders } from '../lib/adminApi';

export function useOrdersNeedingActionCount(): number {
    const [count, setCount] = useState(0);

    useEffect(() => {
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
    }, []);

    return count;
}

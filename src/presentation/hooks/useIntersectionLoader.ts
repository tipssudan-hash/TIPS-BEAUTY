import { useEffect, useRef } from 'react';

export function useIntersectionLoader(
    onIntersect: () => void,
    enabled: boolean,
): React.RefObject<HTMLDivElement | null> {
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const callbackRef = useRef(onIntersect);
    callbackRef.current = onIntersect;
    const isTriggeringRef = useRef(false);

    useEffect(() => {
        if (!enabled) return;
        const el = sentinelRef.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry && entry.isIntersecting && !isTriggeringRef.current) {
                    isTriggeringRef.current = true;
                    callbackRef.current();
                    // Throttle re-triggering for 300ms to allow DOM to layout smoothly
                    setTimeout(() => {
                        isTriggeringRef.current = false;
                    }, 300);
                }
            },
            { rootMargin: '150px' },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [enabled]);

    return sentinelRef;
}


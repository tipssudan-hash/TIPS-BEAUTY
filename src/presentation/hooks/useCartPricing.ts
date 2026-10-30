import { useEffect, useState } from 'react';
import type { CartPricing } from '@domain/entities';
import { previewCartPricing, type CheckoutItem } from '@infrastructure/repositories';
import { errorMessage } from '@application/errors';

const PREVIEW_DEBOUNCE_MS = 300;

export interface CartPricingPreview {
    // The backend's price for the Cart as it is now; null while pending or after a failure.
    pricing: CartPricing | null;
    error: string | null;
    retry: () => void;
}

// Only an answer for the current Cart and Coupon is returned: a total computed for an earlier
// Cart never shows. Repeated edits within the debounce window cost one request.
export function useCartPricing(items: CheckoutItem[], couponCode: string | null): CartPricingPreview {
    const key = JSON.stringify({ items, couponCode });
    const [attempt, setAttempt] = useState(0);
    const [settled, setSettled] = useState<{ key: string; pricing: CartPricing | null; error: string | null } | null>(null);

    useEffect(() => {
        if (items.length === 0) return;
        let cancelled = false;
        const timer = setTimeout(() => {
            previewCartPricing(items, couponCode).then(
                (pricing) => { if (!cancelled) setSettled({ key, pricing, error: null }); },
                (err: unknown) => { if (!cancelled) setSettled({ key, pricing: null, error: errorMessage(err, 'تعذر حساب الأسعار من الخادم.') }); },
            );
        }, PREVIEW_DEBOUNCE_MS);
        return () => { cancelled = true; clearTimeout(timer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- key stands in for items and couponCode; attempt re-runs a failed preview
    }, [key, attempt]);

    const current = settled?.key === key ? settled : null;
    return {
        pricing: current?.pricing ?? null,
        error: current?.error ?? null,
        retry: () => setAttempt((n) => n + 1),
    };
}

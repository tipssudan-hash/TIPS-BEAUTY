import { useCallback, useRef, useState } from 'react';

// Promise-style confirmation for handlers: `ask` resolves true or false once the user answers the dialog.
export interface ConfirmationRequest {
    title: string;
    body?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: 'default' | 'danger';
}

export function useConfirmation() {
    const [request, setRequest] = useState<ConfirmationRequest | null>(null);
    const resolver = useRef<((answer: boolean) => void) | null>(null);

    const settle = useCallback((answer: boolean) => {
        resolver.current?.(answer);
        resolver.current = null;
        setRequest(null);
    }, []);

    const ask = useCallback((next: ConfirmationRequest) => new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setRequest(next);
    }), []);

    const confirm = useCallback(() => settle(true), [settle]);
    const cancel = useCallback(() => settle(false), [settle]);

    return { request, ask, confirm, cancel };
}

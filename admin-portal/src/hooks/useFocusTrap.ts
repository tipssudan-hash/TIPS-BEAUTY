import { useEffect, useRef } from 'react';

// Full modal focus-trap: for an overlay that covers/blocks the rest of the page (WAI-ARIA APG
// "Dialog (Modal)" pattern) — not for a disclosure panel where page content stays reachable.
// Mirrors src/hooks/useFocusTrap.ts (storefront) in shape; each portal keeps its own copy since
// the two apps share no code today (see design-system audit).
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap<T extends HTMLElement>(isOpen: boolean, onClose: () => void) {
    const containerRef = useRef<T>(null);
    const previouslyFocused = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        previouslyFocused.current = document.activeElement as HTMLElement | null;
        const container = containerRef.current;
        const focusables = container ? Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : [];
        (focusables[0] ?? container)?.focus();

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
                return;
            }
            if (e.key !== 'Tab' || !container) return;
            const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
            if (items.length === 0) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            previouslyFocused.current?.focus();
        };
    }, [isOpen, onClose]);

    return containerRef;
}

import { useCallback, useState } from 'react';

export function useRowSelection() {
    const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

    const toggle = useCallback((id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const toggleAll = useCallback((visibleIds: string[], checked: boolean) => {
        setSelected((prev) => {
            const next = new Set(prev);
            for (const id of visibleIds) {
                if (checked) next.add(id);
                else next.delete(id);
            }
            return next;
        });
    }, []);

    const clear = useCallback(() => setSelected(new Set()), []);

    return { selected, selectedIds: Array.from(selected), toggle, toggleAll, clear };
}

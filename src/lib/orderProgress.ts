import type { OrderStatus, OrderStatusEntry } from '../types';

// The customer's view of an Order's lifecycle: five forward steps, plus two terminal side states
// (cancelled, delivery failed) that stop the line at the last step actually reached.

export const ORDER_STEPS: { status: OrderStatus; label: string; hint: string }[] = [
    { status: 'new', label: 'تم الاستلام', hint: 'وصلنا طلبك وسنؤكده قريباً' },
    { status: 'confirmed', label: 'مؤكد', hint: 'أكّدنا طلبك' },
    { status: 'preparing', label: 'قيد التجهيز', hint: 'نجهّز منتجاتك' },
    { status: 'shipped', label: 'في الطريق', hint: 'المندوب في طريقه إليك' },
    { status: 'delivered', label: 'تم التوصيل', hint: 'نتمنى أن تعجبك' },
];

const STEP_INDEX: Record<OrderStatus, number> = { new: 0, confirmed: 1, preparing: 2, shipped: 3, delivered: 4, cancelled: -1, delivery_failed: -1 };

export type OrderProgress = {
    // Index of the furthest forward step reached (0–4).
    reached: number;
    // Terminal side state, if the order left the forward line.
    terminal: 'cancelled' | 'delivery_failed' | null;
    // When the terminal state happened and the staff note, from history.
    terminalAt: string | null;
    terminalNote: string | null;
    // Timestamp each reached step was entered, from history (null when not recorded).
    reachedAt: (string | null)[];
};

export function orderProgress(status: OrderStatus, history: OrderStatusEntry[]): OrderProgress {
    const reachedAt: (string | null)[] = ORDER_STEPS.map(() => null);
    let reached = 0;
    for (const entry of history) {
        const index = STEP_INDEX[entry.status];
        if (index >= 0) {
            reachedAt[index] = reachedAt[index] ?? entry.createdAt;
            reached = Math.max(reached, index);
        }
    }
    const terminal = status === 'cancelled' || status === 'delivery_failed' ? status : null;
    if (!terminal) reached = Math.max(reached, STEP_INDEX[status]);
    else if (status === 'delivery_failed') reached = Math.max(reached, 3);
    const terminalEntry = terminal ? [...history].reverse().find((h) => h.status === terminal) ?? null : null;
    return { reached, terminal, terminalAt: terminalEntry?.createdAt ?? null, terminalNote: terminalEntry?.note ?? null, reachedAt };
}

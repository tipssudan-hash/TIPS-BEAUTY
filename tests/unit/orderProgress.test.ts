import { describe, expect, it } from 'vitest';
import { orderProgress } from '../../src/lib/orderProgress';
import type { OrderStatusEntry } from '../../src/types';

const entry = (status: OrderStatusEntry['status'], at: string, note: string | null = null): OrderStatusEntry => ({ id: `${status}-${at}`, status, note, createdAt: at });

describe('orderProgress', () => {
    it('follows the forward line and remembers when each step was entered', () => {
        const p = orderProgress('preparing', [entry('new', '2026-09-01T10:00:00Z'), entry('confirmed', '2026-09-01T11:00:00Z'), entry('preparing', '2026-09-01T12:00:00Z')]);
        expect(p.reached).toBe(2);
        expect(p.terminal).toBeNull();
        expect(p.reachedAt).toEqual(['2026-09-01T10:00:00Z', '2026-09-01T11:00:00Z', '2026-09-01T12:00:00Z', null, null]);
    });

    it('trusts the current status when history is thin (older orders, skipped preparing)', () => {
        expect(orderProgress('shipped', []).reached).toBe(3);
        expect(orderProgress('delivered', [entry('new', '2026-09-01T10:00:00Z')]).reached).toBe(4);
    });

    it('stops the line where a cancellation happened and carries the note', () => {
        const p = orderProgress('cancelled', [entry('new', '2026-09-01T10:00:00Z'), entry('confirmed', '2026-09-01T11:00:00Z'), entry('cancelled', '2026-09-01T12:00:00Z', 'تم الإلغاء بواسطة العميل')]);
        expect(p.reached).toBe(1);
        expect(p.terminal).toBe('cancelled');
        expect(p.terminalAt).toBe('2026-09-01T12:00:00Z');
        expect(p.terminalNote).toBe('تم الإلغاء بواسطة العميل');
    });

    it('marks a failed delivery at the "on the road" step even without a shipped history row', () => {
        const p = orderProgress('delivery_failed', [entry('delivery_failed', '2026-09-02T09:00:00Z', 'تعذر التسليم: العميل لا يرد')]);
        expect(p.reached).toBe(3);
        expect(p.terminal).toBe('delivery_failed');
        expect(p.terminalNote).toContain('لا يرد');
    });
});

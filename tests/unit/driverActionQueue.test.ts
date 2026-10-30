import { describe, expect, it, vi } from 'vitest';
import {
    classifyError,
    DriverActionQueue,
    MemoryQueueStore,
    type DraftAction,
    type QueuedAction,
} from '@infrastructure/offline/driverActionQueue';
import { translatedError } from '@application/errors';

function shipped(orderId: string): DraftAction {
    return { kind: 'status', orderId, status: 'shipped', failureReason: null, note: null, proof: null };
}

function pickup(orderId: string, lineNo: number, checkedQty: number): DraftAction {
    return { kind: 'pickup_check', orderId, lineNo, checkedQty };
}

function serverError(message: string, code = 'P0001'): Error {
    return Object.assign(new Error(message), { code });
}

const REASSIGNED = 'This status transition is not available for the assigned order';

function setup(execute: (action: QueuedAction) => Promise<void>, online = { value: true }) {
    const store = new MemoryQueueStore();
    let ids = 0;
    const queue = new DriverActionQueue({
        store,
        execute,
        isOnline: () => online.value,
        now: () => 1_000,
        newId: () => `action-${++ids}`,
    });
    return { store, queue, online };
}

describe('DriverActionQueue.submit', () => {
    it('sends immediately when online with nothing waiting, and stores nothing', async () => {
        const execute = vi.fn(async () => {});
        const { queue, store } = setup(execute);

        await expect(queue.submit(shipped('order-1'))).resolves.toBe('sent');

        expect(execute).toHaveBeenCalledTimes(1);
        expect(await store.read()).toEqual([]);
    });

    it('keeps the action on the device while offline without calling the server', async () => {
        const execute = vi.fn(async () => {});
        const { queue } = setup(execute, { value: false });

        await expect(queue.submit(pickup('order-1', 1, 2))).resolves.toBe('queued');

        expect(execute).not.toHaveBeenCalled();
        expect(await queue.list()).toEqual([
            { id: 'action-1', createdAt: 1_000, kind: 'pickup_check', orderId: 'order-1', lineNo: 1, checkedQty: 2 },
        ]);
    });

    it('queues an action whose request failed on the network', async () => {
        const execute = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
        const { queue } = setup(execute);

        await expect(queue.submit(shipped('order-1'))).resolves.toBe('queued');
        expect(await queue.list()).toHaveLength(1);
    });

    it('rejects, without queuing, an action the server refuses for good', async () => {
        const execute = vi.fn(async () => { throw serverError('Insufficient stock'); });
        const { queue } = setup(execute);

        await expect(queue.submit(shipped('order-1'))).rejects.toThrow('Insufficient stock');
        expect(await queue.list()).toEqual([]);
    });

    it('keeps order behind a waiting action instead of jumping the queue', async () => {
        const online = { value: false };
        const execute = vi.fn(async () => {});
        const { queue } = setup(execute, online);
        await queue.submit(pickup('order-1', 1, 1));
        online.value = true;

        await queue.submit(shipped('order-1'));

        expect(execute.mock.calls.map(([action]) => action.kind)).toEqual(['pickup_check', 'status']);
        expect(await queue.list()).toEqual([]);
    });

    it('replaces an earlier pickup check for the same line', async () => {
        const { queue } = setup(async () => {}, { value: false });

        await queue.submit(pickup('order-1', 1, 1));
        await queue.submit(pickup('order-1', 2, 3));
        await queue.submit(pickup('order-1', 1, 0));

        const waiting = await queue.list();
        expect(waiting.map((a) => (a.kind === 'pickup_check' ? [a.lineNo, a.checkedQty] : null))).toEqual([[2, 3], [1, 0]]);
    });
});

describe('DriverActionQueue.replay', () => {
    it('sends queued actions in order and empties the queue', async () => {
        const sent: string[] = [];
        const execute = vi.fn(async (action: QueuedAction) => { sent.push(action.kind); });
        const { queue, store, online } = setup(execute, { value: false });
        await queue.submit(pickup('order-1', 1, 1));
        await queue.submit(shipped('order-1'));
        online.value = true;

        const report = await queue.replay();

        expect(sent).toEqual(['pickup_check', 'status']);
        expect(report).toEqual({ sent: 2, dropped: [], remaining: [] });
        expect(await store.read()).toEqual([]);
    });

    it('stops at a network failure and keeps the rest in order for the next attempt', async () => {
        const attempts: string[] = [];
        let failNext = true;
        const execute = vi.fn(async (action: QueuedAction) => {
            attempts.push(action.id);
            if (action.id === 'action-1' && failNext) {
                failNext = false;
                throw new TypeError('Failed to fetch');
            }
        });
        const { queue, online } = setup(execute, { value: false });
        await queue.submit(pickup('order-1', 1, 1));
        await queue.submit(shipped('order-1'));
        online.value = true;

        const first = await queue.replay();
        expect(first.sent).toBe(0);
        expect(first.remaining.map((a) => a.id)).toEqual(['action-1', 'action-2']);

        const second = await queue.replay();
        expect(second.sent).toBe(2);
        expect(second.remaining).toEqual([]);
        expect(attempts).toEqual(['action-1', 'action-1', 'action-2']);
    });

    it('drops an action the server rejects because the order was reassigned, and continues', async () => {
        const execute = vi.fn(async (action: QueuedAction) => {
            if (action.kind === 'status') throw serverError(REASSIGNED);
        });
        const { queue, online } = setup(execute, { value: false });
        await queue.submit(shipped('order-1'));
        await queue.submit(pickup('order-2', 1, 1));
        online.value = true;

        const report = await queue.replay();

        expect(report.sent).toBe(1);
        expect(report.dropped).toHaveLength(1);
        expect(report.dropped[0]).toMatchObject({ reason: 'reassigned', action: { kind: 'status', orderId: 'order-1' } });
        expect(report.remaining).toEqual([]);
    });

    it('drops an action the database rejects for good, so it cannot block the queue', async () => {
        const execute = vi.fn(async (action: QueuedAction) => {
            if (action.kind === 'pickup_check' && action.orderId === 'order-1') throw serverError('Order is not in packing state');
        });
        const { queue, online } = setup(execute, { value: false });
        await queue.submit(pickup('order-1', 1, 1));
        await queue.submit(shipped('order-1'));
        online.value = true;

        const report = await queue.replay();

        expect(report.dropped.map((d) => d.reason)).toEqual(['rejected']);
        expect(report.sent).toBe(1);
        expect(report.remaining).toEqual([]);
    });

    it('keeps the queue when the server is unavailable', async () => {
        const execute = vi.fn(async () => { throw Object.assign(new Error('Service unavailable'), { statusCode: 503 }); });
        const { queue, online } = setup(execute, { value: false });
        await queue.submit(shipped('order-1'));
        online.value = true;

        const report = await queue.replay();

        expect(report.dropped).toEqual([]);
        expect(report.remaining).toHaveLength(1);
    });

    it('does nothing while offline', async () => {
        const execute = vi.fn(async () => {});
        const { queue } = setup(execute, { value: false });
        await queue.submit(shipped('order-1'));

        const report = await queue.replay();

        expect(execute).not.toHaveBeenCalled();
        expect(report.remaining).toHaveLength(1);
    });

    it('runs one drain at a time when called twice', async () => {
        let release: () => void = () => undefined;
        const execute = vi.fn(() => new Promise<void>((resolve) => { release = () => resolve(); }));
        const { queue, online } = setup(execute, { value: false });
        await queue.submit(shipped('order-1'));
        online.value = true;

        const first = queue.replay();
        const second = queue.replay();
        await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
        release();

        await expect(Promise.all([first, second])).resolves.toHaveLength(2);
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('reports a reassigned action to the submitting caller', async () => {
        const online = { value: false };
        const execute = vi.fn(async () => { throw serverError(REASSIGNED); });
        const { queue } = setup(execute, online);
        await queue.submit(shipped('order-1'));
        online.value = true;

        await expect(queue.replay()).resolves.toMatchObject({ dropped: [{ reason: 'reassigned' }] });
    });
});

describe('classifyError', () => {
    it('treats network failures as retryable, including translated ones', () => {
        expect(classifyError(new TypeError('Failed to fetch'))).toBe('retry');
        expect(classifyError(translatedError({ name: 'TypeError', message: 'Failed to fetch' }))).toBe('retry');
    });

    it('reads the database message through a translated error', () => {
        expect(classifyError(translatedError(serverError(REASSIGNED)))).toBe('reassigned');
    });

    it('rejects database errors that carry a code', () => {
        expect(classifyError(serverError('A delivery failure reason is required'))).toBe('rejected');
    });

    it('retries errors without a code or with a transient HTTP status', () => {
        expect(classifyError({ message: 'bad gateway', code: '' })).toBe('retry');
        expect(classifyError(Object.assign(new Error('Unauthorized'), { statusCode: 401 }))).toBe('retry');
        expect(classifyError(Object.assign(new Error('Too many requests'), { statusCode: 429 }))).toBe('retry');
    });

    it('rejects client HTTP errors such as a storage permission denial', () => {
        expect(classifyError(Object.assign(new Error('new row violates row-level security policy'), { statusCode: 403 }))).toBe('rejected');
    });
});

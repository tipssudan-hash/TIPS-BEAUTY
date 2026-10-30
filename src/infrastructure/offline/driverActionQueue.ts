// Offline queue for the driver's pickup checks and shipped / delivery_failed updates. Entries wait in
// IndexedDB (memory where IndexedDB is missing) and replay in order when the connection returns.
// Delivered is never queued: the customer's delivery code is verified by the server at the door.

export interface QueuedStatus {
    id: string;
    createdAt: number;
    kind: 'status';
    orderId: string;
    status: 'shipped' | 'delivery_failed';
    failureReason: string | null;
    note: string | null;
    proof: Blob | null;
}

export interface QueuedPickupCheck {
    id: string;
    createdAt: number;
    kind: 'pickup_check';
    orderId: string;
    lineNo: number;
    checkedQty: number;
}

export type QueuedAction = QueuedStatus | QueuedPickupCheck;
export type DraftAction = Omit<QueuedStatus, 'id' | 'createdAt'> | Omit<QueuedPickupCheck, 'id' | 'createdAt'>;

export type DropReason = 'reassigned' | 'rejected';
export type ErrorClass = 'retry' | DropReason;

export interface QueueStore {
    read(): Promise<QueuedAction[]>;
    write(actions: QueuedAction[]): Promise<void>;
}

export class MemoryQueueStore implements QueueStore {
    private actions: QueuedAction[] = [];

    async read(): Promise<QueuedAction[]> {
        return [...this.actions];
    }

    async write(actions: QueuedAction[]): Promise<void> {
        this.actions = [...actions];
    }
}

export class IndexedDbQueueStore implements QueueStore {
    constructor(private readonly dbName = 'tips-driver-queue', private readonly key = 'actions') {}

    private open(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onupgradeneeded = () => request.result.createObjectStore('kv');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    private async run<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
        const db = await this.open();
        try {
            return await new Promise<T>((resolve, reject) => {
                const transaction = db.transaction('kv', mode);
                const request = operation(transaction.objectStore('kv'));
                transaction.oncomplete = () => resolve(request.result);
                transaction.onerror = () => reject(transaction.error);
                transaction.onabort = () => reject(transaction.error);
            });
        } finally {
            db.close();
        }
    }

    async read(): Promise<QueuedAction[]> {
        const value: unknown = await this.run('readonly', (store) => store.get(this.key));
        return Array.isArray(value) ? (value as QueuedAction[]) : [];
    }

    async write(actions: QueuedAction[]): Promise<void> {
        await this.run('readwrite', (store) => store.put(actions, this.key));
    }
}

const NETWORK_ERROR = /failed to fetch|network|load failed/i;
const REASSIGNED_ERROR = /not available for the assigned order|assigned to another driver|not assigned to this driver|Driver profile is not linked/i;

function fieldOf(value: unknown, key: string): unknown {
    return typeof value === 'object' && value !== null && key in value ? (value as Record<string, unknown>)[key] : undefined;
}

function rootCause(error: unknown): unknown {
    let current = error;
    for (let depth = 0; depth < 5; depth++) {
        const cause = fieldOf(current, 'cause');
        if (cause === undefined) break;
        current = cause;
    }
    return current;
}

// Retry: the network is down or the server is unavailable, so the action must wait.
// Reassigned: the order is no longer this driver's or no longer in a state it can move from; drop it.
// Rejected: the database refused the action for good (it carries an error code); drop it so it cannot block the queue.
export function classifyError(error: unknown): ErrorClass {
    const root = rootCause(error);
    const message = String(fieldOf(root, 'message') ?? '');
    if (fieldOf(root, 'name') === 'TypeError' || NETWORK_ERROR.test(message)) return 'retry';
    if (REASSIGNED_ERROR.test(message)) return 'reassigned';
    const status = fieldOf(root, 'statusCode') ?? fieldOf(root, 'status');
    if (typeof status === 'number') {
        const transient = status === 401 || status === 408 || status === 429 || status >= 500 || status === 0;
        return transient || status < 400 ? 'retry' : 'rejected';
    }
    return fieldOf(root, 'code') ? 'rejected' : 'retry';
}

export interface DroppedAction {
    action: QueuedAction;
    reason: DropReason;
    error: unknown;
}

export interface ReplayReport {
    sent: number;
    dropped: DroppedAction[];
    remaining: QueuedAction[];
}

export interface DriverActionQueueOptions {
    store: QueueStore;
    execute: (action: QueuedAction) => Promise<void>;
    isOnline?: () => boolean;
    now?: () => number;
    newId?: () => string;
}

export class DriverActionQueue {
    private lock: Promise<unknown> = Promise.resolve();
    private draining: Promise<ReplayReport> | null = null;

    constructor(private readonly options: DriverActionQueueOptions) {}

    list(): Promise<QueuedAction[]> {
        return this.locked(() => this.options.store.read());
    }

    // Sends right away when online and nothing is waiting; otherwise keeps the order and replays the queue.
    // Resolves 'sent' or 'queued'; rejects with the server's error when the action was refused for good.
    async submit(draft: DraftAction): Promise<'sent' | 'queued'> {
        const action = this.create(draft);
        if (this.isOnline() && (await this.list()).length === 0) {
            try {
                await this.options.execute(action);
                return 'sent';
            } catch (error) {
                if (classifyError(error) !== 'retry') throw error;
            }
        }
        await this.append(action);
        const report = await this.replay();
        const dropped = report.dropped.find((entry) => entry.action.id === action.id);
        if (dropped) throw dropped.error;
        return report.remaining.some((entry) => entry.id === action.id) ? 'queued' : 'sent';
    }

    replay(): Promise<ReplayReport> {
        if (!this.draining) {
            this.draining = this.drain().finally(() => { this.draining = null; });
        }
        return this.draining;
    }

    private async drain(): Promise<ReplayReport> {
        const dropped: DroppedAction[] = [];
        let sent = 0;
        if (!this.isOnline()) return { sent, dropped, remaining: await this.list() };

        for (;;) {
            const [head] = await this.list();
            if (!head) break;

            let failure: { verdict: ErrorClass; error: unknown } | null = null;
            try {
                await this.options.execute(head);
            } catch (error) {
                failure = { verdict: classifyError(error), error };
            }

            if (failure?.verdict === 'retry') break;
            await this.remove(head.id);
            if (failure?.verdict === 'reassigned' || failure?.verdict === 'rejected') {
                dropped.push({ action: head, reason: failure.verdict, error: failure.error });
            } else {
                sent += 1;
            }
        }

        return { sent, dropped, remaining: await this.list() };
    }

    private create(draft: DraftAction): QueuedAction {
        return {
            ...draft,
            id: this.options.newId ? this.options.newId() : crypto.randomUUID(),
            createdAt: this.options.now ? this.options.now() : Date.now(),
        };
    }

    private append(action: QueuedAction): Promise<void> {
        return this.locked(async () => {
            const current = await this.options.store.read();
            // A newer pickup check for the same line replaces the older one: only the latest state matters.
            const kept = action.kind === 'pickup_check'
                ? current.filter((entry) => !(entry.kind === 'pickup_check' && entry.orderId === action.orderId && entry.lineNo === action.lineNo))
                : current;
            await this.options.store.write([...kept, action]);
        });
    }

    private remove(id: string): Promise<void> {
        return this.locked(async () => {
            const current = await this.options.store.read();
            await this.options.store.write(current.filter((entry) => entry.id !== id));
        });
    }

    private isOnline(): boolean {
        return this.options.isOnline ? this.options.isOnline() : true;
    }

    private locked<T>(task: () => Promise<T>): Promise<T> {
        const run = this.lock.then(task);
        this.lock = run.catch(() => undefined);
        return run;
    }
}

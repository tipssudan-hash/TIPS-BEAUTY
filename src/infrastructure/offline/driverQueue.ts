import { driverSetPickupCheck, updateMyDeliveryStatus, uploadDeliveryProof } from '../repositories/driverRepository';
import { DriverActionQueue, IndexedDbQueueStore, MemoryQueueStore, type QueueStore, type QueuedAction } from './driverActionQueue';

async function execute(action: QueuedAction): Promise<void> {
    if (action.kind === 'pickup_check') {
        await driverSetPickupCheck(action.orderId, action.lineNo, action.checkedQty);
        return;
    }
    const proofPath = action.proof ? await uploadDeliveryProof(action.orderId, action.proof) : undefined;
    await updateMyDeliveryStatus(action.orderId, action.status, action.failureReason ?? undefined, action.note ?? undefined, undefined, proofPath);
}

function createStore(): QueueStore {
    return typeof indexedDB === 'undefined' ? new MemoryQueueStore() : new IndexedDbQueueStore();
}

export const driverActionQueue = new DriverActionQueue({
    store: createStore(),
    execute,
    isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
});

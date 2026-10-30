// Keeps the primary warehouse valid after the manager's warehouse set changes.
export function resolvePrimaryWarehouse(warehouseIds: string[], primaryId: string | null): string | null {
    if (warehouseIds.length === 0) return null;
    return primaryId && warehouseIds.includes(primaryId) ? primaryId : warehouseIds[0];
}

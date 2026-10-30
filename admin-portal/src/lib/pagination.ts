export const PAGE_SIZE = 25;

export const EXPORT_PAGE_SIZE = 500;

export function pageCount(total: number, pageSize = PAGE_SIZE): number {
    return Math.max(1, Math.ceil(total / pageSize));
}

export function pageOffset(page: number, pageSize = PAGE_SIZE): number {
    return page * pageSize;
}

export async function fetchAllPages<T>(fetchPage: (offset: number, limit: number) => Promise<{ rows: T[]; total: number }>, limit = EXPORT_PAGE_SIZE): Promise<T[]> {
    const all: T[] = [];
    for (let offset = 0; ; offset += limit) {
        const { rows, total } = await fetchPage(offset, limit);
        all.push(...rows);
        if (rows.length === 0 || all.length >= total) break;
    }
    return all;
}

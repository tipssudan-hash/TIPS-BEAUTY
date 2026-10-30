import { supabase } from './supabase';
import type { Json } from './database.types';

export const AUDIT_TABLES = [
    'coupons',
    'promotions',
    'affiliate_profiles',
    'storefront_banners',
    'app_settings',
    'drivers',
    'warehouses',
    'delivery_zones',
    'categories',
    'brands',
    'warehouse_manager_access',
    'suppliers',
] as const;

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';

export interface AuditLogEntry {
    id: number;
    table_name: string;
    row_id: string;
    action: AuditAction;
    old_data: Json | null;
    new_data: Json | null;
    changed_columns: string[] | null;
    changed_by: string | null;
    changed_by_name: string | null;
    changed_at: string;
}

export interface AuditLogFilters {
    table?: string | null;
    rowId?: string | null;
    userId?: string | null;
    from?: string | null;
    to?: string | null;
    page: number;
    pageSize: number;
}

export async function fetchAuditLog(filters: AuditLogFilters): Promise<{ rows: AuditLogEntry[]; total: number }> {
    const { data, error } = await supabase.rpc('admin_get_audit_log', {
        p_table: filters.table ?? null,
        p_row_id: filters.rowId ?? null,
        p_user: filters.userId ?? null,
        p_from: filters.from ?? null,
        p_to: filters.to ?? null,
        p_limit: filters.pageSize,
        p_offset: filters.page * filters.pageSize,
    });
    if (error) throw error;
    const rows = data ?? [];
    return {
        rows: rows.map((row) => ({ ...row, action: row.action as AuditAction })),
        total: Number(rows[0]?.total_count ?? 0),
    };
}

export interface AuditUserOption {
    id: string;
    email: string | null;
}

export async function searchAuditUsers(query: string): Promise<AuditUserOption[]> {
    let request = supabase
        .from('profiles')
        .select('id, email')
        .in('role', ['admin', 'warehouse_supervisor', 'driver'])
        .order('created_at', { ascending: false })
        .limit(20);
    const term = query.trim().replace(/[%,()]/g, ' ');
    if (term) request = request.ilike('email', `%${term}%`);
    const { data, error } = await request;
    if (error) throw error;
    return data ?? [];
}

export interface AuditDiffLine {
    column: string;
    before: unknown;
    after: unknown;
}

export function auditDiff(entry: Pick<AuditLogEntry, 'old_data' | 'new_data' | 'changed_columns'>): AuditDiffLine[] {
    const before = (entry.old_data ?? {}) as Record<string, unknown>;
    const after = (entry.new_data ?? {}) as Record<string, unknown>;
    const columns = entry.changed_columns ?? Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
    return columns.map((column) => ({ column, before: before[column], after: after[column] }));
}

export function auditValueText(value: unknown): string {
    if (value === undefined) return '—';
    if (value === null) return 'null';
    return typeof value === 'string' ? value : JSON.stringify(value);
}

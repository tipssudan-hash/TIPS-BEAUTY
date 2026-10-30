import React, { useEffect, useState } from 'react';
import { Card, Notice, Spinner } from './ui';
import { auditDiff, auditValueText, fetchAuditLog, type AuditLogEntry } from '../lib/auditApi';
import { errorMessage } from '../lib/errors';
import { formatDateTime } from '../lib/format';
import { Pagination } from './Pagination';

const ACTION_LABELS: Record<string, string> = { INSERT: 'إنشاء', UPDATE: 'تعديل', DELETE: 'حذف' };
const HISTORY_PAGE_SIZE = 10;

export const AuditDiff: React.FC<{ entry: AuditLogEntry }> = ({ entry }) => {
    const lines = auditDiff(entry);
    if (lines.length === 0) return <p className="text-xs font-bold text-slate-400">لا تغييرات في الأعمدة.</p>;
    return (
        <dl className="grid gap-1 text-xs">
            {lines.map((line) => (
                <div key={line.column} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2 break-all">
                    <dt className="font-black text-slate-500">{line.column}</dt>
                    <dd className="font-bold text-slate-700">
                        <span className="text-rose-600 line-through">{auditValueText(line.before)}</span>
                        <span className="mx-1 text-slate-400">←</span>
                        <span className="text-emerald-700">{auditValueText(line.after)}</span>
                    </dd>
                </div>
            ))}
        </dl>
    );
};

export const AuditHistory: React.FC<{ table: string; rowId: string }> = ({ table, rowId }) => {
    const [page, setPage] = useState(0);
    const [rows, setRows] = useState<AuditLogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetchAuditLog({ table, rowId, page, pageSize: HISTORY_PAGE_SIZE })
            .then((result) => {
                if (cancelled) return;
                setRows(result.rows);
                setTotal(result.total);
                setError(null);
            })
            .catch((err) => {
                if (!cancelled) setError(errorMessage(err, 'تعذّر تحميل السجل.'));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [table, rowId, page]);

    if (loading && rows.length === 0) return <Spinner />;
    if (error) return <Notice kind="error">{error}</Notice>;
    if (rows.length === 0) return <p className="py-6 text-center text-sm font-bold text-slate-400">لا يوجد سجل لهذا العنصر بعد.</p>;

    return (
        <Card>
            <ul className="divide-y divide-slate-100">
                {rows.map((entry) => (
                    <li key={entry.id} className="space-y-2 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500">
                            <span className="text-slate-800">{ACTION_LABELS[entry.action] ?? entry.action} · {entry.changed_by_name ?? 'نظام'}</span>
                            <span>{formatDateTime(entry.changed_at)}</span>
                        </div>
                        {entry.action === 'UPDATE' ? <AuditDiff entry={entry} /> : null}
                    </li>
                ))}
            </ul>
            <Pagination page={page} pageSize={HISTORY_PAGE_SIZE} total={total} onPageChange={setPage} loading={loading} />
        </Card>
    );
};

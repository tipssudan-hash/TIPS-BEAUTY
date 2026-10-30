import React, { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { AUDIT_TABLES, auditValueText, fetchAuditLog, searchAuditUsers, type AuditLogEntry, type AuditUserOption } from '../lib/auditApi';
import { errorMessage } from '../lib/errors';
import { formatDateTime } from '../lib/format';
import { PAGE_SIZE } from '../lib/pagination';
import { Card, Notice, PageHeader, Spinner, Table, inputClass, smallButtonClass } from '../components/ui';
import { AuditDiff } from '../components/AuditHistory';
import { Pagination } from '../components/Pagination';

const TABLE_LABELS: Record<string, string> = {
    coupons: 'أكواد الخصم',
    promotions: 'العروض',
    affiliate_profiles: 'المسوقون',
    storefront_banners: 'البانرات',
    app_settings: 'الإعدادات',
    drivers: 'المندوبون',
    warehouses: 'المخازن',
    delivery_zones: 'محليات التوصيل',
    categories: 'التصنيفات',
    brands: 'العلامات التجارية',
    warehouse_manager_access: 'صلاحيات مدير المستودع',
    suppliers: 'الموردون',
};

const ACTION_LABELS: Record<string, string> = { INSERT: 'إنشاء', UPDATE: 'تعديل', DELETE: 'حذف' };

function startOfDay(date: string): string {
    return new Date(`${date}T00:00:00`).toISOString();
}

function endOfDay(date: string): string {
    return new Date(`${date}T23:59:59.999`).toISOString();
}

export const AuditLogPage: React.FC = () => {
    const [table, setTable] = useState('');
    const [user, setUser] = useState<AuditUserOption | null>(null);
    const [userQuery, setUserQuery] = useState('');
    const [userResults, setUserResults] = useState<AuditUserOption[]>([]);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [page, setPage] = useState(0);
    const [rows, setRows] = useState<AuditLogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetchAuditLog({
            table: table || null,
            userId: user?.id ?? null,
            from: from ? startOfDay(from) : null,
            to: to ? endOfDay(to) : null,
            page,
            pageSize: PAGE_SIZE,
        })
            .then((result) => {
                if (cancelled) return;
                setRows(result.rows);
                setTotal(result.total);
                setError(null);
            })
            .catch((err) => {
                if (!cancelled) setError(errorMessage(err, 'تعذر تحميل سجل التدقيق.'));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [table, user, from, to, page]);

    const resetPage = () => setPage(0);

    const searchUsers = async () => {
        try {
            setUserResults(await searchAuditUsers(userQuery));
        } catch (err) {
            setError(errorMessage(err));
        }
    };

    return (
        <div className="space-y-8">
            <PageHeader title="سجل التدقيق" subtitle="كل تعديل على الكوبونات والعروض والمسوقين والمخازن وصلاحياتها، مع من قام به ومتى." icon={<ScrollText className="w-8 h-8 text-brand-blue" />} />

            {error && <Notice kind="error">{error}</Notice>}

            <Card className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                <label className="space-y-2 text-sm font-bold text-slate-600">
                    الجدول
                    <select className={inputClass} value={table} onChange={(e) => { setTable(e.target.value); resetPage(); }}>
                        <option value="">كل الجداول</option>
                        {AUDIT_TABLES.map((name) => <option key={name} value={name}>{TABLE_LABELS[name] ?? name}</option>)}
                    </select>
                </label>
                <div className="space-y-2 text-sm font-bold text-slate-600">
                    المستخدم
                    <div className="flex gap-2">
                        <input className={inputClass} placeholder="البريد الإلكتروني" value={userQuery} onChange={(e) => setUserQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void searchUsers(); }} />
                        <button type="button" className={`${smallButtonClass} bg-slate-900 text-white`} onClick={() => void searchUsers()}>بحث</button>
                    </div>
                    {user && (
                        <button type="button" className={`${smallButtonClass} bg-blue-50 text-brand-blue`} onClick={() => { setUser(null); resetPage(); }}>
                            {user.email || user.id} ✕
                        </button>
                    )}
                    {userResults.length > 0 && !user && (
                        <ul className="max-h-40 overflow-auto rounded-xl border border-slate-200 bg-white">
                            {userResults.map((option) => (
                                <li key={option.id}>
                                    <button type="button" className="w-full px-3 py-2 text-right text-xs font-bold hover:bg-slate-50" onClick={() => { setUser(option); setUserResults([]); resetPage(); }}>
                                        {option.email || option.id}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <label className="space-y-2 text-sm font-bold text-slate-600">
                    من تاريخ
                    <input type="date" className={inputClass} value={from} onChange={(e) => { setFrom(e.target.value); resetPage(); }} />
                </label>
                <label className="space-y-2 text-sm font-bold text-slate-600">
                    إلى تاريخ
                    <input type="date" className={inputClass} value={to} onChange={(e) => { setTo(e.target.value); resetPage(); }} />
                </label>
            </Card>

            <Card className="overflow-hidden">
                {loading && rows.length === 0 ? <Spinner /> : (
                    <Table headers={['الوقت', 'الجدول', 'المعرّف', 'الإجراء', 'بواسطة', 'التغييرات']} empty={rows.length === 0 && !loading} emptyText="لا توجد سجلات مطابقة.">
                        {rows.map((entry) => (
                            <tr key={entry.id} className="align-top hover:bg-slate-50/50">
                                <td className="px-6 py-4 text-xs font-bold text-slate-500" dir="ltr">{formatDateTime(entry.changed_at)}</td>
                                <td className="px-6 py-4 text-sm font-black text-slate-800">{TABLE_LABELS[entry.table_name] ?? entry.table_name}</td>
                                <td className="px-6 py-4 text-xs font-bold text-slate-500 break-all" dir="ltr">{entry.row_id}</td>
                                <td className="px-6 py-4 text-sm font-bold text-slate-700">{ACTION_LABELS[entry.action] ?? entry.action}</td>
                                <td className="px-6 py-4 text-sm font-bold text-slate-700">{entry.changed_by_name ?? 'نظام'}</td>
                                <td className="px-6 py-4 max-w-xl">
                                    {entry.action === 'UPDATE'
                                        ? <AuditDiff entry={entry} />
                                        : <span className="text-xs font-bold text-slate-500">{auditValueText(entry.action === 'INSERT' ? entry.new_data : entry.old_data).slice(0, 200)}</span>}
                                </td>
                            </tr>
                        ))}
                    </Table>
                )}
                <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} loading={loading} />
            </Card>
        </div>
    );
};

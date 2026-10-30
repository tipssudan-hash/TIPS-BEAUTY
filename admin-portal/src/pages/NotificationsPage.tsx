import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, RefreshCw } from 'lucide-react';
import { fetchStaffNotifications, markStaffNotificationsRead } from '../lib/adminApi';
import { STAFF_NOTIFICATION_KIND_LABELS, formatDateTime } from '../lib/format';
import { errorMessage } from '../lib/errors';
import { STAFF_NOTIFICATIONS_CHANGED } from '../hooks/useUnreadStaffNotifications';
import { Card, EmptyState, Notice, PageHeader, Spinner } from '../components/ui';
import type { StaffNotification, StaffNotificationKind } from '../types';

export const NotificationsPage: React.FC = () => {
    const [rows, setRows] = useState<StaffNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const unreadIds = rows.filter((row) => row.read_at === null).map((row) => row.id);

    const load = useCallback(async () => {
        setError(null);
        try {
            setRows(await fetchStaffNotifications());
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل التنبيهات.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const markRead = async (ids: string[]) => {
        if (ids.length === 0 || busy) return;
        setBusy(true);
        setError(null);
        try {
            await markStaffNotificationsRead(ids);
            const readAt = new Date().toISOString();
            setRows((prev) => prev.map((row) => (ids.includes(row.id) && row.read_at === null ? { ...row, read_at: readAt } : row)));
            window.dispatchEvent(new Event(STAFF_NOTIFICATIONS_CHANGED));
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    if (loading) return <Spinner />;

    return (
        <div className="space-y-8 max-w-4xl animate-in fade-in duration-500">
            <PageHeader
                title="التنبيهات"
                subtitle="نقص المخزون، وتعذر التسليم، والتسويات النقدية المرسلة."
                icon={<Bell className="w-8 h-8 text-brand-blue" />}
                actions={(
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void markRead(unreadIds)}
                            disabled={busy || unreadIds.length === 0}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-black hover:bg-slate-800 disabled:opacity-50"
                        >
                            <CheckCheck className="w-4 h-4" /> تعليم الكل كمقروء
                        </button>
                        <button
                            type="button"
                            onClick={() => void load()}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50"
                        >
                            <RefreshCw className="w-4 h-4" /> تحديث
                        </button>
                    </div>
                )}
            />

            {error && <Notice kind="error">{error}</Notice>}

            {rows.length === 0 ? (
                <EmptyState icon={<Bell className="w-6 h-6" />} title="لا توجد تنبيهات" body="ستظهر هنا التنبيهات الموجهة إليك عند حدوثها." />
            ) : (
                <ul className="space-y-3">
                    {rows.map((row) => {
                        const unread = row.read_at === null;
                        return (
                            <li key={row.id}>
                                <Card className={`p-5 flex flex-col md:flex-row md:items-start justify-between gap-4 ${unread ? 'border-blue-200 bg-blue-50/40' : ''}`}>
                                    <div className="space-y-1.5 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-black">
                                                {STAFF_NOTIFICATION_KIND_LABELS[row.kind as StaffNotificationKind] ?? row.kind}
                                            </span>
                                            {unread && <span className="px-2.5 py-1 rounded-lg bg-brand-blue text-white text-[10px] font-black">جديد</span>}
                                            <span className="text-[10px] font-bold text-slate-400">{formatDateTime(row.created_at)}</span>
                                        </div>
                                        <p className="font-black text-slate-900">{row.title}</p>
                                        {row.body && <p className="text-sm text-slate-600 font-medium">{row.body}</p>}
                                        {row.ref_type === 'order' && row.ref_id && (
                                            <Link to={`/orders/${row.ref_id}`} className="inline-block text-xs font-bold text-brand-blue hover:underline">فتح الطلب</Link>
                                        )}
                                    </div>
                                    {unread && (
                                        <button
                                            type="button"
                                            onClick={() => void markRead([row.id])}
                                            disabled={busy}
                                            className="shrink-0 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                        >
                                            تعليم كمقروء
                                        </button>
                                    )}
                                </Card>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

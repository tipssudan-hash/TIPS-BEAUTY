import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Radio, Mail, MessageCircle, KeyRound, BellRing, RefreshCw } from 'lucide-react';
import type { DeliveryChannelStats, DeliveryFailure, DeliverySummary } from '../types';
import { fetchDeliveryFailures, fetchDeliverySummary } from '../lib/adminApi';
import { errorMessage } from '../lib/errors';
import { formatDate } from '../lib/format';
import { Card, Notice, PageHeader, PageState, StatusPill, Table, smallButtonClass } from '../components/ui';

// "The customer says she never got the message" — previously unanswerable, because three pipelines fail
// in three different tables: order notifications (email + WhatsApp), login codes, and push. This is the
// one screen that answers it.

const WINDOWS = [24, 48, 168] as const;
const windowLabel = (hours: number) => (hours === 24 ? 'آخر ٢٤ ساعة' : hours === 48 ? 'آخر ٤٨ ساعة' : 'آخر ٧ أيام');

const sourceLabels: Record<string, string> = {
    notification_queue: 'إشعارات الطلبات',
    otp_delivery_log: 'رموز الدخول',
    push_notification_deliveries: 'إشعارات التطبيق',
};

const channelLabels: Record<string, string> = {
    email: 'بريد إلكتروني',
    whatsapp: 'واتساب',
    sms: 'رسالة نصية',
    fcm: 'FCM',
    expo: 'Expo',
};

const statusTone = (status: string) => {
    // 'blocked' is the rate limiter doing its job, not an outage — it must not read as a failure.
    if (status === 'blocked') return 'attention' as const;
    if (status === 'cancelled') return 'neutral' as const;
    return 'danger' as const;
};

const statusLabels: Record<string, string> = {
    failed: 'فشل',
    blocked: 'محجوب',
    cancelled: 'ملغي',
};

const ChannelCard: React.FC<{ title: string; icon: React.ReactNode; stats: DeliveryChannelStats }> = ({ title, icon, stats }) => (
    <Card className="p-5">
        <div className="flex items-center gap-2 text-slate-500 mb-3">
            {icon}
            <span className="font-bold text-sm">{title}</span>
        </div>
        <div className="flex items-end gap-4">
            <div>
                <p className="text-2xl font-black text-slate-900">{stats.sent}</p>
                <p className="text-xs text-slate-400 font-bold">تم الإرسال</p>
            </div>
            {stats.pending != null && (
                <div>
                    <p className="text-2xl font-black text-slate-400">{stats.pending}</p>
                    <p className="text-xs text-slate-400 font-bold">في الانتظار</p>
                </div>
            )}
            {stats.blocked != null && (
                <div>
                    <p className="text-2xl font-black text-amber-500">{stats.blocked}</p>
                    <p className="text-xs text-slate-400 font-bold">محجوب</p>
                </div>
            )}
            <div>
                <p className={`text-2xl font-black ${stats.failed > 0 ? 'text-red-600' : 'text-slate-300'}`}>{stats.failed}</p>
                <p className="text-xs text-slate-400 font-bold">فشل</p>
            </div>
        </div>
    </Card>
);

export const DeliveryHealthPage: React.FC = () => {
    const [hours, setHours] = useState<number>(48);
    const [summary, setSummary] = useState<DeliverySummary | null>(null);
    const [failures, setFailures] = useState<DeliveryFailure[]>([]);
    const [source, setSource] = useState<'all' | string>('all');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        setError(null);
        Promise.all([fetchDeliverySummary(hours), fetchDeliveryFailures(hours)])
            .then(([nextSummary, nextFailures]) => {
                setSummary(nextSummary);
                setFailures(nextFailures);
            })
            .catch((err) => setError(errorMessage(err, 'تعذر تحميل حالة الإشعارات.')))
            .finally(() => setLoading(false));
    }, [hours]);

    useEffect(load, [load]);

    const visible = useMemo(
        () => failures.filter((row) => source === 'all' || row.source === source),
        [failures, source],
    );

    return (
        <div className="space-y-6">
            <PageHeader
                title="حالة الإشعارات"
                subtitle="متابعة إرسال رسائل الطلبات ورموز الدخول وإشعارات التطبيق"
                icon={<Radio className="w-6 h-6" />}
                actions={
                    <button type="button" onClick={load} disabled={loading} className={smallButtonClass + ' bg-white border border-slate-200 text-slate-600'}>
                        <RefreshCw className={`w-4 h-4 inline ${loading ? 'animate-spin' : ''}`} />
                        <span className="ms-1">تحديث</span>
                    </button>
                }
            />

            <div className="flex flex-wrap gap-2">
                {WINDOWS.map((value) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => setHours(value)}
                        className={`${smallButtonClass} ${hours === value ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
                    >
                        {windowLabel(value)}
                    </button>
                ))}
            </div>

            {error && <Notice kind="error">{error}</Notice>}

            {summary && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <ChannelCard title="بريد الطلبات" icon={<Mail className="w-4 h-4" />} stats={summary.email} />
                    <ChannelCard title="واتساب الطلبات" icon={<MessageCircle className="w-4 h-4" />} stats={summary.whatsapp} />
                    <ChannelCard title="رموز الدخول" icon={<KeyRound className="w-4 h-4" />} stats={summary.otp} />
                    <ChannelCard title="إشعارات التطبيق" icon={<BellRing className="w-4 h-4" />} stats={summary.push} />
                </div>
            )}

            <div className="flex flex-wrap gap-2">
                {(['all', 'notification_queue', 'otp_delivery_log', 'push_notification_deliveries'] as const).map((value) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => setSource(value)}
                        className={`${smallButtonClass} ${source === value ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
                    >
                        {value === 'all' ? 'الكل' : sourceLabels[value]}
                    </button>
                ))}
            </div>

            <PageState
                loading={loading && !summary}
                error={null}
                empty={!loading && visible.length === 0}
                emptyState={
                    <Card className="p-8 text-center">
                        <p className="font-bold text-slate-800">لا توجد رسائل فاشلة في هذه الفترة</p>
                        <p className="text-sm text-slate-400 mt-1">كل الرسائل خرجت بنجاح.</p>
                    </Card>
                }
            >
                <Table headers={['التاريخ', 'النوع', 'القناة', 'الحالة', 'المستلم', 'الطلب', 'السبب']}>
                    {visible.map((row, index) => (
                        <tr key={`${row.source}-${row.created_at}-${index}`} className="border-b border-slate-50 last:border-0">
                            <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{formatDate(row.created_at)}</td>
                            <td className="p-3 text-xs font-bold text-slate-700">{sourceLabels[row.source] ?? row.source}</td>
                            <td className="p-3 text-xs text-slate-600">{channelLabels[row.channel] ?? row.channel}</td>
                            <td className="p-3">
                                <StatusPill tone={statusTone(row.status)}>{statusLabels[row.status] ?? row.status}</StatusPill>
                            </td>
                            {/* Phone numbers and email addresses, shown to staff answering a support call. */}
                            <td className="p-3 text-xs text-slate-600" dir="ltr">{row.recipient ?? '—'}</td>
                            <td className="p-3 text-xs text-slate-600">{row.order_number ?? '—'}</td>
                            <td className="p-3 text-xs text-slate-500 max-w-xs truncate" title={row.error_message ?? ''}>
                                {row.error_message ?? '—'}
                                {row.attempts != null && <span className="text-slate-300"> ({row.attempts})</span>}
                            </td>
                        </tr>
                    ))}
                </Table>
            </PageState>
        </div>
    );
};

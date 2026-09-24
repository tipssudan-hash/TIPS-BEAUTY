import React from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellOff, CheckCheck, Package, Truck, CreditCard, Star, PackageCheck, Percent, Info } from 'lucide-react';
import { useNotifications } from '../../context/NotificationsContext';
import { notificationCategory, notificationLink, type NotificationCategory } from '@application/services/notifications';
import { formatRelative } from '@application/services/format';
import { EmptyState, PageState, secondaryButtonClass } from '../../components/ui';
import type { CustomerNotification } from '@domain/entities';

const CATEGORY_ICON: Record<NotificationCategory, React.FC<{ className?: string }>> = {
    order: Package, payment: CreditCard, delivery: Truck, review: Star, restock: PackageCheck, promo: Percent, general: Info,
};

const NotificationRow: React.FC<{ n: CustomerNotification; onOpen: (n: CustomerNotification) => void }> = ({ n, onOpen }) => {
    const Icon = CATEGORY_ICON[notificationCategory(n.type)];
    const link = notificationLink(n);
    const body = (
        <>
            <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${n.isRead ? 'bg-gray-100 text-gray-400' : 'bg-brand-blue-soft text-brand-blue'}`}>
                <Icon className="w-5 h-5" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-3">
                    <span className={`text-sm ${n.isRead ? 'font-semibold text-gray-700' : 'font-bold text-gray-900'}`}>{n.title}</span>
                    <time dateTime={n.createdAt} className="shrink-0 text-[10px] text-gray-400">{formatRelative(n.createdAt)}</time>
                </span>
                <span className="mt-0.5 block text-sm text-gray-600">{n.body}</span>
            </span>
            {!n.isRead && <span aria-label="جديد" className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-blue" />}
        </>
    );
    const classes = `flex w-full items-start gap-3 rounded-card border p-4 text-right transition-colors ${n.isRead ? 'border-gray-100 bg-white' : 'border-brand-blue-soft bg-white shadow-sm'} ${link ? 'hover:border-brand-blue/40' : ''}`;
    return link
        ? <Link to={link} onClick={() => onOpen(n)} className={classes}>{body}</Link>
        : <button type="button" onClick={() => onOpen(n)} className={classes}>{body}</button>;
};

export const NotificationsPage: React.FC = () => {
    const { items, unread, loading, error, refresh, markRead, markAllRead } = useNotifications();

    const open = (n: CustomerNotification) => { if (!n.isRead) void markRead(n.id); };

    return (
        <div className="max-w-2xl mx-auto p-4 md:p-8">
            <div className="mb-6 flex items-center justify-between gap-3">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Bell className="w-6 h-6 text-brand-blue" /> الإشعارات</h1>
                {unread > 0 && (
                    <button type="button" onClick={() => void markAllRead()} className={`${secondaryButtonClass} flex items-center gap-1.5 text-sm`}>
                        <CheckCheck className="w-4 h-4" /> تعليم الكل كمقروء
                    </button>
                )}
            </div>
            <PageState
                loading={loading && items.length === 0}
                error={error}
                onRetry={() => void refresh()}
                empty={items.length === 0}
                emptyState={<EmptyState icon={<BellOff className="w-7 h-7" />} title="لا توجد إشعارات بعد" body="سنخبرك هنا بكل جديد عن طلباتك والعروض." action={<Link to="/" className="text-brand-blue font-bold text-sm hover:underline">تسوقي الآن</Link>} />}
            >
                <ul className="space-y-3">
                    {items.map((n) => <li key={n.id}><NotificationRow n={n} onOpen={open} /></li>)}
                </ul>
            </PageState>
        </div>
    );
};

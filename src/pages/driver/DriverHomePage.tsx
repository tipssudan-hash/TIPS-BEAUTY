import React from 'react';
import { Link } from 'react-router-dom';
import { PackageCheck, Truck, ClipboardList, ChevronLeft, Banknote } from 'lucide-react';
import { useDriver } from './DriverContext';
import type { Delivery } from '../../lib/driverApi';
import { EmptyState, PageState, StatusPill, type StatusTone } from '../../components/ui';
import { formatSDG, formatRelative } from '../../lib/format';

const STATUS: Record<Delivery['status'], { label: string; tone: StatusTone }> = {
    confirmed: { label: 'بانتظار الاستلام', tone: 'info' },
    preparing: { label: 'قيد التجهيز', tone: 'attention' },
    shipped: { label: 'في الطريق', tone: 'info' },
    delivered: { label: 'تم التوصيل', tone: 'success' },
    delivery_failed: { label: 'تعذر التسليم', tone: 'danger' },
};

const DeliveryCard: React.FC<{ d: Delivery }> = ({ d }) => (
    <Link to={`/driver/orders/${d.id}`} className="flex items-center gap-3 rounded-card border border-gray-200 bg-white p-4 min-h-20 hover:border-brand-blue/50">
        <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-gray-900">{d.customerName}</span>
                <StatusPill tone={STATUS[d.status].tone}>{STATUS[d.status].label}</StatusPill>
            </div>
            <p className="mt-0.5 truncate text-sm text-gray-600">{[d.city, d.state].filter(Boolean).join('، ') || d.address}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-gray-500">
                <span>{d.orderNumber}</span>
                <span>{d.itemCount} قطعة</span>
                {d.codAmount != null && <span className="inline-flex items-center gap-1 font-bold text-status-attention-ink"><Banknote className="w-3.5 h-3.5" /> تحصيل {formatSDG(d.codAmount)}</span>}
                {d.statusChangedAt && <span>{formatRelative(d.statusChangedAt)}</span>}
            </p>
        </div>
        <ChevronLeft className="w-5 h-5 shrink-0 text-gray-400" />
    </Link>
);

const Section: React.FC<{ title: string; icon: React.ReactNode; items: Delivery[] }> = ({ title, icon, items }) => items.length === 0 ? null : (
    <section className="mb-6">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-700">{icon} {title} <span className="rounded-full bg-gray-200 px-2 text-xs">{items.length}</span></h2>
        <ul className="space-y-2">{items.map((d) => <li key={d.id}><DeliveryCard d={d} /></li>)}</ul>
    </section>
);

export const DriverHomePage: React.FC = () => {
    const { deliveries, loading, error, refresh, profile } = useDriver();
    const onTheRoad = deliveries.filter((d) => d.status === 'shipped');
    const assigned = deliveries.filter((d) => d.status === 'confirmed' || d.status === 'preparing');
    const done = deliveries.filter((d) => d.status === 'delivered' || d.status === 'delivery_failed');

    return (
        <PageState
            loading={loading}
            error={error}
            onRetry={() => void refresh()}
            empty={deliveries.length === 0}
            emptyState={<EmptyState icon={<Truck className="w-7 h-7" />} title="لا توجد توصيلات مسندة إليك" body={profile?.status === 'offline' ? 'أنت غير متاح الآن؛ فعّلي "متاح" ليتمكن الفريق من إسناد الطلبات إليك.' : 'ستظهر الطلبات هنا فور إسنادها إليك.'} />}
        >
            <Section title="في الطريق الآن" icon={<Truck className="w-4 h-4 text-brand-blue" />} items={onTheRoad} />
            <Section title="جاهزة للاستلام" icon={<ClipboardList className="w-4 h-4 text-brand-blue" />} items={assigned} />
            <Section title="أُنجزت اليوم" icon={<PackageCheck className="w-4 h-4 text-brand-blue" />} items={done} />
        </PageState>
    );
};

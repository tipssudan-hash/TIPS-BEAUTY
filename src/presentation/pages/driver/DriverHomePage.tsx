import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ChevronLeft,
    Search,
    MapPin,
    Wallet,
} from 'lucide-react';
import { useDriver } from './DriverContext';
import type { Delivery, DeliveryStatus } from '@infrastructure/repositories';
import { formatSDG } from '@application/services/format';
import { EmptyState, PageState, StatusPill, type StatusTone } from '../../components/ui';
import { DriverCashDrawerModal } from '../../components/driver/DriverCashDrawerModal';

const STATUS: Record<DeliveryStatus, { label: string; tone: StatusTone }> = {
    confirmed: { label: 'جاهز للاستلام', tone: 'info' },
    preparing: { label: 'قيد التجهيز', tone: 'attention' },
    shipped: { label: 'في الطريق', tone: 'info' },
    delivered: { label: 'تم التسليم', tone: 'success' },
    delivery_failed: { label: 'تعذر التسليم', tone: 'danger' },
};

const DeliveryCard: React.FC<{ d: Delivery }> = ({ d }) => {
    const hasPin = d.customerLat != null && d.customerLng != null;

    return (
        <Link
            to={`/driver/orders/${d.id}`}
            className="block bg-white rounded-lg border border-gray-200 shadow-xs hover:border-gray-400 transition-colors overflow-hidden group"
        >
            <div className="p-4 sm:p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="font-mono font-bold text-gray-900 text-sm sm:text-base">
                                #{d.orderNumber}
                            </span>
                            <StatusPill tone={STATUS[d.status].tone}>
                                {STATUS[d.status].label}
                            </StatusPill>
                            {hasPin && (
                                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                                    GPS
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-2.5 flex-wrap text-sm font-bold text-gray-900">
                            <span>{d.customerName}</span>
                            <span className="text-gray-300">•</span>
                            <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-gray-400" />
                                {[d.city, d.state].filter(Boolean).join(' - ') || d.address}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-100">
                        <div className="text-left sm:text-right">
                            <span className="text-[10px] text-gray-400 font-bold block">
                                {d.codAmount != null ? 'المبلغ المطلوب (COD)' : 'طريقة الدفع'}
                            </span>
                            <span className="text-base sm:text-lg font-black text-gray-900 font-mono" dir="ltr">
                                {d.codAmount != null ? formatSDG(d.codAmount) : 'مدفوع مسبقاً'}
                            </span>
                        </div>

                        <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2.5 py-1 rounded-md">
                            {d.itemCount} قطع
                        </span>
                    </div>
                </div>

                {/* Bottom Action Strip */}
                <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs">
                    <span className="text-gray-500 font-medium">معاينة تفاصيل الشحنة والتوصيل</span>
                    <span className="text-xs font-bold text-gray-900 group-hover:text-black flex items-center gap-1">
                        <span>تفاصيل التوصيل</span>
                        <ChevronLeft className="w-3.5 h-3.5" />
                    </span>
                </div>
            </div>
        </Link>
    );
};

const Section: React.FC<{ title: string; items: Delivery[] }> = ({
    title,
    items,
}) =>
    items.length === 0 ? null : (
        <section className="mb-5">
            <h2 className="mb-2.5 flex items-center gap-2 text-sm font-bold text-gray-900">
                {title}
                <span className="rounded-md bg-gray-100 text-gray-800 border border-gray-200 px-2 py-0.5 text-xs font-bold">
                    {items.length}
                </span>
            </h2>
            <div className="space-y-3.5">
                {items.map((d) => (
                    <DeliveryCard key={d.id} d={d} />
                ))}
            </div>
        </section>
    );

export const DriverHomePage: React.FC = () => {
    const { deliveries, loading, error, refresh, profile } = useDriver();
    const [search, setSearch] = useState('');
    const [cashModalOpen, setCashModalOpen] = useState(false);

    const filteredDeliveries = useMemo(() => {
        if (!search.trim()) return deliveries;
        const q = search.trim().toLowerCase();
        return deliveries.filter(
            (d) =>
                d.orderNumber.toLowerCase().includes(q) ||
                d.customerName.toLowerCase().includes(q) ||
                d.phone.includes(q) ||
                d.address.toLowerCase().includes(q)
        );
    }, [deliveries, search]);

    const onTheRoad = filteredDeliveries.filter((d) => d.status === 'shipped');
    const assigned = filteredDeliveries.filter((d) => d.status === 'confirmed' || d.status === 'preparing');
    const done = filteredDeliveries.filter((d) => d.status === 'delivered' || d.status === 'delivery_failed');

    const totalCollectedToday = deliveries
        .filter((d) => d.status === 'delivered' && d.codAmount != null)
        .reduce((sum, d) => sum + (d.codAmount ?? 0), 0);

    return (
        <PageState
            loading={loading}
            error={error}
            onRetry={() => void refresh()}
            empty={deliveries.length === 0}
            emptyState={
                <EmptyState
                    title="لا توجد توصيلات مسندة إليك"
                    body={
                        profile?.status === 'offline'
                            ? 'أنت غير متاح الآن؛ فعّل "متاح" لتستقبل الطلبات المسندة إليك من المشرف.'
                            : 'ستظهر الطلبات هنا فور إسنادها إليك من مشرف المستودع.'
                    }
                />
            }
        >
            <div className="space-y-4">
                {/* Cash Drawer Unified Card */}
                <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-xs">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-gray-100 text-gray-800 border border-gray-200 flex items-center justify-center shrink-0">
                                <Wallet className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-gray-500">صندوق النقدية والعهدة (COD)</p>
                                <p className="text-lg sm:text-xl font-black text-gray-900 font-mono mt-0.5" dir="ltr">
                                    {formatSDG(totalCollectedToday)}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setCashModalOpen(true)}
                            className="px-4 py-2 rounded-lg bg-white hover:bg-gray-50 text-gray-800 font-bold text-xs border border-gray-200 shadow-xs transition-colors shrink-0"
                        >
                            تسليم العهدة
                        </button>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="relative">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="بحث برقم الطلب، اسم العميل، أو الهاتف..."
                        className="w-full pl-4 pr-10 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:border-black focus:ring-1 focus:ring-black outline-hidden shadow-xs transition-all"
                    />
                    <Search className="w-4 h-4 text-gray-400 absolute right-3.5 top-3" />
                </div>

                <Section title="في الطريق الآن" items={onTheRoad} />
                <Section title="جاهزة للاستلام من المستودع" items={assigned} />
                <Section title="أُنجزت اليوم" items={done} />

                <DriverCashDrawerModal isOpen={cashModalOpen} onClose={() => setCashModalOpen(false)} />
            </div>
        </PageState>
    );
};

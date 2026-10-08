import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Truck,
    PackageCheck,
    ClipboardList,
    ChevronLeft,
    Search,
    MapPin,
    Phone,
    MessageCircle,
    Package,
    Wallet,
    Banknote,
} from 'lucide-react';
import { useDriver } from './DriverContext';
import type { Delivery, DeliveryStatus } from '@infrastructure/repositories';
import { formatSDG } from '@application/services/format';
import { EmptyState, PageState, StatusPill, type StatusTone } from '../../components/ui';
import { useProductImageMap } from '../../hooks/useProductImageMap';
import { DriverCashDrawerModal } from '../../components/driver/DriverCashDrawerModal';

const STATUS: Record<DeliveryStatus, { label: string; tone: StatusTone }> = {
    confirmed: { label: 'جاهز للاستلام', tone: 'info' },
    preparing: { label: 'قيد التجهيز', tone: 'attention' },
    shipped: { label: 'في الطريق', tone: 'info' },
    delivered: { label: 'تم التسليم', tone: 'success' },
    delivery_failed: { label: 'تعذر التسليم', tone: 'danger' },
};

const DeliveryCard: React.FC<{ d: Delivery }> = ({ d }) => {
    const { getProductImageUrl } = useProductImageMap();
    const cleanPhone = d.phone.replace(/[^0-9]/g, '');
    const formattedPhone = cleanPhone.startsWith('0')
        ? `249${cleanPhone.slice(1)}`
        : cleanPhone.startsWith('249')
        ? cleanPhone
        : `249${cleanPhone}`;

    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(
        `مرحباً ${d.customerName}، أنا مندوب تيبس لمستحضرات التجميل بشأن طلبك رقم (${d.orderNumber}).`
    )}`;

    const hasPin = d.customerLat != null && d.customerLng != null;

    return (
        <div className="p-5 sm:p-6 bg-white border border-gray-200 rounded-lg hover:border-brand-blue/60 transition-all shadow-xs space-y-3">
            {/* Header: Customer name, Order #, Status pill */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-gray-100">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="font-black text-gray-900 text-base">{d.customerName}</span>
                        {hasPin && (
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-1.5 py-0.5 rounded-md">
                                GPS
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">#{d.orderNumber}</p>
                </div>
                <StatusPill tone={STATUS[d.status].tone}>{STATUS[d.status].label}</StatusPill>
            </div>

            {/* Address */}
            <div className="text-sm text-gray-700 flex items-start gap-2.5">
                <MapPin className="w-4 h-4 shrink-0 text-brand-blue mt-0.5" />
                <span className="line-clamp-2 font-medium">{[d.city, d.state].filter(Boolean).join('، ') || d.address}</span>
            </div>

            {/* Products Thumbnails Preview */}
            <div className="py-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 overflow-hidden">
                    {d.items.slice(0, 4).map((item, idx) => {
                        const img = getProductImageUrl(item, 120);
                        return (
                            <div
                                key={idx}
                                className="w-12 h-12 rounded-md bg-white border border-gray-200 overflow-hidden shadow-2xs flex items-center justify-center p-0.5 shrink-0"
                                title={`${item.name_ar} (×${item.quantity})`}
                            >
                                {img ? (
                                    <img src={img} alt={item.name_ar} className="w-full h-full object-contain" />
                                ) : (
                                    <Package className="w-5 h-5 text-gray-300" />
                                )}
                            </div>
                        );
                    })}
                    {d.items.length > 4 && (
                        <span className="w-8 h-12 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center text-xs font-black text-gray-600">
                            +{d.items.length - 4}
                        </span>
                    )}
                </div>

                <div className="text-left shrink-0">
                    <span className="text-xs text-gray-500 font-bold block">{d.itemCount} قطعة</span>
                    {d.codAmount != null ? (
                        <span className="inline-flex items-center gap-1 text-xs font-black text-amber-900 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-md font-mono" dir="ltr">
                            <Banknote className="w-3.5 h-3.5 text-amber-600" /> {formatSDG(d.codAmount)}
                        </span>
                    ) : (
                        <span className="text-[11px] font-black text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-md">
                            مدفوع مسبقاً
                        </span>
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <a
                        href={`tel:${d.phone}`}
                        className="p-2.5 rounded-md bg-sky-50 text-sky-800 hover:bg-sky-100 transition-colors border border-sky-200"
                        title="اتصال بالعميل"
                    >
                        <Phone className="w-4 h-4" />
                    </a>
                    <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2.5 rounded-md bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors border border-emerald-200"
                        title="مراسلة واتساب"
                    >
                        <MessageCircle className="w-4 h-4" />
                    </a>
                </div>

                <Link
                    to={`/driver/orders/${d.id}`}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md bg-brand-blue hover:bg-blue-700 text-white font-bold text-sm shadow-xs transition-colors"
                >
                    <span>تفاصيل التوصيل</span>
                    <ChevronLeft className="w-4 h-4" />
                </Link>
            </div>
        </div>
    );
};

const Section: React.FC<{ title: string; icon: React.ReactNode; items: Delivery[] }> = ({
    title,
    icon,
    items,
}) =>
    items.length === 0 ? null : (
        <section className="mb-6">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-gray-900">
                {icon} {title}
                <span className="rounded-md bg-gray-100 border border-gray-200 px-2 py-0.5 text-xs font-bold text-gray-700">
                    {items.length}
                </span>
            </h2>
            <div className="space-y-4">
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
                    icon={<Truck className="w-8 h-8" />}
                    title="لا توجد توصيلات مسندة إليك"
                    body={
                        profile?.status === 'offline'
                            ? 'أنت غير متاح الآن؛ فعّل "متاح" لتستقبل الطلبات المسندة إليك من المشرف.'
                            : 'ستظهر الطلبات هنا فور إسنادها إليك من مشرف المستودع.'
                    }
                />
            }
        >
            <div className="max-w-4xl mx-auto space-y-5">
                {/* Cash Drawer Banner Button */}
                <div>
                    <button
                        type="button"
                        onClick={() => setCashModalOpen(true)}
                        className="w-full flex items-center justify-between p-5 rounded-lg bg-linear-to-r from-amber-500 via-amber-600 to-orange-600 text-white shadow-xs hover:brightness-105 transition-all"
                    >
                        <div className="flex items-center gap-3.5">
                            <div className="w-10 h-10 rounded-md bg-white/20 backdrop-blur-xs flex items-center justify-center">
                                <Wallet className="w-5 h-5 text-white" />
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-bold text-amber-100">صندوق النقدية والعهدة (COD)</p>
                                <p className="text-xl font-black font-mono mt-0.5" dir="ltr">
                                    {formatSDG(totalCollectedToday)}
                                </p>
                            </div>
                        </div>
                        <span className="text-xs font-bold bg-white text-amber-900 px-3.5 py-2 rounded-md shadow-2xs hover:bg-amber-50 transition-colors">
                            تسليم العهدة
                        </span>
                    </button>
                </div>

                {/* Search Bar */}
                <div className="relative">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="بحث برقم الطلب، اسم العميل، أو الهاتف..."
                        className="w-full pl-4 pr-11 py-3 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue outline-hidden shadow-2xs transition-all"
                    />
                    <Search className="w-5 h-5 text-gray-400 absolute right-3.5 top-3" />
                </div>

                <Section title="في الطريق الآن" icon={<Truck className="w-4 h-4 text-sky-600" />} items={onTheRoad} />
                <Section title="جاهزة للاستلام من المستودع" icon={<ClipboardList className="w-4 h-4 text-amber-600" />} items={assigned} />
                <Section title="أُنجزت اليوم" icon={<PackageCheck className="w-4 h-4 text-emerald-600" />} items={done} />

                <DriverCashDrawerModal isOpen={cashModalOpen} onClose={() => setCashModalOpen(false)} />
            </div>
        </PageState>
    );
};

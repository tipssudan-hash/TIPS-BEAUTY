import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, ChevronLeft, RotateCcw } from 'lucide-react';
import { Order, OrderStatus, PaymentStatus } from '@domain/entities';
import { fetchMyOrders, ORDER_PAGE_SIZE } from '@infrastructure/repositories';
import { errorMessage } from '@application/errors';
import { formatSDG, formatDateTime } from '@application/services/format';
import { EmptyState, Notice, Skeleton, primaryButtonClass, secondaryButtonClass } from '../../components/ui';
import { useReorder } from '../../hooks/useReorder';
import { usePageMeta } from '../../hooks/usePageMeta';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
    new: 'جديد',
    confirmed: 'مؤكد',
    preparing: 'قيد التجهيز',
    shipped: 'في الطريق',
    delivered: 'تم التوصيل',
    cancelled: 'ملغي',
    delivery_failed: 'تعذر التسليم',
};

export const ORDER_STATUS_CLASSES: Record<OrderStatus, string> = {
    new: 'bg-blue-50 text-blue-700',
    confirmed: 'bg-indigo-50 text-indigo-700',
    preparing: 'bg-amber-50 text-amber-700',
    shipped: 'bg-purple-50 text-purple-700',
    delivered: 'bg-green-50 text-green-700',
    cancelled: 'bg-gray-100 text-gray-600',
    delivery_failed: 'bg-red-50 text-red-700',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
    pending: 'بانتظار الدفع',
    proof_submitted: 'بانتظار مراجعة الدفع',
    paid: 'مدفوع',
    refunded: 'مسترد',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
    COD: 'الدفع عند الاستلام',
    Mychashi: 'تحويل ماي كاشي',
};

export const StatusBadge: React.FC<{ status: OrderStatus }> = ({ status }) => (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${ORDER_STATUS_CLASSES[status] ?? 'bg-gray-100 text-gray-600'}`}>
        {ORDER_STATUS_LABELS[status] ?? status}
    </span>
);

export const MyOrdersPage: React.FC = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [reorderMessage, setReorderMessage] = useState<{ text: string; cart: boolean } | null>(null);
    const reorder = useReorder();

    usePageMeta({ title: 'طلباتي | Tips Beauty', noindex: true });

    useEffect(() => {
        let cancelled = false;
        fetchMyOrders(0, ORDER_PAGE_SIZE)
            .then(data => {
                if (cancelled) return;
                setOrders(data);
                setHasMore(data.length === ORDER_PAGE_SIZE);
            })
            .catch(err => { if (!cancelled) setError(errorMessage(err, 'تعذر تحميل الطلبات.')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const loadMore = useCallback(async () => {
        setLoadingMore(true);
        try {
            const next = await fetchMyOrders(orders.length, ORDER_PAGE_SIZE);
            setOrders(prev => [...prev, ...next.filter(o => !prev.some(p => p.id === o.id))]);
            setHasMore(next.length === ORDER_PAGE_SIZE);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل المزيد من الطلبات.'));
        } finally {
            setLoadingMore(false);
        }
    }, [orders.length]);

    const handleReorder = (order: Order) => {
        const { added, skipped } = reorder(order.items);
        if (added === 0) {
            setReorderMessage({ text: 'عذراً، منتجات هذا الطلب لم تعد متوفرة حالياً.', cart: false });
            return;
        }
        setReorderMessage({
            text: skipped > 0
                ? `تمت إضافة ${added} منتج للسلة؛ تعذر إضافة ${skipped} لعدم توفره حالياً.`
                : 'تمت إضافة منتجات الطلب للسلة.',
            cart: true,
        });
    };

    if (loading) {
        return (
            <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-3" aria-busy="true">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-card" />)}
            </div>
        );
    }

    if (error && orders.length === 0) {
        return <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8"><Notice kind="error">{error}</Notice></div>;
    }

    if (orders.length === 0) {
        return (
            <div className="max-w-5xl mx-auto p-4 sm:p-8">
                <EmptyState
                    icon={<Package className="w-7 h-7" />}
                    title="لا توجد طلبات بعد"
                    body="ابدئي التسوق وسيظهر طلبك هنا"
                    action={<Link to="/" className={primaryButtonClass}>تسوقي الآن</Link>}
                />
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 animate-fadeIn">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6">طلباتي</h1>
            {reorderMessage && (
                <div className="mb-4 bg-amber-50 border border-amber-100 text-amber-800 rounded-control p-4 text-sm flex items-center justify-between gap-3" role="status">
                    <span>{reorderMessage.text}</span>
                    {reorderMessage.cart && <Link to="/cart" className="font-bold underline shrink-0">عرض السلة</Link>}
                </div>
            )}
            {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}
            <div className="space-y-3">
                {orders.map(order => (
                    <article key={order.id} className="bg-white rounded-card shadow-card border border-brand-blue-soft p-4 hover:border-brand-blue transition-colors">
                        <Link to={`/orders/${order.id}`} className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="font-bold text-gray-800 truncate">طلب {order.orderNumber}</p>
                                <p className="text-xs text-gray-500 mt-1">{formatDateTime(order.createdAt)}</p>
                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                    <StatusBadge status={order.status} />
                                    <span className="text-xs text-gray-500">{PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="font-black text-brand-blue">{formatSDG(order.total)}</span>
                                <ChevronLeft className="w-5 h-5 text-gray-400" />
                            </div>
                        </Link>
                        {order.status === 'delivered' && (
                            <div className="mt-3 flex justify-end">
                                <button type="button" onClick={() => handleReorder(order)} className={`${secondaryButtonClass} flex items-center gap-2 text-xs py-2 px-3`}>
                                    <RotateCcw className="w-4 h-4" /> إعادة الطلب
                                </button>
                            </div>
                        )}
                    </article>
                ))}
            </div>
            {hasMore && (
                <div className="mt-6 flex justify-center">
                    <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className={secondaryButtonClass}>
                        {loadingMore ? 'جاري التحميل...' : 'تحميل المزيد'}
                    </button>
                </div>
            )}
        </div>
    );
};

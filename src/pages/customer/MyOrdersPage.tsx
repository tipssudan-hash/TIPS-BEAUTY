import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, ChevronLeft } from 'lucide-react';
import { Order, OrderStatus, PaymentStatus } from '../../types';
import { fetchMyOrders } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatSDG, formatDateTime } from '../../lib/format';

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
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchMyOrders()
            .then(data => { if (!cancelled) setOrders(data); })
            .catch(err => { if (!cancelled) setError(errorMessage(err, 'تعذر تحميل الطلبات.')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto p-4 space-y-3" aria-busy="true">
                {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />)}
            </div>
        );
    }

    if (error) {
        return <div className="max-w-4xl mx-auto p-4"><div className="bg-red-50 border border-red-100 text-red-700 rounded-xl p-4 text-sm">{error}</div></div>;
    }

    if (orders.length === 0) {
        return (
            <div className="max-w-4xl mx-auto p-8 text-center">
                <div className="bg-white rounded-2xl shadow-sm border border-brand-blue-soft p-12">
                    <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">لا توجد طلبات بعد</h2>
                    <p className="text-gray-600 mb-6">ابدئي التسوق وسيظهر طلبك هنا</p>
                    <Link to="/" className="inline-block bg-brand-blue hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-xl transition-all">تسوقي الآن</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-4">
            <h1 className="text-2xl font-bold text-gray-800 mb-6">طلباتي</h1>
            <div className="space-y-3">
                {orders.map(order => (
                    <Link key={order.id} to={`/orders/${order.id}`} className="block bg-white rounded-2xl shadow-sm border border-brand-blue-soft p-4 hover:border-brand-blue transition-colors">
                        <div className="flex items-center justify-between gap-3">
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
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
};

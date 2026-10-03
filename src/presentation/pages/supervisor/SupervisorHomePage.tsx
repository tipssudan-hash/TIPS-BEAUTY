import React, { useEffect, useState } from 'react';
import { Package, AlertTriangle, RefreshCw } from 'lucide-react';
import { fetchSupervisorProfile, fetchSupervisorOrders, fetchSupervisorInventory } from '@infrastructure/repositories';
import type { SupervisorProfile, SupervisorOrder, SupervisorInventoryRow } from '@infrastructure/repositories';
import { formatSDG, formatRelative } from '@application/services/format';
import { errorMessage } from '@application/errors';
import { PageState, EmptyState } from '../../components/ui';

const ORDER_STATUS_AR: Record<string, string> = {
    new: 'جديد', confirmed: 'مؤكد', preparing: 'قيد التجهيز', shipped: 'في الطريق',
};
const STATUS_COLOR: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700',
    confirmed: 'bg-indigo-100 text-indigo-700',
    preparing: 'bg-amber-100 text-amber-700',
    shipped: 'bg-emerald-100 text-emerald-700',
};

type Tab = 'orders' | 'inventory';

export const SupervisorHomePage: React.FC = () => {
    const [tab, setTab] = useState<Tab>('orders');
    const [profile, setProfile] = useState<SupervisorProfile | null>(null);
    const [orders, setOrders] = useState<SupervisorOrder[]>([]);
    const [inventory, setInventory] = useState<SupervisorInventoryRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const p = await fetchSupervisorProfile();
            setProfile(p);
            if (!p) return;
            const [o, inv] = await Promise.all([
                fetchSupervisorOrders(),
                fetchSupervisorInventory(p.warehouseId),
            ]);
            setOrders(o);
            setInventory(inv);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل البيانات.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const lowCount = inventory.filter((i) => i.isLow).length;

    return (
        <PageState loading={loading} error={error} onRetry={() => void load()} empty={false}>
            {profile && (
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-black text-gray-900">{profile.warehouseName}</h1>
                        <p className="text-sm text-gray-500">{profile.warehouseCity}، {profile.warehouseState}</p>
                    </div>
                    <button type="button" onClick={() => void load()} aria-label="تحديث"
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                        <RefreshCw className="w-5 h-5" />
                    </button>
                </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-gray-200 mb-6">
                <button type="button" onClick={() => setTab('orders')}
                    className={`px-5 py-3 text-sm font-bold border-b-2 transition-colors ${tab === 'orders' ? 'border-sky-600 text-sky-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    الطلبات النشطة <span className="mr-1.5 rounded-full bg-gray-100 px-2 text-xs">{orders.length}</span>
                </button>
                <button type="button" onClick={() => setTab('inventory')}
                    className={`px-5 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${tab === 'inventory' ? 'border-sky-600 text-sky-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    المخزون
                    {lowCount > 0 && <span className="rounded-full bg-red-100 text-red-600 px-2 text-xs">{lowCount} منخفض</span>}
                </button>
            </div>

            {tab === 'orders' && (
                orders.length === 0 ? (
                    <EmptyState icon={<Package className="w-7 h-7" />} title="لا توجد طلبات نشطة" body="كل الطلبات في مستودعك مكتملة أو مُسلَّمة." />
                ) : (
                    <div className="space-y-3">
                        {orders.map((o) => (
                            <div key={o.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-gray-900 text-sm">{o.orderNumber}</span>
                                        <span className={`px-2 py-0.5 rounded-lg text-xs font-black ${STATUS_COLOR[o.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                            {ORDER_STATUS_AR[o.status] ?? o.status}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-700 mt-0.5">{o.customerName}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">{[o.city, o.state].filter(Boolean).join('، ')} · {o.itemCount} قطعة · {formatRelative(o.createdAt)}</p>
                                </div>
                                <p className="font-black text-gray-900 shrink-0">{formatSDG(o.total)}</p>
                            </div>
                        ))}
                    </div>
                )
            )}

            {tab === 'inventory' && (
                inventory.length === 0 ? (
                    <EmptyState icon={<Package className="w-7 h-7" />} title="لا توجد بيانات مخزون" body="لم يُسجَّل مخزون لهذا المستودع بعد." />
                ) : (
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <table className="w-full text-right text-sm">
                            <thead className="bg-gray-50 text-xs font-black text-gray-400 uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 py-3">المنتج</th>
                                    <th className="px-4 py-3 text-center">الكمية</th>
                                    <th className="px-4 py-3 text-center">حد إعادة الطلب</th>
                                    <th className="px-4 py-3 text-center">الحالة</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {inventory.map((row) => (
                                    <tr key={row.productId} className={row.isLow ? 'bg-red-50/50' : ''}>
                                        <td className="px-4 py-3 font-medium text-gray-900">{row.productName}</td>
                                        <td className={`px-4 py-3 text-center font-black ${row.isLow ? 'text-red-600' : 'text-gray-900'}`}>{row.quantity}</td>
                                        <td className="px-4 py-3 text-center text-gray-500">{row.reorderLevel}</td>
                                        <td className="px-4 py-3 text-center">
                                            {row.isLow ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                                                    <AlertTriangle className="w-3 h-3" /> منخفض
                                                </span>
                                            ) : (
                                                <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">متوفر</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )
            )}
        </PageState>
    );
};

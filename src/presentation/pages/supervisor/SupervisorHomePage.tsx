import React, { useEffect, useState, useMemo } from 'react';
import {
    Package,
    AlertTriangle,
    RefreshCw,
    UserCheck,
    Truck,
    Phone,
    MessageCircle,
    MapPin,
    Search,
    Banknote,
    ChevronDown,
    ChevronUp,
    CheckSquare,
    Square,
    Clock,
} from 'lucide-react';
import {
    fetchSupervisorProfile,
    fetchSupervisorOrders,
    fetchSupervisorInventory,
    fetchWarehouseDrivers,
    assignDriverToOrder,
    updateSupervisorOrderStatus,
    fetchWarehouseCashRemittances,
    confirmDriverCashRemittance,
    type SupervisorProfile,
    type SupervisorOrder,
    type SupervisorInventoryRow,
    type WarehouseDriverOption,
    type DriverCashRemittance,
} from '@infrastructure/repositories';
import { formatSDG, formatDateTime } from '@application/services/format';
import { errorMessage } from '@application/errors';
import { PageState, EmptyState, Notice, StatusPill, type StatusTone } from '../../components/ui';
import { cn } from '@presentation/utils/cn';
import { useProductImageMap } from '../../hooks/useProductImageMap';

const STATUS_CONFIG: Record<string, { label: string; tone: StatusTone; stepIndex: number }> = {
    new: { label: 'طلب جديد', tone: 'info', stepIndex: 0 },
    confirmed: { label: 'تم التأكيد', tone: 'info', stepIndex: 1 },
    preparing: { label: 'قيد التجهيز بالمستودع', tone: 'attention', stepIndex: 2 },
    shipped: { label: 'في الطريق مع المندوب', tone: 'info', stepIndex: 3 },
    delivered: { label: 'تم التسليم بنجاح ✓', tone: 'success', stepIndex: 4 },
    delivery_failed: { label: 'تعذر التسليم', tone: 'danger', stepIndex: 3 },
};

type Tab = 'orders' | 'drivers' | 'remittances' | 'inventory';

export const SupervisorHomePage: React.FC = () => {
    const { getProductImageUrl } = useProductImageMap();
    const [tab, setTab] = useState<Tab>('orders');
    const [profile, setProfile] = useState<SupervisorProfile | null>(null);
    const [orders, setOrders] = useState<SupervisorOrder[]>([]);
    const [inventory, setInventory] = useState<SupervisorInventoryRow[]>([]);
    const [drivers, setDrivers] = useState<WarehouseDriverOption[]>([]);
    const [remittances, setRemittances] = useState<DriverCashRemittance[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Filters
    const [orderSearch, setOrderSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'confirmed' | 'preparing' | 'shipped'>('all');
    const [inventorySearch, setInventorySearch] = useState('');
    const [lowStockOnly, setLowStockOnly] = useState(false);
    const [driverSearch, setDriverSearch] = useState('');

    // Order expansion & checklist
    const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
    const [packingChecked, setPackingChecked] = useState<Record<string, Record<number, boolean>>>({});
    const [selectedDrivers, setSelectedDrivers] = useState<Record<string, string>>({});
    const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
    const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const p = await fetchSupervisorProfile();
            setProfile(p);
            if (!p) {
                setLoading(false);
                return;
            }

            const [ordersResult, invResult, drvsResult, remResult] = await Promise.allSettled([
                fetchSupervisorOrders(),
                fetchSupervisorInventory(p.warehouseId),
                fetchWarehouseDrivers(),
                fetchWarehouseCashRemittances(),
            ]);

            setOrders(ordersResult.status === 'fulfilled' ? ordersResult.value : []);
            setInventory(invResult.status === 'fulfilled' ? invResult.value : []);
            setDrivers(drvsResult.status === 'fulfilled' ? drvsResult.value : []);
            setRemittances(remResult.status === 'fulfilled' ? remResult.value : []);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل بيانات المستودع.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const toggleOrderExpanded = (orderId: string) => {
        setExpandedOrders((prev) => ({ ...prev, [orderId]: !prev[orderId] }));
    };

    const togglePackingItem = (orderId: string, itemIdx: number) => {
        setPackingChecked((prev) => ({
            ...prev,
            [orderId]: {
                ...(prev[orderId] || {}),
                [itemIdx]: !prev[orderId]?.[itemIdx],
            },
        }));
    };

    const handleAssignDriver = async (orderId: string) => {
        const driverId = selectedDrivers[orderId];
        if (!driverId) {
            alert('الرجاء اختيار المندوب أولاً من القائمة.');
            return;
        }

        setActionBusy((prev) => ({ ...prev, [orderId]: true }));
        setError(null);
        setSuccess(null);
        try {
            await assignDriverToOrder(orderId, driverId);
            setSuccess('تم إسناد الطلب للمندوب بنجاح.');
            const updated = await fetchSupervisorOrders();
            setOrders(updated);
        } catch (err) {
            setError(errorMessage(err, 'تعذر إسناد الطلب للمندوب.'));
        } finally {
            setActionBusy((prev) => ({ ...prev, [orderId]: false }));
        }
    };

    const handleStatusTransition = async (orderId: string, newStatus: string) => {
        setActionBusy((prev) => ({ ...prev, [orderId]: true }));
        setError(null);
        setSuccess(null);
        try {
            await updateSupervisorOrderStatus(orderId, newStatus);
            setSuccess(`تم تحديث حالة الطلب إلى "${STATUS_CONFIG[newStatus]?.label || newStatus}".`);
            const updated = await fetchSupervisorOrders();
            setOrders(updated);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحديث حالة الطلب.'));
        } finally {
            setActionBusy((prev) => ({ ...prev, [orderId]: false }));
        }
    };

    const handleSaveOrderNotes = async (orderId: string) => {
        const notesToSave = editingNotes[orderId];
        if (notesToSave === undefined) return;

        setActionBusy((prev) => ({ ...prev, [orderId]: true }));
        setError(null);
        try {
            await updateSupervisorOrderStatus(orderId, undefined, notesToSave.trim() || undefined);
            setSuccess('تم حفظ ملاحظات الطلب بنجاح.');
            const updated = await fetchSupervisorOrders();
            setOrders(updated);
        } catch (err) {
            setError(errorMessage(err, 'تعذر حفظ الملاحظات.'));
        } finally {
            setActionBusy((prev) => ({ ...prev, [orderId]: false }));
        }
    };

    const handleConfirmRemittance = async (remittanceId: string) => {
        setError(null);
        try {
            await confirmDriverCashRemittance(remittanceId);
            setSuccess('تم تأكيد استلام العهدة النقدية بنجاح.');
            const updated = await fetchWarehouseCashRemittances();
            setRemittances(updated);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تأكيد استلام العهدة.'));
        }
    };

    const filteredOrders = useMemo(() => {
        return orders.filter((o) => {
            if (statusFilter !== 'all' && o.status !== statusFilter) return false;
            if (!orderSearch.trim()) return true;
            const q = orderSearch.trim().toLowerCase();
            return (
                o.orderNumber.toLowerCase().includes(q) ||
                o.customerName.toLowerCase().includes(q) ||
                o.phone.includes(q) ||
                o.shippingAddress.toLowerCase().includes(q) ||
                (o.driverName && o.driverName.toLowerCase().includes(q))
            );
        });
    }, [orders, statusFilter, orderSearch]);

    const filteredInventory = useMemo(() => {
        return inventory.filter((row) => {
            if (lowStockOnly && !row.isLow) return false;
            if (!inventorySearch.trim()) return true;
            return row.productName.toLowerCase().includes(inventorySearch.trim().toLowerCase());
        });
    }, [inventory, lowStockOnly, inventorySearch]);

    const filteredDrivers = useMemo(() => {
        if (!driverSearch.trim()) return drivers;
        const q = driverSearch.trim().toLowerCase();
        return drivers.filter((d) => d.name.toLowerCase().includes(q) || d.phone.includes(q));
    }, [drivers, driverSearch]);

    const cleanPhone = (p: string) => {
        const raw = p.replace(/[^0-9]/g, '');
        return raw.startsWith('0') ? `249${raw.slice(1)}` : raw.startsWith('249') ? raw : `249${raw}`;
    };

    const pendingOrdersCount = orders.filter((o) => o.status === 'confirmed' || o.status === 'preparing' || o.status === 'new').length;
    const pendingRemittancesCount = remittances.filter((r) => r.status === 'submitted').length;
    const lowCount = inventory.filter((i) => i.isLow).length;

    if (!loading && !profile) {
        return (
            <div className="max-w-2xl mx-auto py-12 px-6 bg-white rounded-lg border border-gray-200 shadow-xs text-center space-y-4">
                <h2 className="font-black text-xl text-gray-900">هذا الحساب غير معين كمشرف مستودع</h2>
                <p className="text-sm text-gray-600 leading-relaxed font-medium">
                    لم يتم ربط حسابك بأي مستودع تشغيلي حتى الآن. يرجى من المسؤول الانتقال إلى لوحة تحكم الإدارة وتعيينك كمشرف مستودع.
                </p>
                <div className="pt-2">
                    <button
                        type="button"
                        onClick={() => void load()}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-black text-white text-xs font-bold hover:bg-gray-800 transition-all"
                    >
                        <RefreshCw className="w-4 h-4" /> إعادة التحقق
                    </button>
                </div>
            </div>
        );
    }

    return (
        <PageState loading={loading} error={error} onRetry={() => void load()} empty={false}>
            {/* Clean Warehouse & Metrics Unified Card */}
            {profile && (
                <div className="mb-6 bg-white p-5 rounded-lg border border-gray-200 shadow-xs">
                    {/* Top Row: Warehouse Name */}
                    <div className="pb-4 border-b border-gray-100">
                        <h1 className="text-xl sm:text-2xl font-black text-gray-900">{profile.warehouseName}</h1>
                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1 font-medium">
                            <MapPin className="w-3.5 h-3.5 text-gray-400" />
                            {profile.warehouseCity}، {profile.warehouseState}
                        </p>
                    </div>

                    {/* Bottom Row: 4 Metrics Grid inside the same rectangle */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-5">
                        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
                            <div>
                                <p className="text-xs text-black font-black">طلبات بانتظار التجهيز</p>
                                <p className="text-xl sm:text-2xl font-black text-black mt-1 font-mono">{pendingOrdersCount}</p>
                            </div>
                            <Package className="w-5 h-5 text-gray-700" />
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
                            <div>
                                <p className="text-xs text-black font-black">المناديب المسجلين</p>
                                <p className="text-xl sm:text-2xl font-black text-black mt-1 font-mono">{drivers.length}</p>
                            </div>
                            <Truck className="w-5 h-5 text-gray-700" />
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
                            <div>
                                <p className="text-xs text-black font-black">عهد نقدية للتأكيد</p>
                                <p className="text-xl sm:text-2xl font-black text-black mt-1 font-mono">{pendingRemittancesCount}</p>
                            </div>
                            <Banknote className="w-5 h-5 text-gray-700" />
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
                            <div>
                                <p className="text-xs text-black font-black">تنبيهات نقص المخزون</p>
                                <p className="text-xl sm:text-2xl font-black text-black mt-1 font-mono">{lowCount}</p>
                            </div>
                            <AlertTriangle className="w-5 h-5 text-gray-700" />
                        </div>
                    </div>
                </div>
            )}

            {success && <div className="mb-4"><Notice kind="success">{success}</Notice></div>}
            {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}

            {/* Navigation Tabs - White text inside Black on highlight */}
            <div className="bg-white rounded-lg border border-gray-200 p-1 shadow-xs mb-6 flex flex-wrap gap-1">
                <button
                    type="button"
                    onClick={() => setTab('orders')}
                    className={cn(
                        'flex-1 min-w-[130px] py-2.5 px-4 rounded-md text-xs sm:text-sm font-bold transition-colors flex items-center justify-center gap-2',
                        tab === 'orders'
                            ? 'bg-black text-white'
                            : 'text-gray-700 hover:bg-gray-100'
                    )}
                >
                    <Package className="w-4 h-4" />
                    <span>الطلبات والتجهيز</span>
                    <span className={cn(
                        'px-2 py-0.2 rounded-md text-xs font-mono font-bold',
                        tab === 'orders' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-800'
                    )}>
                        {orders.length}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => setTab('drivers')}
                    className={cn(
                        'flex-1 min-w-[130px] py-2.5 px-4 rounded-md text-xs sm:text-sm font-bold transition-colors flex items-center justify-center gap-2',
                        tab === 'drivers'
                            ? 'bg-black text-white'
                            : 'text-gray-700 hover:bg-gray-100'
                    )}
                >
                    <Truck className="w-4 h-4" />
                    <span>فريق المناديب</span>
                    <span className={cn(
                        'px-2 py-0.2 rounded-md text-xs font-mono font-bold',
                        tab === 'drivers' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-800'
                    )}>
                        {drivers.length}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => setTab('remittances')}
                    className={cn(
                        'flex-1 min-w-[130px] py-2.5 px-4 rounded-md text-xs sm:text-sm font-bold transition-colors flex items-center justify-center gap-2',
                        tab === 'remittances'
                            ? 'bg-black text-white'
                            : 'text-gray-700 hover:bg-gray-100'
                    )}
                >
                    <Banknote className="w-4 h-4" />
                    <span>تسليم العهد النقدية</span>
                    {pendingRemittancesCount > 0 && (
                        <span className={cn(
                            'px-2 py-0.2 rounded-md text-xs font-bold',
                            tab === 'remittances' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-900'
                        )}>
                            {pendingRemittancesCount}
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => setTab('inventory')}
                    className={cn(
                        'flex-1 min-w-[130px] py-2.5 px-4 rounded-md text-xs sm:text-sm font-bold transition-colors flex items-center justify-center gap-2',
                        tab === 'inventory'
                            ? 'bg-black text-white'
                            : 'text-gray-700 hover:bg-gray-100'
                    )}
                >
                    <Package className="w-4 h-4" />
                    <span>مخزون المنتجات</span>
                    {lowCount > 0 && (
                        <span className={cn(
                            'px-2 py-0.2 rounded-md text-xs font-bold',
                            tab === 'inventory' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-900'
                        )}>
                            {lowCount}
                        </span>
                    )}
                </button>
            </div>

            {/* TAB 1: ORDERS & PACKING */}
            {tab === 'orders' && (
                <div className="space-y-4">
                    {/* Search & Filter Header */}
                    <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-xs flex flex-col md:flex-row gap-3 items-stretch justify-between">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                value={orderSearch}
                                onChange={(e) => setOrderSearch(e.target.value)}
                                placeholder="بحث برقم الطلب، اسم العميل، الهاتف، أو المندوب..."
                                className="w-full pl-4 pr-10 py-2.5 rounded-lg border border-gray-200 bg-gray-50/60 text-xs sm:text-sm font-medium focus:border-black focus:bg-white outline-hidden transition-all text-gray-900"
                            />
                            <Search className="w-4 h-4 text-gray-400 absolute right-3.5 top-3" />
                        </div>

                        <div className="flex gap-1.5 overflow-x-auto pb-0.5 items-center">
                            {(['all', 'new', 'confirmed', 'preparing', 'shipped'] as const).map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setStatusFilter(s)}
                                    className={cn(
                                        'px-3 py-1.5 rounded-md text-xs font-bold whitespace-nowrap transition-colors',
                                        statusFilter === s
                                            ? 'bg-black text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    )}
                                >
                                    {s === 'all' ? 'الكل' : STATUS_CONFIG[s]?.label || s}
                                </button>
                            ))}
                        </div>
                    </div>

                    {filteredOrders.length === 0 ? (
                        <EmptyState
                            title="لا توجد طلبات مطابقة"
                            body="لم يتم العثور على طلبات في هذا المستودع وفقاً لمعايير البحث الحالية."
                        />
                    ) : (
                        <div className="space-y-3">
                            {filteredOrders.map((o) => {
                                const isExpanded = !!expandedOrders[o.id];
                                const isBusy = !!actionBusy[o.id];
                                const custPhoneClean = cleanPhone(o.phone);
                                const custWhatsappUrl = `https://wa.me/${custPhoneClean}?text=${encodeURIComponent(
                                    `مرحباً ${o.customerName}، معكم إدارة مستودع تيبس لمستحضرات التجميل بخصوص طلبكم رقم (${o.orderNumber}).`
                                )}`;

                                const currentNotes = editingNotes[o.id] !== undefined ? editingNotes[o.id] : (o.notes || '');

                                return (
                                    <div
                                        key={o.id}
                                        className="bg-white rounded-lg border border-gray-200 shadow-xs hover:border-gray-400 transition-colors overflow-hidden"
                                    >
                                        {/* Order Summary Header */}
                                        <div
                                            onClick={() => toggleOrderExpanded(o.id)}
                                            className="p-4 sm:p-5 cursor-pointer hover:bg-gray-50/60 transition-colors select-none"
                                        >
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center gap-2.5 flex-wrap">
                                                        <span className="font-mono font-bold text-gray-900 text-sm sm:text-base">
                                                            #{o.orderNumber}
                                                        </span>
                                                        <StatusPill tone={STATUS_CONFIG[o.status]?.tone || 'neutral'}>
                                                            {STATUS_CONFIG[o.status]?.label || o.status}
                                                        </StatusPill>
                                                        <span className="text-xs text-gray-500 flex items-center gap-1 font-medium">
                                                            <Clock className="w-3 h-3 text-gray-400" />
                                                            {formatDateTime(o.createdAt)}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-2.5 flex-wrap text-sm font-bold text-gray-900">
                                                        <span>{o.customerName}</span>
                                                        <span className="text-gray-300">•</span>
                                                        <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
                                                            <MapPin className="w-3.5 h-3.5 text-gray-400" />
                                                            {[o.city, o.state].filter(Boolean).join(' - ') || o.shippingAddress}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-100">
                                                    <div className="text-left sm:text-right">
                                                        <span className="text-[10px] text-gray-400 font-bold block">إجمالي الطلب</span>
                                                        <span className="text-base sm:text-lg font-black text-gray-900 font-mono" dir="ltr">
                                                            {formatSDG(o.total)}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2.5 py-1 rounded-md">
                                                            {o.itemCount} قطع
                                                        </span>
                                                        <div className="p-1.5 text-gray-500 hover:text-black rounded-md transition-colors">
                                                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Driver assignment quick strip */}
                                            {(() => {
                                                const driverDisplayName = o.driverName || (o.driverId ? drivers.find((d) => d.id === o.driverId)?.name : null);
                                                return (
                                                    <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs">
                                                        <div className="flex items-center gap-1.5 font-medium">
                                                            <span className="text-gray-500 font-bold">المندوب:</span>
                                                            {driverDisplayName ? (
                                                                <span className="text-gray-900 font-bold bg-gray-100 px-2 py-0.5 rounded-md">
                                                                    {driverDisplayName}
                                                                </span>
                                                            ) : (
                                                                <span className="text-gray-500 font-medium">
                                                                    لم يُسند بعد
                                                                </span>
                                                            )}
                                                        </div>

                                                        <span className="text-xs font-bold text-gray-700 hover:text-black">
                                                            {isExpanded ? 'إخفاء التفاصيل' : 'عرض التفاصيل والتجهيز ←'}
                                                        </span>
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* Expanded Detailed View */}
                                        {isExpanded && (
                                            <div className="p-4 sm:p-5 border-t border-gray-200 bg-gray-50/40 space-y-4">
                                                {/* 1. Customer & Delivery Info */}
                                                <div className="bg-white rounded-lg p-4 border border-gray-200 space-y-3">
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-gray-100">
                                                        <div>
                                                            <h3 className="font-bold text-gray-900 text-xs sm:text-sm">بيانات العميل والتوصيل</h3>
                                                            <p className="text-xs text-gray-500">{o.customerName} · {o.phone}</p>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            <a
                                                                href={`tel:${o.phone}`}
                                                                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200 font-bold text-xs transition-colors"
                                                            >
                                                                <Phone className="w-3.5 h-3.5" />
                                                                اتصال
                                                            </a>
                                                            <a
                                                                href={custWhatsappUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 font-bold text-xs transition-colors"
                                                            >
                                                                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                                                                واتساب
                                                            </a>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                                        <div>
                                                            <span className="text-gray-400 font-bold block">العنوان:</span>
                                                            <p className="text-gray-900 font-medium mt-0.5">
                                                                {o.shippingAddress} {o.city ? `، ${o.city}` : ''} {o.state ? `، ${o.state}` : ''}
                                                            </p>
                                                        </div>

                                                        <div>
                                                            <span className="text-gray-400 font-bold block">طريقة الدفع:</span>
                                                            <p className="text-gray-900 font-medium mt-0.5">
                                                                {o.paymentMethod === 'COD' ? 'الدفع عند الاستلام (COD)' : o.paymentMethod}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Delivery Notes Box */}
                                                    <div className="pt-2 border-t border-gray-100 flex gap-2 items-center">
                                                        <input
                                                            type="text"
                                                            value={currentNotes}
                                                            onChange={(e) =>
                                                                setEditingNotes((prev) => ({
                                                                    ...prev,
                                                                    [o.id]: e.target.value,
                                                                }))
                                                            }
                                                            placeholder="ملاحظات التوصيل أو الموعد المفضل..."
                                                            className="flex-1 px-3 py-1.5 text-xs rounded-md border border-gray-200 focus:border-black outline-hidden"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleSaveOrderNotes(o.id)}
                                                            disabled={isBusy}
                                                            className="px-3.5 py-1.5 bg-black text-white hover:bg-gray-800 text-xs font-bold rounded-md transition-colors"
                                                        >
                                                            حفظ
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* 2. Products and Packing Checklist */}
                                                <div className="bg-white rounded-lg p-4 border border-gray-200 space-y-3">
                                                    <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                                                        <h3 className="font-bold text-gray-900 text-xs sm:text-sm">
                                                            محتويات الشحنة ({o.itemCount} قطع)
                                                        </h3>
                                                        <span className="text-xs text-gray-500 font-medium">فحص الأصناف</span>
                                                    </div>

                                                    <div className="divide-y divide-gray-100">
                                                        {o.items.map((item, itemIdx) => {
                                                            const img = getProductImageUrl(item, 160);
                                                            const isChecked = !!packingChecked[o.id]?.[itemIdx];
                                                            const unitPrice = item.unit_price;
                                                            const lineTotal = item.line_total ?? (unitPrice ? unitPrice * item.quantity : null);

                                                            return (
                                                                <div
                                                                    key={itemIdx}
                                                                    onClick={() => togglePackingItem(o.id, itemIdx)}
                                                                    className={cn(
                                                                        'py-2.5 px-2 flex items-center gap-3 cursor-pointer rounded-md transition-colors select-none',
                                                                        isChecked ? 'bg-gray-50 text-gray-400' : 'hover:bg-gray-50'
                                                                    )}
                                                                >
                                                                    {/* Checkbox */}
                                                                    <div className="shrink-0">
                                                                        {isChecked ? (
                                                                            <CheckSquare className="w-5 h-5 text-emerald-600" />
                                                                        ) : (
                                                                            <Square className="w-5 h-5 text-gray-300" />
                                                                        )}
                                                                    </div>

                                                                    {/* Product Image */}
                                                                    <div className="w-12 h-12 rounded-md bg-white border border-gray-200 shrink-0 overflow-hidden flex items-center justify-center p-0.5">
                                                                        {img ? (
                                                                            <img
                                                                                src={img}
                                                                                alt={item.name_ar || 'منتج'}
                                                                                className="w-full h-full object-contain"
                                                                            />
                                                                        ) : (
                                                                            <Package className="w-5 h-5 text-gray-300" />
                                                                        )}
                                                                    </div>

                                                                    {/* Product Details */}
                                                                    <div className="min-w-0 flex-1">
                                                                        <p className={cn(
                                                                            'font-bold text-xs sm:text-sm text-gray-900',
                                                                            isChecked ? 'line-through text-gray-400' : ''
                                                                        )}>
                                                                            {item.name_ar || 'منتج'}
                                                                        </p>
                                                                        {item.variant_name && (
                                                                            <p className="text-[11px] text-gray-500 mt-0.5">
                                                                                {item.variant_name}
                                                                            </p>
                                                                        )}
                                                                    </div>

                                                                    {/* Quantity */}
                                                                    <div className="text-left shrink-0">
                                                                        <span className="font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-md text-xs">
                                                                            × {item.quantity}
                                                                        </span>
                                                                        {lineTotal != null && (
                                                                            <p className="text-xs font-mono font-bold text-gray-600 mt-0.5" dir="ltr">
                                                                                {formatSDG(lineTotal)}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* 3. Driver Assignment & Action */}
                                                <div className="bg-white rounded-lg p-4 border border-gray-200 space-y-3">
                                                    <h3 className="font-bold text-gray-900 text-xs sm:text-sm">
                                                        إسناد لمندوب التوصيل وتحديث الحالة
                                                    </h3>

                                                    <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
                                                        <select
                                                            value={selectedDrivers[o.id] || o.driverId || ''}
                                                            onChange={(e) =>
                                                                setSelectedDrivers((prev) => ({
                                                                    ...prev,
                                                                    [o.id]: e.target.value,
                                                                }))
                                                            }
                                                            className="flex-1 px-3 py-2 text-xs rounded-md border border-gray-200 bg-white focus:border-black outline-hidden text-gray-900"
                                                        >
                                                            <option value="">-- اختيار المندوب --</option>
                                                            {drivers.map((d) => (
                                                                <option key={d.id} value={d.id}>
                                                                    {d.name} ({d.phone})
                                                                </option>
                                                            ))}
                                                        </select>

                                                        <button
                                                            type="button"
                                                            onClick={() => void handleAssignDriver(o.id)}
                                                            disabled={isBusy || !selectedDrivers[o.id]}
                                                            className="px-4 py-2 bg-black hover:bg-gray-800 disabled:opacity-40 text-white font-bold text-xs rounded-md transition-colors shrink-0 flex items-center justify-center gap-1.5"
                                                        >
                                                            <UserCheck className="w-4 h-4" />
                                                            إسناد للمندوب
                                                        </button>
                                                    </div>

                                                    {/* Clean Status Transitions */}
                                                    <div className="pt-2 border-t border-gray-100 flex items-center gap-2 flex-wrap text-xs">
                                                        <span className="text-gray-500 font-bold">تحديث الحالة:</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleStatusTransition(o.id, 'preparing')}
                                                            disabled={isBusy || o.status === 'preparing'}
                                                            className="px-3 py-1 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-800 font-bold transition-colors disabled:opacity-40"
                                                        >
                                                            قيد التجهيز
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleStatusTransition(o.id, 'shipped')}
                                                            disabled={isBusy || o.status === 'shipped'}
                                                            className="px-3 py-1 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-800 font-bold transition-colors disabled:opacity-40"
                                                        >
                                                            في الطريق
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleStatusTransition(o.id, 'delivered')}
                                                            disabled={isBusy || o.status === 'delivered'}
                                                            className="px-3 py-1 rounded-md border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold transition-colors disabled:opacity-40"
                                                        >
                                                            تم التسليم ✓
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2: DRIVERS & FLEET */}
            {tab === 'drivers' && (
                <div className="space-y-4">
                    <div className="bg-white p-3.5 rounded-lg border border-gray-200 shadow-xs">
                        <div className="relative">
                            <input
                                type="text"
                                value={driverSearch}
                                onChange={(e) => setDriverSearch(e.target.value)}
                                placeholder="بحث باسم المندوب أو رقم الهاتف..."
                                className="w-full pl-4 pr-10 py-2.5 rounded-lg border border-gray-200 bg-gray-50/60 text-xs sm:text-sm font-medium focus:border-black focus:bg-white outline-hidden text-gray-900"
                            />
                            <Search className="w-4 h-4 text-gray-400 absolute right-3.5 top-3" />
                        </div>
                    </div>

                    {filteredDrivers.length === 0 ? (
                        <EmptyState
                            title="لا يوجد مناديب مسجلين"
                            body="لم يتم العثور على مناديب توصيل مسجلين في هذا المستودع."
                        />
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {filteredDrivers.map((drv) => {
                                const cleanDrvPhone = cleanPhone(drv.phone);
                                const drvWaUrl = `https://wa.me/${cleanDrvPhone}?text=${encodeURIComponent(
                                    `مرحباً ${drv.name}، معك مشرف مستودع تيبس لمستحضرات التجميل.`
                                )}`;

                                return (
                                    <div
                                        key={drv.id}
                                        className="p-4 bg-white rounded-lg border border-gray-200 shadow-xs space-y-3"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="font-bold text-gray-900 text-sm sm:text-base">{drv.name}</h3>
                                                <p className="text-xs text-gray-500 font-mono mt-0.5" dir="ltr">{drv.phone}</p>
                                            </div>
                                            <span className={cn(
                                                'px-2 py-0.5 rounded-md text-xs font-bold',
                                                drv.status === 'active' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                                                drv.status === 'busy' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                                                'bg-gray-100 text-gray-600 border border-gray-200'
                                            )}>
                                                {drv.status === 'active' ? 'متاح' : drv.status === 'busy' ? 'في مهمة' : 'غير متاح'}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between pt-2.5 border-t border-gray-100 text-xs">
                                            <span className="text-gray-500">
                                                طلبات نشطة: <strong className="text-gray-900 font-mono">{drv.activeDeliveries ?? 0}</strong>
                                            </span>

                                            <div className="flex items-center gap-1.5">
                                                <a
                                                    href={`tel:${drv.phone}`}
                                                    className="px-2.5 py-1 rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200 font-bold transition-colors"
                                                >
                                                    اتصال
                                                </a>
                                                <a
                                                    href={drvWaUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 font-bold transition-colors"
                                                >
                                                    واتساب
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* TAB 3: CASH REMITTANCES */}
            {tab === 'remittances' && (
                <div className="space-y-4">
                    {remittances.length === 0 ? (
                        <EmptyState
                            title="لا توجد تسليمات نقدية مسجلة"
                            body="لم يقم أي مندوب بتسجيل تسليم عهدة نقدية بعد في هذا المستودع."
                        />
                    ) : (
                        <div className="space-y-3">
                            {remittances.map((rem) => {
                                const isPending = rem.status === 'submitted';

                                return (
                                    <div
                                        key={rem.id}
                                        className="p-4 bg-white rounded-lg border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                                    >
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2.5">
                                                <span className="font-bold text-gray-900 text-sm sm:text-base">
                                                    {rem.driverName || 'مندوب التوصيل'}
                                                </span>
                                                <span className={cn(
                                                    'px-2 py-0.5 rounded-md text-xs font-bold',
                                                    isPending ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                                                )}>
                                                    {isPending ? 'بانتظار التأكيد' : 'تم التأكيد ✓'}
                                                </span>
                                            </div>

                                            <p className="text-xs text-gray-500 font-medium">
                                                وقت التسجيل: {formatDateTime(rem.submittedAt)}
                                            </p>

                                            {rem.driverNotes && (
                                                <p className="text-xs text-gray-700 bg-gray-50 p-2 rounded-md mt-1">
                                                    <strong className="text-gray-900">ملاحظة:</strong> {rem.driverNotes}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                                            <div className="text-left sm:text-right">
                                                <p className="text-[10px] text-gray-400 font-bold">المبلغ</p>
                                                <p className="text-lg font-black text-gray-900 font-mono" dir="ltr">
                                                    {formatSDG(rem.amount)}
                                                </p>
                                            </div>

                                            {isPending && (
                                                <button
                                                    type="button"
                                                    onClick={() => void handleConfirmRemittance(rem.id)}
                                                    className="py-2 px-4 rounded-md bg-black hover:bg-gray-800 text-white font-bold text-xs transition-colors"
                                                >
                                                    تأكيد الاستلام
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* TAB 4: INVENTORY */}
            {tab === 'inventory' && (
                <div className="space-y-4">
                    {/* Search & Filter */}
                    <div className="bg-white p-3.5 rounded-lg border border-gray-200 shadow-xs flex flex-col sm:flex-row gap-3 justify-between items-stretch">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                value={inventorySearch}
                                onChange={(e) => setInventorySearch(e.target.value)}
                                placeholder="بحث عن منتج في المستودع..."
                                className="w-full pl-4 pr-10 py-2.5 rounded-lg border border-gray-200 bg-gray-50/60 text-xs sm:text-sm font-medium focus:border-black focus:bg-white outline-hidden text-gray-900"
                            />
                            <Search className="w-4 h-4 text-gray-400 absolute right-3.5 top-3" />
                        </div>

                        <button
                            type="button"
                            onClick={() => setLowStockOnly(!lowStockOnly)}
                            className={cn(
                                'px-4 py-2 rounded-md text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 shrink-0',
                                lowStockOnly
                                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                            )}
                        >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            المخزون المنخفض ({lowCount})
                        </button>
                    </div>

                    {filteredInventory.length === 0 ? (
                        <EmptyState
                            title="لا توجد منتجات مطابقة"
                            body="لم يتم العثور على منتجات تطابق البحث في هذا المستودع."
                        />
                    ) : (
                        <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-right text-xs sm:text-sm">
                                    <thead className="bg-gray-50 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                                        <tr>
                                            <th className="px-4 py-3">المنتج</th>
                                            <th className="px-4 py-3 text-center">الكمية المتوفرة</th>
                                            <th className="px-4 py-3 text-center">حد إعادة الطلب</th>
                                            <th className="px-4 py-3 text-center">الحالة</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredInventory.map((row) => {
                                            const img = getProductImageUrl({
                                                id: row.productId,
                                                name_ar: row.productName,
                                                imageUrl: row.imageUrl,
                                            }, 120);

                                            return (
                                                <tr
                                                    key={row.productId}
                                                    className={cn(
                                                        'hover:bg-gray-50 transition-colors',
                                                        row.isLow ? 'bg-rose-50/20' : ''
                                                    )}
                                                >
                                                    <td className="px-4 py-3 font-medium text-gray-900">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-md bg-white border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center p-0.5">
                                                                {img ? (
                                                                    <img
                                                                        src={img}
                                                                        alt={row.productName}
                                                                        className="w-full h-full object-contain"
                                                                    />
                                                                ) : (
                                                                    <Package className="w-4 h-4 text-gray-300" />
                                                                )}
                                                            </div>
                                                            <span className="font-bold text-gray-900 text-xs sm:text-sm">
                                                                {row.productName}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    <td className="px-4 py-3 text-center">
                                                        <span className={cn(
                                                            'font-mono font-bold text-sm px-2.5 py-0.5 rounded-md inline-block',
                                                            row.isLow ? 'bg-rose-100 text-rose-800' : 'bg-gray-100 text-gray-900'
                                                        )}>
                                                            {row.quantity}
                                                        </span>
                                                    </td>

                                                    <td className="px-4 py-3 text-center text-gray-500 font-mono text-xs">
                                                        {row.reorderLevel}
                                                    </td>

                                                    <td className="px-4 py-3 text-center">
                                                        {row.isLow ? (
                                                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                                                                <AlertTriangle className="w-3 h-3" /> منخفض
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-800 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                                                                متوفر
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </PageState>
    );
};

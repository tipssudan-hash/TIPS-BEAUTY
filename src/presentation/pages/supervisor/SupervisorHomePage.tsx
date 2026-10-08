import React, { useEffect, useState, useMemo } from 'react';
import {
    Package,
    AlertTriangle,
    RefreshCw,
    UserCheck,
    Truck,
    CheckCircle2,
    Phone,
    MessageCircle,
    MapPin,
    Search,
    Banknote,
    Warehouse,
    ChevronDown,
    ChevronUp,
    CheckSquare,
    Square,
    User,
    Save,
    Shield,
    Clock,
    Tag,
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
import { formatSDG, formatDateTime, formatRelative } from '@application/services/format';
import { errorMessage } from '@application/errors';
import { PageState, EmptyState, Spinner, Notice, inputClass, primaryButtonClass, Card, StatusPill, type StatusTone } from '../../components/ui';
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
            setSuccess('تم إسناد الطلب للمندوب وتحديث حالته للتجهيز والتوصيل.');
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
        const noteText = editingNotes[orderId];
        if (noteText === undefined) return;

        setActionBusy((prev) => ({ ...prev, [orderId]: true }));
        setError(null);
        setSuccess(null);
        try {
            await updateSupervisorOrderStatus(orderId, undefined, noteText);
            setSuccess('تم حفظ ملاحظات وموعد التوصيل بنجاح.');
            const updated = await fetchSupervisorOrders();
            setOrders(updated);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحديث الملاحظات.'));
        } finally {
            setActionBusy((prev) => ({ ...prev, [orderId]: false }));
        }
    };

    const handleConfirmRemittance = async (remittanceId: string) => {
        if (!window.confirm('هل أنت متأكد من استلام المبلغ النقدي بالكامل من المندوب وإغلاق العهدة؟')) return;

        setError(null);
        setSuccess(null);
        try {
            await confirmDriverCashRemittance(remittanceId);
            setSuccess('تم تأكيد استلام النقدية بنجاح وإغلاق عهدة المندوب!');
            const updated = await fetchWarehouseCashRemittances();
            setRemittances(updated);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تأكيد استلام النقدية.'));
        }
    };

    const cleanPhone = (phone: string) => {
        const clean = phone.replace(/[^0-9]/g, '');
        return clean.startsWith('0')
            ? `249${clean.slice(1)}`
            : clean.startsWith('249')
            ? clean
            : `249${clean}`;
    };

    const filteredOrders = useMemo(() => {
        return orders.filter((o) => {
            const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
            if (!matchesStatus) return false;
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
        return inventory.filter((i) => {
            if (lowStockOnly && !i.isLow) return false;
            if (!inventorySearch.trim()) return true;
            const q = inventorySearch.trim().toLowerCase();
            return i.productName.toLowerCase().includes(q);
        });
    }, [inventory, lowStockOnly, inventorySearch]);

    const filteredDrivers = useMemo(() => {
        if (!driverSearch.trim()) return drivers;
        const q = driverSearch.trim().toLowerCase();
        return drivers.filter((d) => d.name.toLowerCase().includes(q) || d.phone.includes(q));
    }, [drivers, driverSearch]);

    const lowCount = inventory.filter((i) => i.isLow).length;
    const pendingRemittancesCount = remittances.filter((r) => r.status === 'submitted').length;
    const pendingOrdersCount = orders.filter((o) => o.status === 'new' || o.status === 'confirmed').length;

    if (!profile) {
        return (
            <div className="max-w-xl mx-auto my-16 p-8 sm:p-10 bg-white rounded-card border border-brand-blue-soft text-center shadow-card space-y-5" dir="rtl">
                <div className="w-16 h-16 rounded-card bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200 shadow-xs">
                    <Shield className="w-8 h-8" />
                </div>
                <h2 className="font-black text-xl text-gray-900">هذا الحساب غير معين كمشرف مستودع</h2>
                <p className="text-sm text-gray-600 leading-relaxed font-medium">
                    لم يتم ربط حسابك بأي مستودع تشغيلي حتى الآن. يرجى من المسؤول الانتقال إلى لوحة تحكم الإدارة (Admin Portal) وتعيينك كمشرف مستودع من صفحة <strong className="text-brand-blue">المخازن والمشرفين</strong>.
                </p>
                <div className="pt-2">
                    <button
                        type="button"
                        onClick={() => void load()}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-control bg-brand-blue text-white text-xs font-bold shadow-card-glow hover:bg-brand-blue/90 active:scale-98 transition-all"
                    >
                        <RefreshCw className="w-4 h-4" /> إعادة التحقق من الصلاحيات
                    </button>
                </div>
            </div>
        );
    }

    return (
        <PageState loading={loading} error={error} onRetry={() => void load()} empty={false}>
            {/* Beauty Storefront Header Banner */}
            <div className="mb-8 bg-gradient-to-l from-brand-blue via-[#0066b2] to-[#004070] text-white rounded-card p-6 sm:p-8 shadow-card-glow relative overflow-hidden border border-brand-blue/30">
                <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-brand-green/20 rounded-full blur-2xl -ml-20 -mb-20 pointer-events-none" />
                
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-card bg-white/15 backdrop-blur-md text-white flex items-center justify-center border border-white/25 shadow-card">
                            <Warehouse className="w-8 h-8 text-white" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{profile.warehouseName}</h1>
                                <span className="px-2.5 py-0.5 rounded-full bg-brand-green/30 border border-brand-green/40 text-green-100 text-[11px] font-black">
                                    نشط
                                </span>
                            </div>
                            <p className="text-xs sm:text-sm text-blue-100 mt-1 flex items-center gap-1.5 font-medium">
                                <MapPin className="w-3.5 h-3.5 text-sky-200" />
                                {profile.warehouseCity}، {profile.warehouseState} · مركز التجهيز والتوزيع
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => void load()}
                        aria-label="تحديث البيانات"
                        className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-control bg-white/20 hover:bg-white/30 active:scale-95 text-xs font-black text-white transition-all backdrop-blur-sm border border-white/30 shadow-card shrink-0"
                    >
                        <RefreshCw className="w-4 h-4" /> تحديث البيانات
                    </button>
                </div>

                {/* KPI Metrics Dashboard */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-white/15">
                    <div className="bg-white/10 backdrop-blur-xs rounded-card p-4 border border-white/10 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-blue-100 font-bold">طلبات بانتظار التجهيز</p>
                            <p className="text-2xl font-black text-amber-300 mt-1">{pendingOrdersCount}</p>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-amber-400/20 flex items-center justify-center text-amber-300">
                            <Package className="w-5 h-5" />
                        </div>
                    </div>

                    <div className="bg-white/10 backdrop-blur-xs rounded-card p-4 border border-white/10 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-blue-100 font-bold">المناديب المسجلين</p>
                            <p className="text-2xl font-black text-sky-200 mt-1">{drivers.length}</p>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-sky-400/20 flex items-center justify-center text-sky-200">
                            <Truck className="w-5 h-5" />
                        </div>
                    </div>

                    <div className="bg-white/10 backdrop-blur-xs rounded-card p-4 border border-white/10 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-blue-100 font-bold">عهد نقدية للتأكيد</p>
                            <p className="text-2xl font-black text-emerald-300 mt-1">{pendingRemittancesCount}</p>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-emerald-400/20 flex items-center justify-center text-emerald-300">
                            <Banknote className="w-5 h-5" />
                        </div>
                    </div>

                    <div className="bg-white/10 backdrop-blur-xs rounded-card p-4 border border-white/10 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-blue-100 font-bold">تنبيهات انخفاض المخزون</p>
                            <p className="text-2xl font-black text-rose-300 mt-1">{lowCount}</p>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-rose-400/20 flex items-center justify-center text-rose-300">
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                    </div>
                </div>
            </div>

            {success && <div className="mb-6"><Notice kind="success">{success}</Notice></div>}
            {error && <div className="mb-6"><Notice kind="error">{error}</Notice></div>}

            {/* Navigation Tabs */}
            <div className="bg-white rounded-card border border-brand-blue-soft p-1.5 shadow-card mb-8 flex flex-wrap gap-1">
                <button
                    type="button"
                    onClick={() => setTab('orders')}
                    className={cn(
                        'flex-1 min-w-[140px] py-3 px-4 rounded-control text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2',
                        tab === 'orders'
                            ? 'bg-brand-blue text-white shadow-card-glow'
                            : 'text-gray-600 hover:text-brand-blue hover:bg-brand-blue-soft'
                    )}
                >
                    <Package className="w-4 h-4" />
                    <span>الطلبات والتجهيز</span>
                    <span className={cn(
                        'px-2 py-0.5 rounded-full text-[11px] font-bold',
                        tab === 'orders' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
                    )}>
                        {orders.length}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => setTab('drivers')}
                    className={cn(
                        'flex-1 min-w-[140px] py-3 px-4 rounded-control text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2',
                        tab === 'drivers'
                            ? 'bg-brand-blue text-white shadow-card-glow'
                            : 'text-gray-600 hover:text-brand-blue hover:bg-brand-blue-soft'
                    )}
                >
                    <Truck className="w-4 h-4" />
                    <span>فريق المناديب</span>
                    <span className={cn(
                        'px-2 py-0.5 rounded-full text-[11px] font-bold',
                        tab === 'drivers' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
                    )}>
                        {drivers.length}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => setTab('remittances')}
                    className={cn(
                        'flex-1 min-w-[140px] py-3 px-4 rounded-control text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2',
                        tab === 'remittances'
                            ? 'bg-brand-blue text-white shadow-card-glow'
                            : 'text-gray-600 hover:text-brand-blue hover:bg-brand-blue-soft'
                    )}
                >
                    <Banknote className="w-4 h-4" />
                    <span>تسليم العهد النقدية</span>
                    {pendingRemittancesCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 text-[10px] font-black animate-pulse">
                            {pendingRemittancesCount} جديد
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => setTab('inventory')}
                    className={cn(
                        'flex-1 min-w-[140px] py-3 px-4 rounded-control text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2',
                        tab === 'inventory'
                            ? 'bg-brand-blue text-white shadow-card-glow'
                            : 'text-gray-600 hover:text-brand-blue hover:bg-brand-blue-soft'
                    )}
                >
                    <Warehouse className="w-4 h-4" />
                    <span>مخزون المنتجات</span>
                    {lowCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black">
                            {lowCount} ناقص
                        </span>
                    )}
                </button>
            </div>

            {/* TAB 1: ORDERS & PACKING */}
            {tab === 'orders' && (
                <div className="space-y-6">
                    {/* Search & Filter Header */}
                    <div className="bg-white p-4 sm:p-5 rounded-card border border-brand-blue-soft shadow-card flex flex-col md:flex-row gap-4 items-stretch justify-between">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                value={orderSearch}
                                onChange={(e) => setOrderSearch(e.target.value)}
                                placeholder="بحث برقم الطلب، اسم العميل، رقم الهاتف، العنوان، أو اسم المندوب..."
                                className="w-full pl-4 pr-11 py-3 rounded-control border border-gray-200 bg-slate-50/50 text-xs sm:text-sm font-bold focus:border-brand-blue focus:bg-white focus:ring-2 focus:ring-brand-blue/20 outline-hidden transition-all shadow-xs"
                            />
                            <Search className="w-5 h-5 text-gray-400 absolute right-3.5 top-3.5" />
                        </div>

                        <div className="flex gap-2 overflow-x-auto pb-1 items-center">
                            {(['all', 'new', 'confirmed', 'preparing', 'shipped'] as const).map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setStatusFilter(s)}
                                    className={cn(
                                        'px-4 py-2.5 rounded-control text-xs font-black whitespace-nowrap transition-all',
                                        statusFilter === s
                                            ? 'bg-brand-blue text-white shadow-card-glow'
                                            : 'bg-slate-100/70 border border-gray-200/80 text-gray-700 hover:bg-brand-blue-soft hover:text-brand-blue'
                                    )}
                                >
                                    {s === 'all' ? 'جميع الطلبات' : STATUS_CONFIG[s]?.label || s}
                                </button>
                            ))}
                        </div>
                    </div>

                    {filteredOrders.length === 0 ? (
                        <EmptyState
                            icon={<Package className="w-12 h-12 text-gray-300" />}
                            title="لا توجد طلبات مطابقة"
                            body="لم يتم العثور على طلبات في هذا المستودع وفقاً لمعايير البحث الحالية."
                        />
                    ) : (
                        <div className="space-y-5">
                            {filteredOrders.map((o) => {
                                const isExpanded = !!expandedOrders[o.id];
                                const isBusy = !!actionBusy[o.id];
                                const custPhoneClean = cleanPhone(o.phone);
                                const custWhatsappUrl = `https://wa.me/${custPhoneClean}?text=${encodeURIComponent(
                                    `مرحباً ${o.customerName}، معكم إدارة مستودع تيبس لمستحضرات التجميل بخصوص طلبكم رقم (${o.orderNumber}).`
                                )}`;

                                const driverPhoneClean = o.driverPhone ? cleanPhone(o.driverPhone) : '';
                                const driverWhatsappUrl = driverPhoneClean
                                    ? `https://wa.me/${driverPhoneClean}?text=${encodeURIComponent(
                                          `مرحباً ${o.driverName}، متابعة بخصوص تسليم طلب العميل ${o.customerName} رقم (${o.orderNumber}).`
                                      )}`
                                    : '';

                                const currentNotes = editingNotes[o.id] !== undefined ? editingNotes[o.id] : (o.notes || '');

                                return (
                                    <Card
                                        key={o.id}
                                        className={cn(
                                            'overflow-hidden transition-all duration-200 border border-brand-blue-soft shadow-card hover:shadow-card-glow',
                                            isExpanded ? 'ring-2 ring-brand-blue/30' : ''
                                        )}
                                    >
                                        {/* Order Summary Card Header (Storefront Style) */}
                                        <div
                                            onClick={() => toggleOrderExpanded(o.id)}
                                            className="p-5 sm:p-6 cursor-pointer hover:bg-slate-50/70 transition-colors select-none"
                                        >
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-3 flex-wrap">
                                                        <span className="font-mono font-black text-gray-900 text-base sm:text-lg">
                                                            #{o.orderNumber}
                                                        </span>
                                                        <StatusPill tone={STATUS_CONFIG[o.status]?.tone || 'neutral'}>
                                                            {STATUS_CONFIG[o.status]?.label || o.status}
                                                        </StatusPill>
                                                        <span className="text-xs font-bold text-gray-500 flex items-center gap-1">
                                                            <Clock className="w-3.5 h-3.5" />
                                                            {formatDateTime(o.createdAt)}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-3 flex-wrap text-sm font-bold text-gray-900">
                                                        <span className="text-base text-gray-950">{o.customerName}</span>
                                                        <span className="text-gray-300">•</span>
                                                        <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
                                                            <MapPin className="w-3.5 h-3.5 text-brand-blue" />
                                                            {[o.city, o.state].filter(Boolean).join(' - ') || o.shippingAddress}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-gray-100">
                                                    <div className="text-left sm:text-right">
                                                        <span className="text-[11px] text-gray-400 font-bold block">إجمالي الطلب</span>
                                                        <span className="text-lg sm:text-xl font-black text-brand-blue font-mono" dir="ltr">
                                                            {formatSDG(o.total)}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold text-gray-600 bg-brand-blue-soft px-3 py-1.5 rounded-control">
                                                            {o.itemCount} قطع
                                                        </span>
                                                        <div className="p-2 text-gray-400 hover:text-brand-blue rounded-control hover:bg-brand-blue-soft transition-colors">
                                                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Driver assignment quick strip */}
                                            <div className="mt-4 pt-3 border-t border-gray-100/80 flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-2 font-medium">
                                                    <span className="text-gray-500 font-bold">المندوب:</span>
                                                    {o.driverName ? (
                                                        <span className="text-brand-blue font-bold bg-brand-blue-soft px-2.5 py-1 rounded-control flex items-center gap-1.5">
                                                            <Truck className="w-3.5 h-3.5" />
                                                            {o.driverName}
                                                        </span>
                                                    ) : (
                                                        <span className="text-amber-800 font-bold bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-control">
                                                            لم يُسند لمندوب بعد
                                                        </span>
                                                    )}
                                                </div>

                                                <span className="text-[11px] text-brand-blue font-bold underline">
                                                    {isExpanded ? 'إخفاء التفاصيل والتجهيز' : 'عرض محتويات الشحنة والتجهيز ←'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Expanded Detailed View */}
                                        {isExpanded && (
                                            <div className="p-5 sm:p-6 border-t border-brand-blue-soft bg-slate-50/40 space-y-6">
                                                {/* 1. Customer & Delivery Information Card */}
                                                <div className="bg-white rounded-card p-5 border border-brand-blue-soft shadow-xs space-y-4">
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="w-8 h-8 rounded-control bg-brand-blue-soft text-brand-blue flex items-center justify-center">
                                                                <User className="w-4 h-4" />
                                                            </div>
                                                            <div>
                                                                <h3 className="font-black text-gray-900 text-sm">بيانات العميل والتوصيل</h3>
                                                                <p className="text-xs text-gray-500">{o.customerName} · {o.phone}</p>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            <a
                                                                href={`tel:${o.phone}`}
                                                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-control bg-sky-50 text-sky-800 border border-sky-200 font-bold text-xs hover:bg-sky-100 transition-colors"
                                                            >
                                                                <Phone className="w-3.5 h-3.5 text-sky-600" />
                                                                اتصال بالعميل
                                                            </a>
                                                            <a
                                                                href={custWhatsappUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-control bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-xs hover:bg-emerald-100 transition-colors"
                                                            >
                                                                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                                                                واتساب
                                                            </a>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-medium">
                                                        <div className="space-y-1">
                                                            <span className="text-gray-400 font-bold block">عنوان التوصيل المسجل:</span>
                                                            <p className="text-gray-900 font-bold text-sm flex items-start gap-1.5">
                                                                <MapPin className="w-4 h-4 text-brand-blue shrink-0 mt-0.5" />
                                                                <span>{o.shippingAddress} {o.city ? `، ${o.city}` : ''} {o.state ? `، ${o.state}` : ''}</span>
                                                            </p>
                                                        </div>

                                                        <div className="space-y-1">
                                                            <span className="text-gray-400 font-bold block">طريقة وحالة الدفع:</span>
                                                            <div className="flex items-center gap-2 text-gray-800 font-bold">
                                                                <span>{o.paymentMethod === 'COD' ? 'الدفع عند الاستلام (COD)' : o.paymentMethod}</span>
                                                                <StatusPill tone={o.paymentStatus === 'paid' ? 'success' : 'attention'}>
                                                                    {o.paymentStatus === 'paid' ? 'تم الدفع' : 'بانتظار التحصيل'}
                                                                </StatusPill>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Delivery Notes / Special Timing Box */}
                                                    <div className="pt-3 border-t border-gray-100 space-y-2">
                                                        <label className="block text-xs font-bold text-gray-700">
                                                            ملاحظات التوصيل أو الموعد المفضل:
                                                        </label>
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                value={currentNotes}
                                                                onChange={(e) =>
                                                                    setEditingNotes((prev) => ({
                                                                        ...prev,
                                                                        [o.id]: e.target.value,
                                                                    }))
                                                                }
                                                                placeholder="مثال: التوصيل مساءً بعد الساعة 5، أو عمارة كذا شقة كذا..."
                                                                className={inputClass}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleSaveOrderNotes(o.id)}
                                                                disabled={isBusy}
                                                                className={cn(primaryButtonClass, 'px-5 py-2.5 text-xs shrink-0 flex items-center gap-1.5')}
                                                            >
                                                                <Save className="w-4 h-4" /> حفظ
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* 2. Products and Packing Checklist (Large, Visible, Customer Theme) */}
                                                <div className="bg-white rounded-card p-5 sm:p-6 border border-brand-blue-soft shadow-xs space-y-4">
                                                    <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="w-8 h-8 rounded-control bg-brand-blue-soft text-brand-blue flex items-center justify-center">
                                                                <Package className="w-4 h-4" />
                                                            </div>
                                                            <div>
                                                                <h3 className="font-black text-gray-900 text-sm sm:text-base">
                                                                    محتويات الشحنة للتجهيز ({o.itemCount} قطع)
                                                                </h3>
                                                                <p className="text-xs text-gray-500">تحقق من كل صنف أثناء تجهيز الشحنة في كيس التغليف</p>
                                                            </div>
                                                        </div>

                                                        <span className="text-xs font-black text-brand-blue bg-brand-blue-soft px-3 py-1.5 rounded-control">
                                                            قائمة التحقق والتجهيز
                                                        </span>
                                                    </div>

                                                    <div className="divide-y divide-gray-100">
                                                        {o.items.map((item, itemIdx) => {
                                                            const img = getProductImageUrl(item, 200);
                                                            const isChecked = !!packingChecked[o.id]?.[itemIdx];
                                                            const unitPrice = item.unit_price;
                                                            const lineTotal = item.line_total ?? (unitPrice ? unitPrice * item.quantity : null);

                                                            return (
                                                                <div
                                                                    key={itemIdx}
                                                                    onClick={() => togglePackingItem(o.id, itemIdx)}
                                                                    className={cn(
                                                                        'py-4 px-3 flex items-center gap-4 cursor-pointer rounded-card transition-all select-none',
                                                                        isChecked ? 'bg-emerald-50/40 text-gray-500' : 'hover:bg-slate-50'
                                                                    )}
                                                                >
                                                                    {/* Interactive Checkbox */}
                                                                    <div className="shrink-0">
                                                                        {isChecked ? (
                                                                            <CheckSquare className="w-6 h-6 text-emerald-600 fill-emerald-100" />
                                                                        ) : (
                                                                            <Square className="w-6 h-6 text-gray-300 hover:text-brand-blue" />
                                                                        )}
                                                                    </div>

                                                                    {/* Large Visible Product Image */}
                                                                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-card bg-white border border-brand-blue-soft shrink-0 overflow-hidden shadow-xs flex items-center justify-center p-1">
                                                                        {img ? (
                                                                            <img
                                                                                src={img}
                                                                                alt={item.name_ar || 'منتج تجميل'}
                                                                                className="w-full h-full object-contain"
                                                                            />
                                                                        ) : (
                                                                            <Package className="w-8 h-8 text-gray-300" />
                                                                        )}
                                                                    </div>

                                                                    {/* Product Details */}
                                                                    <div className="min-w-0 flex-1 space-y-1">
                                                                        <p className={cn(
                                                                            'font-black text-sm sm:text-base text-gray-900 leading-snug',
                                                                            isChecked ? 'line-through text-gray-400' : ''
                                                                        )}>
                                                                            {item.name_ar || 'منتج تجميل'}
                                                                        </p>

                                                                        <div className="flex items-center gap-2 flex-wrap text-xs">
                                                                            {item.variant_name && (
                                                                                <span className="bg-slate-100 text-gray-700 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                                                                                    <Tag className="w-3 h-3 text-brand-blue" />
                                                                                    {item.variant_name}
                                                                                </span>
                                                                            )}

                                                                            {unitPrice != null && (
                                                                                <span className="text-gray-500 font-mono" dir="ltr">
                                                                                    {formatSDG(unitPrice)} للقطعة
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {/* Quantity & Line Total */}
                                                                    <div className="text-left shrink-0 space-y-1">
                                                                        <span className="inline-block font-black text-brand-blue bg-brand-blue-soft px-3 py-1.5 rounded-control text-xs sm:text-sm">
                                                                            × {item.quantity}
                                                                        </span>
                                                                        {lineTotal != null && (
                                                                            <p className="text-xs font-mono font-bold text-gray-600 block" dir="ltr">
                                                                                {formatSDG(lineTotal)}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* Order Totals Summary */}
                                                    <div className="pt-4 border-t border-gray-100 flex items-center justify-between font-bold text-sm bg-slate-50/70 p-3.5 rounded-control">
                                                        <span className="text-gray-700">إجمالي قيمة المنتجات المطلوب تحصيلها:</span>
                                                        <span className="text-base font-black text-brand-blue font-mono" dir="ltr">
                                                            {formatSDG(o.total)}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* 3. Assigned Driver & Dispatch Actions */}
                                                <div className="bg-white rounded-card p-5 sm:p-6 border border-brand-blue-soft shadow-xs space-y-4">
                                                    <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="w-8 h-8 rounded-control bg-sky-50 text-brand-blue flex items-center justify-center">
                                                                <Truck className="w-4 h-4" />
                                                            </div>
                                                            <div>
                                                                <h3 className="font-black text-gray-900 text-sm sm:text-base">
                                                                    إسناد لمندوب التوصيل وتحديث مسار الطلب
                                                                </h3>
                                                                <p className="text-xs text-gray-500">عيّن المندوب المسؤول وانقل الطلب لمرحلة التوصيل</p>
                                                            </div>
                                                        </div>

                                                        {o.driverName && (
                                                            <div className="flex items-center gap-2">
                                                                {o.driverPhone && (
                                                                    <a
                                                                        href={`tel:${o.driverPhone}`}
                                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-sky-50 text-sky-800 border border-sky-200 font-bold text-xs hover:bg-sky-100 transition-colors"
                                                                    >
                                                                        <Phone className="w-3.5 h-3.5 text-sky-600" />
                                                                        اتصال بالمندوب
                                                                    </a>
                                                                )}
                                                                {driverWhatsappUrl && (
                                                                    <a
                                                                        href={driverWhatsappUrl}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-colors shadow-xs"
                                                                    >
                                                                        <MessageCircle className="w-3.5 h-3.5" />
                                                                        واتساب المندوب
                                                                    </a>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                                                        <div className="sm:col-span-2">
                                                            <label className="block text-xs font-bold text-gray-700 mb-1.5">
                                                                اختيار المندوب المكلف من أسطول المستودع:
                                                            </label>
                                                            <select
                                                                value={selectedDrivers[o.id] || o.driverId || ''}
                                                                onChange={(e) =>
                                                                    setSelectedDrivers((prev) => ({
                                                                        ...prev,
                                                                        [o.id]: e.target.value,
                                                                    }))
                                                                }
                                                                className={inputClass}
                                                            >
                                                                <option value="">-- اضغط لاختيار المندوب --</option>
                                                                {drivers.map((d) => (
                                                                    <option key={d.id} value={d.id}>
                                                                        {d.name} ({d.phone}) - {d.status === 'active' ? 'متاح' : d.status === 'busy' ? 'في مهمة' : 'غير متاح'}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        <button
                                                            type="button"
                                                            onClick={() => void handleAssignDriver(o.id)}
                                                            disabled={isBusy || !selectedDrivers[o.id]}
                                                            className={cn(primaryButtonClass, 'w-full py-3 text-xs flex items-center justify-center gap-2')}
                                                        >
                                                            {isBusy ? <Spinner label="" /> : <UserCheck className="w-4 h-4" />}
                                                            إسناد للمندوب وبدء التجهيز
                                                        </button>
                                                    </div>

                                                    {/* Fast Status Change Buttons */}
                                                    <div className="pt-4 border-t border-gray-100 flex items-center gap-2 flex-wrap">
                                                        <span className="text-xs font-bold text-gray-600 ml-1">تحديث الحالة السريع:</span>
                                                        
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleStatusTransition(o.id, 'confirmed')}
                                                            disabled={isBusy || o.status === 'confirmed'}
                                                            className="px-4 py-2 rounded-control border border-indigo-200 bg-indigo-50 text-indigo-800 text-xs font-black hover:bg-indigo-100 disabled:opacity-40 transition-colors"
                                                        >
                                                            تأكيد الطلب
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => void handleStatusTransition(o.id, 'preparing')}
                                                            disabled={isBusy || o.status === 'preparing'}
                                                            className="px-4 py-2 rounded-control border border-amber-200 bg-amber-50 text-amber-800 text-xs font-black hover:bg-amber-100 disabled:opacity-40 transition-colors"
                                                        >
                                                            قيد التجهيز بالمستودع
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => void handleStatusTransition(o.id, 'shipped')}
                                                            disabled={isBusy || o.status === 'shipped'}
                                                            className="px-4 py-2 rounded-control border border-brand-blue-soft bg-sky-50 text-brand-blue text-xs font-black hover:bg-sky-100 disabled:opacity-40 transition-colors"
                                                        >
                                                            في الطريق للتوصيل
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => void handleStatusTransition(o.id, 'delivered')}
                                                            disabled={isBusy || o.status === 'delivered'}
                                                            className="px-4 py-2 rounded-control border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-black hover:bg-emerald-100 disabled:opacity-40 transition-colors"
                                                        >
                                                            تم التسليم للعميل ✓
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2: DRIVERS & FLEET */}
            {tab === 'drivers' && (
                <div className="space-y-6">
                    <div className="bg-white p-4 sm:p-5 rounded-card border border-brand-blue-soft shadow-card flex items-center justify-between">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                value={driverSearch}
                                onChange={(e) => setDriverSearch(e.target.value)}
                                placeholder="بحث باسم مندوب التوصيل أو رقم الهاتف..."
                                className="w-full pl-4 pr-11 py-3 rounded-control border border-gray-200 bg-slate-50/50 text-xs sm:text-sm font-bold focus:border-brand-blue focus:bg-white focus:ring-2 focus:ring-brand-blue/20 outline-hidden transition-all shadow-xs"
                            />
                            <Search className="w-5 h-5 text-gray-400 absolute right-3.5 top-3.5" />
                        </div>
                    </div>

                    {filteredDrivers.length === 0 ? (
                        <EmptyState
                            icon={<Truck className="w-12 h-12 text-gray-300" />}
                            title="لا يوجد مناديب مسجلين"
                            body="لم يتم العثور على مناديب توصيل مسجلين في هذا المستودع."
                        />
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                            {filteredDrivers.map((drv) => {
                                const cleanDrvPhone = cleanPhone(drv.phone);
                                const drvWaUrl = `https://wa.me/${cleanDrvPhone}?text=${encodeURIComponent(
                                    `مرحباً ${drv.name}، معك مشرف مستودع تيبس لمستحضرات التجميل.`
                                )}`;

                                return (
                                    <Card
                                        key={drv.id}
                                        className="p-5 sm:p-6 border border-brand-blue-soft shadow-card hover:shadow-card-glow transition-all space-y-4"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3.5">
                                                <div className="w-12 h-12 rounded-card bg-brand-blue-soft text-brand-blue flex items-center justify-center shrink-0 border border-brand-blue/20 shadow-xs">
                                                    <Truck className="w-6 h-6" />
                                                </div>
                                                <div>
                                                    <h3 className="font-black text-gray-900 text-base">{drv.name}</h3>
                                                    <p className="text-xs text-gray-500 font-mono mt-0.5" dir="ltr">{drv.phone}</p>
                                                </div>
                                            </div>

                                            <span
                                                className={cn(
                                                    'px-3 py-1 rounded-full text-xs font-black border',
                                                    drv.status === 'active'
                                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                        : drv.status === 'busy'
                                                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                                                        : 'bg-gray-100 text-gray-600 border-gray-200'
                                                )}
                                            >
                                                {drv.status === 'active' ? 'متاح للتوصيل' : drv.status === 'busy' ? 'في مهمة توصيل' : 'غير متاح'}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-xs">
                                            <span className="text-gray-500 font-bold">
                                                الطلبات النشطة: <strong className="text-brand-blue font-mono font-black text-sm">{drv.activeDeliveries ?? 0}</strong>
                                            </span>

                                            <div className="flex items-center gap-2">
                                                <a
                                                    href={`tel:${drv.phone}`}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-sky-50 text-sky-800 border border-sky-200 font-bold hover:bg-sky-100 transition-colors"
                                                >
                                                    <Phone className="w-3.5 h-3.5 text-sky-600" />
                                                    اتصال
                                                </a>
                                                <a
                                                    href={drvWaUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold hover:bg-emerald-100 transition-colors"
                                                >
                                                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                                                    واتساب
                                                </a>
                                            </div>
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* TAB 3: CASH REMITTANCES */}
            {tab === 'remittances' && (
                <div className="space-y-6">
                    <div className="p-5 rounded-card bg-amber-50/80 border border-amber-200 text-xs sm:text-sm text-amber-950 flex items-start sm:items-center gap-4 shadow-card">
                        <div className="w-10 h-10 rounded-card bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                            <Banknote className="w-6 h-6" />
                        </div>
                        <div className="space-y-0.5">
                            <p className="font-black text-sm sm:text-base">تسليم العهد النقدية المحصلة من المناديب (COD)</p>
                            <p className="text-amber-900 font-medium">
                                يقوم المندوب بتسجيل المبالغ المحصلة عند عودته للمستودع، ويقوم المشرف بمراجعتها وتأكيد الاستلام لإغلاق العهدة.
                            </p>
                        </div>
                    </div>

                    {remittances.length === 0 ? (
                        <EmptyState
                            icon={<Banknote className="w-12 h-12 text-gray-300" />}
                            title="لا توجد تسليمات نقدية مسجلة"
                            body="لم يقم أي مندوب بتسجيل تسليم عهدة نقدية بعد في هذا المستودع."
                        />
                    ) : (
                        <div className="space-y-4">
                            {remittances.map((rem) => {
                                const isPending = rem.status === 'submitted';

                                return (
                                    <Card
                                        key={rem.id}
                                        className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5 border border-brand-blue-soft shadow-card hover:shadow-card-glow transition-all"
                                    >
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-3">
                                                <span className="font-black text-gray-900 text-base sm:text-lg">
                                                    {rem.driverName || 'مندوب التوصيل'}
                                                </span>
                                                <span
                                                    className={cn(
                                                        'px-3 py-0.5 rounded-full text-xs font-black border',
                                                        isPending
                                                            ? 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse'
                                                            : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                                    )}
                                                >
                                                    {isPending ? 'بانتظار تأكيد المشرف' : 'تم استلام وتأكيد المبلغ ✓'}
                                                </span>
                                            </div>

                                            <p className="text-xs text-gray-500 font-medium flex items-center gap-2">
                                                <span>وقت التسجيل: {formatDateTime(rem.submittedAt)}</span>
                                                {rem.confirmedAt && (
                                                    <span>· تم التأكيد: {formatRelative(rem.confirmedAt)}</span>
                                                )}
                                            </p>

                                            {rem.driverNotes && (
                                                <p className="text-xs text-gray-700 bg-slate-50 p-3 rounded-control border border-gray-100 mt-1 font-medium">
                                                    <strong className="text-gray-900">ملاحظة المندوب:</strong> {rem.driverNotes}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                                            <div className="text-left sm:text-right">
                                                <p className="text-xs text-gray-400 font-bold">المبلغ المسلَّم</p>
                                                <p className="text-xl sm:text-2xl font-black text-emerald-700 font-mono" dir="ltr">
                                                    {formatSDG(rem.amount)}
                                                </p>
                                            </div>

                                            {isPending && (
                                                <button
                                                    type="button"
                                                    onClick={() => void handleConfirmRemittance(rem.id)}
                                                    className="flex items-center gap-2 py-3 px-6 rounded-control bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs shadow-card transition-all"
                                                >
                                                    <CheckCircle2 className="w-4 h-4" />
                                                    تأكيد استلام المبلغ
                                                </button>
                                            )}
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* TAB 4: INVENTORY WITH HD PRODUCT PHOTOS */}
            {tab === 'inventory' && (
                <div className="space-y-6">
                    {/* Search & Filter */}
                    <div className="bg-white p-4 sm:p-5 rounded-card border border-brand-blue-soft shadow-card flex flex-col sm:flex-row gap-4 justify-between items-stretch">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                value={inventorySearch}
                                onChange={(e) => setInventorySearch(e.target.value)}
                                placeholder="بحث عن منتج في المستودع بالاسم..."
                                className="w-full pl-4 pr-11 py-3 rounded-control border border-gray-200 bg-slate-50/50 text-xs sm:text-sm font-bold focus:border-brand-blue focus:bg-white focus:ring-2 focus:ring-brand-blue/20 outline-hidden transition-all shadow-xs"
                            />
                            <Search className="w-5 h-5 text-gray-400 absolute right-3.5 top-3.5" />
                        </div>

                        <button
                            type="button"
                            onClick={() => setLowStockOnly(!lowStockOnly)}
                            className={cn(
                                'px-5 py-3 rounded-control text-xs font-black border transition-all flex items-center justify-center gap-2 shrink-0',
                                lowStockOnly
                                    ? 'bg-rose-50 border-rose-300 text-rose-800 shadow-xs'
                                    : 'bg-white border-gray-200 text-gray-700 hover:bg-slate-50'
                            )}
                        >
                            <AlertTriangle className="w-4 h-4 text-rose-600" />
                            المخزون المنخفض فقط ({lowCount})
                        </button>
                    </div>

                    {filteredInventory.length === 0 ? (
                        <EmptyState
                            icon={<Package className="w-12 h-12 text-gray-300" />}
                            title="لا توجد منتجات مطابقة"
                            body="لم يتم العثور على منتجات تطابق البحث في هذا المستودع."
                        />
                    ) : (
                        <Card className="overflow-hidden border border-brand-blue-soft shadow-card">
                            <div className="overflow-x-auto">
                                <table className="w-full text-right text-xs sm:text-sm">
                                    <thead className="bg-slate-50 text-[11px] font-black text-gray-500 uppercase tracking-wider border-b border-gray-200">
                                        <tr>
                                            <th className="px-5 py-4">المنتج والصورة</th>
                                            <th className="px-5 py-4 text-center">الكمية المتوفرة بالمستودع</th>
                                            <th className="px-5 py-4 text-center">حد إعادة الطلب</th>
                                            <th className="px-5 py-4 text-center">حالة المخزون</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredInventory.map((row) => {
                                            const img = getProductImageUrl({
                                                id: row.productId,
                                                name_ar: row.productName,
                                                imageUrl: row.imageUrl,
                                            }, 160);

                                            return (
                                                <tr
                                                    key={row.productId}
                                                    className={cn(
                                                        'hover:bg-slate-50/70 transition-colors',
                                                        row.isLow ? 'bg-rose-50/30' : ''
                                                    )}
                                                >
                                                    <td className="px-5 py-4 font-medium text-gray-900">
                                                        <div className="flex items-center gap-3.5">
                                                            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-card bg-white border border-brand-blue-soft overflow-hidden shrink-0 shadow-xs flex items-center justify-center p-1">
                                                                {img ? (
                                                                    <img
                                                                        src={img}
                                                                        alt={row.productName}
                                                                        className="w-full h-full object-contain"
                                                                    />
                                                                ) : (
                                                                    <Package className="w-7 h-7 text-gray-300" />
                                                                )}
                                                            </div>
                                                            <span className="font-black text-gray-900 text-sm sm:text-base leading-snug">
                                                                {row.productName}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    <td className="px-5 py-4 text-center">
                                                        <span className={cn(
                                                            'font-mono font-black text-base px-3 py-1 rounded-control inline-block',
                                                            row.isLow ? 'bg-rose-100 text-rose-700' : 'bg-brand-blue-soft text-brand-blue'
                                                        )}>
                                                            {row.quantity}
                                                        </span>
                                                    </td>

                                                    <td className="px-5 py-4 text-center text-gray-500 font-mono font-bold text-sm">
                                                        {row.reorderLevel}
                                                    </td>

                                                    <td className="px-5 py-4 text-center">
                                                        {row.isLow ? (
                                                            <span className="inline-flex items-center gap-1.5 text-xs font-black text-rose-800 bg-rose-100 border border-rose-300 px-3 py-1 rounded-full">
                                                                <AlertTriangle className="w-3.5 h-3.5" /> مخزون منخفض
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-800 font-black bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> متوفر
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    )}
                </div>
            )}
        </PageState>
    );
};

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Search, Sparkles, Award, ShoppingBag, ExternalLink, X, Loader2, Warehouse } from 'lucide-react';
import type { CustomerProfile } from '../types';
import type { WarehouseOption } from '../lib/adminApi';
import {
    adjustCustomerPoints,
    fetchCustomerDetail,
    fetchCustomers,
    fetchActiveWarehouses,
    setWarehouseSupervisor,
    type CustomerDetailData,
    type CustomerFilters,
} from '../lib/adminApi';
import { errorMessage } from '../lib/errors';
import { formatDate, formatDateTime, formatNumber, formatSDG, orderStatusLabel, orderStatusStyle } from '../lib/format';
import {
    Card,
    Notice,
    PageHeader,
    Spinner,
    Table,
    inputClass,
    primaryButtonClass,
    smallButtonClass,
} from '../components/ui';

const PAGE_SIZE = 15;

const TIER_LABELS: Record<string, { label: string; color: string }> = {
    bronze: { label: 'برونزي', color: 'bg-amber-100 text-amber-800 border-amber-200' },
    silver: { label: 'فضي', color: 'bg-slate-100 text-slate-700 border-slate-200' },
    gold: { label: 'ذهبي', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    platinum: { label: 'بلاتيني', color: 'bg-purple-100 text-purple-800 border-purple-200' },
};

const ROLE_LABELS: Record<string, string> = {
    customer: 'عميل',
    admin: 'مدير',
    driver: 'مندوب',
    warehouse_supervisor: 'مشرف مستودع',
};

export const CustomersPage: React.FC = () => {
    const [customers, setCustomers] = useState<CustomerProfile[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [tierFilter, setTierFilter] = useState('');
    const [page, setPage] = useState(0);

    // Detail Modal State
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
    const [customerDetail, setCustomerDetail] = useState<CustomerDetailData | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);

    // Points Adjustment State
    const [pointsDelta, setPointsDelta] = useState<number>(0);
    const [pointsNote, setPointsNote] = useState('');
    const [adjusting, setAdjusting] = useState(false);
    const [pointsSuccess, setPointsSuccess] = useState<string | null>(null);

    // Warehouse Supervisor Assignment State
    const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
    const [supervisorWarehouseId, setSupervisorWarehouseId] = useState<string>('');
    const [assigningSupervisor, setAssigningSupervisor] = useState(false);

    const loadCustomers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const filters: CustomerFilters = {
                search: search || undefined,
                role: roleFilter || undefined,
                tier: tierFilter || undefined,
                page,
                pageSize: PAGE_SIZE,
            };
            const result = await fetchCustomers(filters);
            setCustomers(result.rows);
            setTotal(result.total);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل قائمة العملاء.'));
        } finally {
            setLoading(false);
        }
    }, [search, roleFilter, tierFilter, page]);

    useEffect(() => {
        void loadCustomers();
    }, [loadCustomers]);

    const openCustomerModal = async (cust: CustomerProfile) => {
        setSelectedCustomer(cust);
        setDetailLoading(true);
        setDetailError(null);
        setPointsSuccess(null);
        setPointsDelta(0);
        setPointsNote('');
        setSupervisorWarehouseId(cust.assigned_warehouse_id ?? '');
        try {
            const [data, wh] = await Promise.all([fetchCustomerDetail(cust.id), fetchActiveWarehouses()]);
            setCustomerDetail(data);
            setWarehouses(wh);
        } catch (err) {
            setDetailError(errorMessage(err, 'تعذر تحميل بيانات العميل.'));
        } finally {
            setDetailLoading(false);
        }
    };

    const closeCustomerModal = () => {
        setSelectedCustomer(null);
        setCustomerDetail(null);
        setDetailError(null);
        setPointsSuccess(null);
    };

    const handleAdjustPoints = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCustomer || pointsDelta === 0) return;
        if (!pointsNote.trim()) {
            setDetailError('يرجى إدخال سبب تعديل النقاط.');
            return;
        }
        setAdjusting(true);
        setDetailError(null);
        setPointsSuccess(null);
        try {
            const newBalance = await adjustCustomerPoints(selectedCustomer.id, pointsDelta, pointsNote.trim());
            setPointsSuccess(`تم تعديل الرصيد بنجاح! الرصيد الجديد: ${formatNumber(newBalance)} نقطة.`);
            setPointsDelta(0);
            setPointsNote('');
            // Reload customer detail & parent list
            const refreshed = await fetchCustomerDetail(selectedCustomer.id);
            setCustomerDetail(refreshed);
            void loadCustomers();
        } catch (err) {
            setDetailError(errorMessage(err));
        } finally {
            setAdjusting(false);
        }
    };

    const handleAssignSupervisor = async () => {
        if (!selectedCustomer) return;
        setAssigningSupervisor(true);
        setDetailError(null);
        setPointsSuccess(null);
        try {
            const warehouseId = supervisorWarehouseId || null;
            await setWarehouseSupervisor(selectedCustomer.id, warehouseId);
            const label = warehouseId
                ? `تم تعيين ${selectedCustomer.full_name ?? 'المستخدم'} مشرفاً للمستودع بنجاح.`
                : `تم إلغاء تعيين المشرف وإعادة الحساب لدور عميل.`;
            setPointsSuccess(label);
            // Refresh customer row so the role badge updates immediately.
            void loadCustomers();
            const refreshed = await fetchCustomerDetail(selectedCustomer.id);
            setCustomerDetail(refreshed);
            setSelectedCustomer(prev => prev
                ? { ...prev, role: warehouseId ? 'warehouse_supervisor' : 'customer', assigned_warehouse_id: warehouseId }
                : prev
            );
        } catch (err) {
            setDetailError(errorMessage(err));
        } finally {
            setAssigningSupervisor(false);
        }
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="إدارة العملاء والمستخدمين"
                subtitle="عرض تفاصيل حسابات العملاء، سجل الطلبات، ونقاط الولاء."
                icon={<Users className="w-8 h-8 text-brand-blue" />}
            />

            {error && <Notice kind="error">{error}</Notice>}

            {/* Filters Header */}
            <Card className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="relative">
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setPage(0);
                            }}
                            placeholder="بحث بالاسم أو الهاتف أو البريد..."
                            className={`${inputClass} pr-10`}
                        />
                        <Search className="w-5 h-5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>

                    <div>
                        <select
                            value={roleFilter}
                            onChange={(e) => {
                                setRoleFilter(e.target.value);
                                setPage(0);
                            }}
                            className={inputClass}
                        >
                            <option value="">جميع الأدوار</option>
                            <option value="customer">العملاء</option>
                            <option value="admin">المدراء</option>
                            <option value="driver">المندوبون</option>
                            <option value="warehouse_supervisor">مشرفو المستودعات</option>
                        </select>
                    </div>

                    <div>
                        <select
                            value={tierFilter}
                            onChange={(e) => {
                                setTierFilter(e.target.value);
                                setPage(0);
                            }}
                            className={inputClass}
                        >
                            <option value="">جميع فئات الولاء</option>
                            <option value="bronze">برونزي</option>
                            <option value="silver">فضي</option>
                            <option value="gold">ذهبي</option>
                            <option value="platinum">بلاتيني</option>
                        </select>
                    </div>
                </div>
            </Card>

            {/* Customers Table */}
            {loading ? (
                <Spinner />
            ) : customers.length === 0 ? (
                <Card className="p-12 text-center text-slate-400 font-bold">
                    لم يتم العثور على أي عملاء يطابقون خيارات البحث.
                </Card>
            ) : (
                <Card className="overflow-hidden">
                    <Table
                        headers={['العميل', 'بيانات الاتصال', 'الدور', 'فئة الولاء', 'نقاط الجمال', 'الطلبات', 'إجمالي الشراء', 'تاريخ الانضمام', 'الإجراءات']}
                    >
                        {customers.map((cust) => {
                            const tier = TIER_LABELS[cust.loyalty_tier] ?? { label: cust.loyalty_tier, color: 'bg-slate-100 text-slate-600' };
                            return (
                                <tr key={cust.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="font-bold text-slate-900">
                                        {cust.full_name || '—'}
                                        {cust.referral_code && (
                                            <span className="block text-[11px] font-mono text-slate-400 mt-0.5">
                                                كود الإحالة: {cust.referral_code}
                                            </span>
                                        )}
                                    </td>
                                    <td className="text-xs space-y-0.5">
                                        {cust.phone ? <p className="font-bold text-slate-800" dir="ltr">{cust.phone}</p> : null}
                                        {cust.email ? <p className="text-slate-500" dir="ltr">{cust.email}</p> : null}
                                    </td>
                                    <td>
                                        <span className={`px-2 py-0.5 text-xs font-black rounded-lg ${cust.role === 'admin' ? 'bg-purple-100 text-purple-700' : cust.role === 'driver' ? 'bg-amber-100 text-amber-700' : cust.role === 'warehouse_supervisor' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>
                                            {ROLE_LABELS[cust.role] ?? cust.role}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`px-2.5 py-1 text-xs font-black rounded-full border ${tier.color}`}>
                                            {tier.label}
                                        </span>
                                    </td>
                                    <td className="font-black text-brand-blue">
                                        {formatNumber(cust.beauty_points)} <span className="text-[10px] text-slate-400">نقطة</span>
                                    </td>
                                    <td className="font-bold text-slate-700">
                                        {cust.orders_count != null ? formatNumber(cust.orders_count) : '0'}
                                    </td>
                                    <td className="font-black text-slate-900">
                                        {formatSDG(cust.total_spent ?? 0)}
                                    </td>
                                    <td className="text-xs text-slate-500">
                                        {formatDate(cust.created_at)}
                                    </td>
                                    <td>
                                        <button
                                            type="button"
                                            onClick={() => void openCustomerModal(cust)}
                                            className={smallButtonClass}
                                        >
                                            التفاصيل
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </Table>

                    <div className="bg-slate-50/50 px-6 py-4 flex items-center justify-between border-t border-slate-100">
                        <p className="text-xs text-slate-400 font-bold">
                            إجمالي العملاء: {formatNumber(total)}
                        </p>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={page <= 0 || loading}
                                onClick={() => setPage(page - 1)}
                                className="px-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                            >
                                السابق
                            </button>
                            <button
                                type="button"
                                disabled={(page + 1) * PAGE_SIZE >= total || loading}
                                onClick={() => setPage(page + 1)}
                                className="px-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                            >
                                التالي
                            </button>
                        </div>
                    </div>
                </Card>
            )}

            {/* Customer Details Modal */}
            {selectedCustomer && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                            <div>
                                <h3 className="text-xl font-black text-slate-900">
                                    {customerDetail?.profile.full_name || selectedCustomer.full_name || 'ملف العميل'}
                                </h3>
                                <p className="text-xs text-slate-400 font-mono mt-0.5">ID: {selectedCustomer.id}</p>
                            </div>
                            <button
                                type="button"
                                onClick={closeCustomerModal}
                                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {detailError && <Notice kind="error">{detailError}</Notice>}
                        {pointsSuccess && <Notice kind="success">{pointsSuccess}</Notice>}

                        {detailLoading ? (
                            <Spinner />
                        ) : customerDetail ? (
                            <div className="space-y-6">
                                {/* Summary KPIs */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <Card className="p-4 bg-slate-50 border-slate-100">
                                        <p className="text-xs font-bold text-slate-400 mb-1 flex items-center gap-1">
                                            <Sparkles className="w-3.5 h-3.5 text-amber-500" /> نقاط الجمال
                                        </p>
                                        <p className="text-xl font-black text-slate-900">{formatNumber(customerDetail.profile.beauty_points)}</p>
                                    </Card>
                                    <Card className="p-4 bg-slate-50 border-slate-100">
                                        <p className="text-xs font-bold text-slate-400 mb-1 flex items-center gap-1">
                                            <Award className="w-3.5 h-3.5 text-brand-blue" /> نقاط مدى الحياة
                                        </p>
                                        <p className="text-xl font-black text-slate-900">{formatNumber(customerDetail.profile.loyalty_lifetime_points)}</p>
                                    </Card>
                                    <Card className="p-4 bg-slate-50 border-slate-100">
                                        <p className="text-xs font-bold text-slate-400 mb-1 flex items-center gap-1">
                                            <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" /> إجمالي الطلبات
                                        </p>
                                        <p className="text-xl font-black text-slate-900">{customerDetail.orders.length}</p>
                                    </Card>
                                    <Card className="p-4 bg-slate-50 border-slate-100">
                                        <p className="text-xs font-bold text-slate-400 mb-1">إجمالي المشتريات</p>
                                        <p className="text-xl font-black text-slate-900">{formatSDG(customerDetail.profile.total_spent ?? 0)}</p>
                                    </Card>
                                </div>

                                {/* Points Adjustment Form */}
                                <Card className="p-5 border-amber-200 bg-amber-50/40">
                                    <h4 className="font-black text-slate-900 text-sm mb-3 flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-amber-600" /> تعديل يدوي لنقاط الولاء
                                    </h4>
                                    <form onSubmit={handleAdjustPoints} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1">مقدار التغيير (موجب للإضافة، سالب للخصم)</label>
                                            <div className="flex gap-1">
                                                <input
                                                    type="number"
                                                    value={pointsDelta || ''}
                                                    onChange={(e) => setPointsDelta(parseInt(e.target.value, 10) || 0)}
                                                    placeholder="مثال: 50 أو -20"
                                                    className={inputClass}
                                                    required
                                                />
                                            </div>
                                        </div>
                                        <div className="md:col-span-1">
                                            <label className="block text-xs font-bold text-slate-600 mb-1">سبب التعديل</label>
                                            <input
                                                type="text"
                                                value={pointsNote}
                                                onChange={(e) => setPointsNote(e.target.value)}
                                                placeholder="تعويض عن تأخير، مكافأة خاصة..."
                                                className={inputClass}
                                                required
                                            />
                                        </div>
                                        <div className="flex items-end">
                                            <button
                                                type="submit"
                                                disabled={adjusting || pointsDelta === 0}
                                                className={`${primaryButtonClass} w-full`}
                                            >
                                                {adjusting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'تطبيق التعديل'}
                                            </button>
                                        </div>
                                    </form>
                                </Card>

                                {/* Warehouse Supervisor Assignment — only for customer/warehouse_supervisor accounts */}
                                {(selectedCustomer.role === 'customer' || selectedCustomer.role === 'warehouse_supervisor') && (
                                    <Card className="p-5 border-sky-200 bg-sky-50/40">
                                        <h4 className="font-black text-slate-900 text-sm mb-3 flex items-center gap-2">
                                            <Warehouse className="w-4 h-4 text-sky-600" /> تعيين مشرف مستودع
                                        </h4>
                                        <div className="flex flex-col md:flex-row gap-3 items-end">
                                            <div className="flex-1">
                                                <label className="block text-xs font-bold text-slate-600 mb-1">المستودع المُعيَّن</label>
                                                <select
                                                    value={supervisorWarehouseId}
                                                    onChange={(e) => setSupervisorWarehouseId(e.target.value)}
                                                    className={inputClass}
                                                >
                                                    <option value="">— بدون تعيين (إلغاء دور المشرف) —</option>
                                                    {warehouses.map((w) => (
                                                        <option key={w.id} value={w.id}>
                                                            {w.name} — {w.city}، {w.state}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <button
                                                type="button"
                                                disabled={assigningSupervisor}
                                                onClick={() => void handleAssignSupervisor()}
                                                className={`${primaryButtonClass} shrink-0`}
                                            >
                                                {assigningSupervisor ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ التعيين'}
                                            </button>
                                        </div>
                                        {selectedCustomer.role === 'warehouse_supervisor' && (
                                            <p className="text-xs text-sky-700 font-bold mt-2 flex items-center gap-1">
                                                <Warehouse className="w-3 h-3" />
                                                حالياً مشرف مستودع
                                                {selectedCustomer.assigned_warehouse_id
                                                    ? ` — ${warehouses.find(w => w.id === selectedCustomer.assigned_warehouse_id)?.name ?? selectedCustomer.assigned_warehouse_id}`
                                                    : ' (بدون مستودع مُعيَّن)'}
                                            </p>
                                        )}
                                    </Card>
                                )}

                                {/* Customer Orders History */}
                                <div className="space-y-3">
                                    <h4 className="font-black text-slate-900 text-sm">سجل طلبات العميل ({customerDetail.orders.length})</h4>
                                    {customerDetail.orders.length === 0 ? (
                                        <p className="text-xs text-slate-400 font-bold">لا توجد طلبات لهذا العميل حتى الآن.</p>
                                    ) : (
                                        <div className="border border-slate-100 rounded-2xl overflow-hidden">
                                            <table className="w-full text-right text-xs">
                                                <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                    <tr>
                                                        <th className="px-4 py-2.5">رقم الطلب</th>
                                                        <th className="px-4 py-2.5">التاريخ</th>
                                                        <th className="px-4 py-2.5">الحالة</th>
                                                        <th className="px-4 py-2.5">المبلغ</th>
                                                        <th className="px-4 py-2.5 text-left">رابط الطلب</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {customerDetail.orders.slice(0, 8).map((ord) => (
                                                        <tr key={ord.id} className="hover:bg-slate-50">
                                                            <td className="px-4 py-2.5 font-bold text-slate-900 font-mono">
                                                                {ord.order_number ?? ord.id.slice(0, 8)}
                                                            </td>
                                                            <td className="px-4 py-2.5 text-slate-500">
                                                                {formatDate(ord.created_at)}
                                                            </td>
                                                            <td className="px-4 py-2.5">
                                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${orderStatusStyle(ord.status)}`}>
                                                                    {orderStatusLabel(ord.status)}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-2.5 font-black text-slate-900">
                                                                {formatSDG(ord.total)}
                                                            </td>
                                                            <td className="px-4 py-2.5 text-left">
                                                                <Link
                                                                    to={`/orders/${ord.id}`}
                                                                    target="_blank"
                                                                    className="inline-flex items-center gap-1 text-brand-blue font-bold hover:underline"
                                                                >
                                                                    فتح <ExternalLink className="w-3 h-3" />
                                                                </Link>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>

                                {/* Loyalty Points Ledger */}
                                <div className="space-y-3">
                                    <h4 className="font-black text-slate-900 text-sm">سجل حركات نقاط الولاء</h4>
                                    {customerDetail.loyaltyHistory.length === 0 ? (
                                        <p className="text-xs text-slate-400 font-bold">لا توجد حركات نقاط مسجلة.</p>
                                    ) : (
                                        <div className="border border-slate-100 rounded-2xl overflow-hidden max-h-48 overflow-y-auto">
                                            <table className="w-full text-right text-xs">
                                                <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest sticky top-0">
                                                    <tr>
                                                        <th className="px-4 py-2">التاريخ</th>
                                                        <th className="px-4 py-2">النوع</th>
                                                        <th className="px-4 py-2">التغيير</th>
                                                        <th className="px-4 py-2">البيان</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {customerDetail.loyaltyHistory.map((item) => (
                                                        <tr key={item.id}>
                                                            <td className="px-4 py-2 text-slate-400">{formatDateTime(item.created_at)}</td>
                                                            <td className="px-4 py-2 font-bold text-slate-700">{item.event_type}</td>
                                                            <td className={`px-4 py-2 font-black ${item.points_delta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                                {item.points_delta > 0 ? `+${item.points_delta}` : item.points_delta}
                                                            </td>
                                                            <td className="px-4 py-2 text-slate-600">{item.note ?? '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            )}
        </div>
    );
};

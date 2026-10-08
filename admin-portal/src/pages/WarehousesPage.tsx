import React, { useEffect, useState } from 'react';
import { Warehouse as WarehouseIcon, Plus, Edit, X, UserCheck, UserX, Search, Shield, CheckCircle2 } from 'lucide-react';
import type { Warehouse } from '../types';
import { SUDANESE_STATES } from '../types';
import { fetchWarehouses, saveWarehouse, type WarehouseInput } from '../lib/catalogApi';
import {
    fetchWarehouseSupervisors,
    searchAssignableUsers,
    setWarehouseSupervisor,
    type SupervisorUser,
} from '../lib/adminApi';
import { errorMessage } from '../lib/errors';
import {
    Card,
    Field,
    Notice,
    PageHeader,
    Spinner,
    StatusPill,
    Table,
    inputClass,
    primaryButtonClass,
    secondaryButtonClass,
    smallButtonClass,
} from '../components/ui';

const emptyWarehouse: WarehouseInput = {
    name: '',
    code: '',
    state: 'الخرطوم',
    city: '',
    address: null,
    phone: null,
    is_active: true,
    latitude: null,
    longitude: null,
    base_dispatch_minutes: 30,
};

const numberOrNull = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
};

export const WarehousesPage: React.FC = () => {
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [supervisors, setSupervisors] = useState<SupervisorUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [editing, setEditing] = useState<{ id: string | null; data: WarehouseInput } | null>(null);
    const [saving, setSaving] = useState(false);

    // Supervisor Assignment Modal State
    const [assignModalWarehouse, setAssignModalWarehouse] = useState<Warehouse | null>(null);
    const [userSearch, setUserSearch] = useState('');
    const [candidateUsers, setCandidateUsers] = useState<SupervisorUser[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [assigningUserId, setAssigningUserId] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const [whList, supList] = await Promise.all([
                fetchWarehouses(),
                fetchWarehouseSupervisors().catch(() => []),
            ]);
            setWarehouses(whList);
            setSupervisors(supList);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل المخازن والمشرفين.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    // Search users for supervisor delegation
    useEffect(() => {
        if (!assignModalWarehouse) return;
        let cancelled = false;
        setSearchLoading(true);
        const timer = setTimeout(async () => {
            try {
                const results = await searchAssignableUsers(userSearch);
                if (!cancelled) setCandidateUsers(results);
            } catch {
                if (!cancelled) setCandidateUsers([]);
            } finally {
                if (!cancelled) setSearchLoading(false);
            }
        }, 300);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [userSearch, assignModalWarehouse]);

    const update = (patch: Partial<WarehouseInput>) =>
        editing && setEditing({ ...editing, data: { ...editing.data, ...patch } });

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing) return;
        const data = editing.data;
        if (!data.name.trim() || !data.code.trim() || !data.city.trim()) {
            setError('الاسم والرمز والمحلية مطلوبة.');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await saveWarehouse(editing.id, {
                ...data,
                name: data.name.trim(),
                code: data.code.trim().toUpperCase(),
                city: data.city.trim(),
                address: data.address?.trim() || null,
                phone: data.phone?.trim() || null,
            });
            setEditing(null);
            await load();
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const handleAssignSupervisor = async (userId: string, warehouseId: string | null) => {
        setAssigningUserId(userId);
        setError(null);
        try {
            await setWarehouseSupervisor(userId, warehouseId);
            setSuccessMsg(
                warehouseId
                    ? 'تم تعيين المشرف للمستودع بنجاح وتفعيل صلاحيات المشرف.'
                    : 'تم إلغاء تعيين المشرف وإعادته كحساب عميل عادي.'
            );
            setTimeout(() => setSuccessMsg(null), 4000);
            await load();
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحديث تعيين المشرف.'));
        } finally {
            setAssigningUserId(null);
        }
    };

    if (loading) return <Spinner />;

    return (
        <div className="space-y-8">
            <PageHeader
                title="المخازن والمشرفين"
                subtitle="إدارة المستودعات، الإحداثيات الجغرافية، وتعيين المشرفين المسؤولين عن كل مستودع بالصلاحيات المباشرة."
                icon={<WarehouseIcon className="w-8 h-8 text-brand-blue" />}
                actions={
                    <button
                        type="button"
                        onClick={() => setEditing({ id: null, data: emptyWarehouse })}
                        className={primaryButtonClass}
                    >
                        <Plus className="w-5 h-5" /> إضافة مخزن
                    </button>
                }
            />

            {error && <Notice kind="error">{error}</Notice>}
            {successMsg && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{successMsg}</span>
                </div>
            )}

            {/* Warehouse Edit Form */}
            {editing && (
                <Card className="p-6">
                    <form onSubmit={submit} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-black text-slate-900">{editing.id ? 'تعديل مخزن' : 'مخزن جديد'}</h3>
                            <button
                                type="button"
                                onClick={() => setEditing(null)}
                                className="p-2 text-slate-400 hover:text-slate-600"
                                aria-label="إغلاق"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="grid md:grid-cols-3 gap-4">
                            <Field label="الاسم" required>
                                <input
                                    value={editing.data.name}
                                    onChange={(e) => update({ name: e.target.value })}
                                    className={inputClass}
                                    required
                                />
                            </Field>
                            <Field label="الرمز" required hint="مثال: KRT">
                                <input
                                    value={editing.data.code}
                                    onChange={(e) => update({ code: e.target.value })}
                                    className={inputClass}
                                    dir="ltr"
                                    required
                                    disabled={Boolean(editing.id)}
                                />
                            </Field>
                            <Field label="الولاية" required>
                                <select
                                    value={editing.data.state}
                                    onChange={(e) => update({ state: e.target.value })}
                                    className={inputClass}
                                    required
                                >
                                    {SUDANESE_STATES.map((s) => (
                                        <option key={s} value={s}>
                                            {s}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="المحلية" required>
                                <input
                                    value={editing.data.city}
                                    onChange={(e) => update({ city: e.target.value })}
                                    className={inputClass}
                                    required
                                />
                            </Field>
                            <Field label="العنوان">
                                <input
                                    value={editing.data.address ?? ''}
                                    onChange={(e) => update({ address: e.target.value })}
                                    className={inputClass}
                                />
                            </Field>
                            <Field label="الهاتف">
                                <input
                                    value={editing.data.phone ?? ''}
                                    onChange={(e) => update({ phone: e.target.value })}
                                    className={inputClass}
                                    dir="ltr"
                                />
                            </Field>
                            <Field label="خط العرض (Latitude)" hint="لتفعيل التسعير الديناميكي (GPS)">
                                <input
                                    type="number"
                                    step="any"
                                    value={editing.data.latitude ?? ''}
                                    onChange={(e) => update({ latitude: numberOrNull(e.target.value) })}
                                    className={inputClass}
                                    dir="ltr"
                                />
                            </Field>
                            <Field label="خط الطول (Longitude)" hint="لتفعيل التسعير الديناميكي (GPS)">
                                <input
                                    type="number"
                                    step="any"
                                    value={editing.data.longitude ?? ''}
                                    onChange={(e) => update({ longitude: numberOrNull(e.target.value) })}
                                    className={inputClass}
                                    dir="ltr"
                                />
                            </Field>
                            <Field label="مدة التجهيز قبل الانطلاق (دقيقة)">
                                <input
                                    type="number"
                                    min={0}
                                    step="1"
                                    value={editing.data.base_dispatch_minutes}
                                    onChange={(e) => update({ base_dispatch_minutes: Number(e.target.value) || 0 })}
                                    className={inputClass}
                                    dir="ltr"
                                />
                            </Field>
                        </div>
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={editing.data.is_active}
                                    onChange={(e) => update({ is_active: e.target.checked })}
                                    className="w-4 h-4 accent-brand-blue"
                                />{' '}
                                نشط
                            </label>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setEditing(null)} className={secondaryButtonClass}>
                                    إلغاء
                                </button>
                                <button type="submit" disabled={saving} className={primaryButtonClass}>
                                    {saving ? 'جاري الحفظ...' : 'حفظ'}
                                </button>
                            </div>
                        </div>
                    </form>
                </Card>
            )}

            {/* Warehouses & Supervisors Table */}
            <Card className="overflow-hidden">
                <Table
                    headers={['المخزن', 'الرمز', 'الموقع', 'المشرف المسؤول', 'الهاتف', 'الحالة', 'الإجراءات']}
                    empty={warehouses.length === 0}
                >
                    {warehouses.map((w) => {
                        const warehouseSupervisors = supervisors.filter((s) => s.assigned_warehouse_id === w.id);

                        return (
                            <tr key={w.id} className="hover:bg-slate-50/50">
                                <td className="px-6 py-4 text-sm font-black text-slate-900">{w.name}</td>
                                <td className="px-6 py-4 text-sm font-bold text-slate-600" dir="ltr">
                                    {w.code}
                                </td>
                                <td className="px-6 py-4 text-sm font-bold text-slate-600">
                                    {w.state} · {w.city}
                                    {w.address ? ` · ${w.address}` : ''}
                                    {w.latitude == null && (
                                        <span className="block text-[10px] font-black text-amber-600 mt-0.5">
                                            بدون إحداثيات GPS — التسعير الديناميكي معطل لهذا المخزن
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-sm">
                                    {warehouseSupervisors.length > 0 ? (
                                        <div className="space-y-1">
                                            {warehouseSupervisors.map((sup) => (
                                                <div
                                                    key={sup.id}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-brand-blue font-bold text-xs"
                                                >
                                                    <Shield className="w-3.5 h-3.5 text-brand-blue" />
                                                    <span>{sup.full_name || sup.email || 'مشرف'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
                                            لا يوجد مشرف معين
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-sm font-bold text-slate-600" dir="ltr">
                                    {w.phone ?? '—'}
                                </td>
                                <td className="px-6 py-4">
                                    <StatusPill tone={w.is_active ? 'success' : 'neutral'}>
                                        {w.is_active ? 'نشط' : 'متوقف'}
                                    </StatusPill>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setAssignModalWarehouse(w)}
                                            className={`${smallButtonClass} bg-indigo-50 text-indigo-700 hover:bg-indigo-100 flex items-center gap-1 font-bold`}
                                        >
                                            <UserCheck className="w-3.5 h-3.5" /> تعيين مشرف
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setEditing({
                                                    id: w.id,
                                                    data: {
                                                        name: w.name,
                                                        code: w.code,
                                                        state: w.state,
                                                        city: w.city,
                                                        address: w.address,
                                                        phone: w.phone,
                                                        is_active: w.is_active,
                                                        latitude: w.latitude,
                                                        longitude: w.longitude,
                                                        base_dispatch_minutes: w.base_dispatch_minutes,
                                                    },
                                                })
                                            }
                                            className={`${smallButtonClass} bg-blue-50 text-brand-blue flex items-center gap-1`}
                                        >
                                            <Edit className="w-3.5 h-3.5" /> تعديل
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </Table>
            </Card>

            {/* Supervisor Assignment Modal */}
            {assignModalWarehouse && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn"
                    dir="rtl"
                >
                    <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden">
                        <div className="p-5 bg-linear-to-r from-slate-900 to-brand-blue text-white flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                                    <UserCheck className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h2 className="font-bold text-lg">تعيين مشرف المستودع</h2>
                                    <p className="text-xs text-slate-200">
                                        {assignModalWarehouse.name} ({assignModalWarehouse.code})
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setAssignModalWarehouse(null)}
                                className="p-2 text-slate-300 hover:text-white rounded-xl hover:bg-white/10"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
                            {/* Current Assigned Supervisors for this warehouse */}
                            <div>
                                <h4 className="text-xs font-black text-slate-700 mb-2">المشرفون الحاليون لهذا المستودع:</h4>
                                {supervisors.filter((s) => s.assigned_warehouse_id === assignModalWarehouse.id).length > 0 ? (
                                    <div className="space-y-2">
                                        {supervisors
                                            .filter((s) => s.assigned_warehouse_id === assignModalWarehouse.id)
                                            .map((sup) => (
                                                <div
                                                    key={sup.id}
                                                    className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200"
                                                >
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-8 h-8 rounded-full bg-brand-blue/10 text-brand-blue flex items-center justify-center font-bold text-xs">
                                                            {sup.full_name?.charAt(0) || sup.email?.charAt(0) || 'U'}
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-black text-slate-900">
                                                                {sup.full_name || 'بدون اسم'}
                                                            </p>
                                                            <p className="text-2xs text-slate-500 font-mono" dir="ltr">
                                                                {sup.email} {sup.phone ? `· ${sup.phone}` : ''}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        disabled={assigningUserId === sup.id}
                                                        onClick={() => handleAssignSupervisor(sup.id, null)}
                                                        className="px-2.5 py-1.5 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1"
                                                    >
                                                        <UserX className="w-3.5 h-3.5" /> إلغاء التعيين
                                                    </button>
                                                </div>
                                            ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-400 bg-slate-50 p-3 rounded-xl border border-dashed border-slate-200">
                                        لا يوجد أي مشرف مرتبط بهذا المستودع حالياً.
                                    </p>
                                )}
                            </div>

                            <hr className="border-slate-100" />

                            {/* Search & Assign New Supervisor */}
                            <div>
                                <h4 className="text-xs font-black text-slate-700 mb-2">تعيين حساب مستخدم جديد كمشرف:</h4>
                                <div className="relative mb-3">
                                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
                                    <input
                                        type="text"
                                        value={userSearch}
                                        onChange={(e) => setUserSearch(e.target.value)}
                                        placeholder="ابحث بالبريد الإلكتروني، الاسم، أو الهاتف..."
                                        className={`${inputClass} pr-9`}
                                    />
                                </div>

                                {searchLoading ? (
                                    <div className="py-4 text-center text-xs text-slate-400">جاري البحث عن الحسابات...</div>
                                ) : candidateUsers.length > 0 ? (
                                    <div className="space-y-2 max-h-56 overflow-y-auto">
                                        {candidateUsers.map((user) => {
                                            const isAlreadyHere = user.assigned_warehouse_id === assignModalWarehouse.id;
                                            return (
                                                <div
                                                    key={user.id}
                                                    className="flex items-center justify-between p-3 rounded-2xl bg-white border border-slate-200 hover:border-brand-blue/40 transition-colors"
                                                >
                                                    <div className="min-w-0 pr-2">
                                                        <p className="text-xs font-black text-slate-900 truncate">
                                                            {user.full_name || 'بدون اسم'}
                                                        </p>
                                                        <p className="text-2xs text-slate-500 font-mono truncate" dir="ltr">
                                                            {user.email}
                                                        </p>
                                                    </div>
                                                    {isAlreadyHere ? (
                                                        <span className="text-2xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md">
                                                            معين حالياً
                                                        </span>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            disabled={assigningUserId === user.id}
                                                            onClick={() => handleAssignSupervisor(user.id, assignModalWarehouse.id)}
                                                            className="px-3 py-1.5 rounded-xl bg-brand-blue text-white hover:bg-brand-blue/90 text-xs font-bold transition-all shadow-xs disabled:opacity-50 flex items-center gap-1 shrink-0"
                                                        >
                                                            <UserCheck className="w-3.5 h-3.5" />
                                                            <span>{assigningUserId === user.id ? 'جاري...' : 'تعيين'}</span>
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-400 text-center py-3">
                                        {userSearch.trim() ? 'لم يتم العثور على حساب مطابق.' : 'أدخل بريد الحساب للبحث والتعيين.'}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="p-4 bg-slate-50 border-t border-slate-100 text-left">
                            <button
                                type="button"
                                onClick={() => setAssignModalWarehouse(null)}
                                className={secondaryButtonClass}
                            >
                                إغلاق
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

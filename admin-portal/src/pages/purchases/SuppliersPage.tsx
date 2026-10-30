import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Edit, Plus, Search, X } from 'lucide-react';
import type { Supplier, SupplierInput } from '../../types';
import { fetchSuppliers, saveSupplier } from '../../lib/purchasesApi';
import { errorMessage } from '../../lib/errors';
import { useAuth } from '../../context/AuthContext';
import { Card, Field, Notice, PageHeader, Spinner, StatusPill, Table, inputClass, primaryButtonClass, secondaryButtonClass, smallButtonClass } from '../../components/ui';

const emptyInput: SupplierInput = { name: '', phone: null, email: null, address: null, tax_number: null, notes: null, is_active: true };

export const SuppliersPage: React.FC = () => {
    const { isAdmin } = useAuth();
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState<Supplier | 'new' | null>(null);
    const [form, setForm] = useState<SupplierInput>(emptyInput);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            setSuppliers(await fetchSuppliers());
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل الموردين.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        return suppliers.filter((s) => !term || s.name.toLowerCase().includes(term) || (s.phone ?? '').includes(term));
    }, [suppliers, search]);

    const openNew = () => {
        setEditing('new');
        setForm(emptyInput);
        setError(null);
        setSuccess(null);
    };

    const openEdit = (supplier: Supplier) => {
        setEditing(supplier);
        setForm({ name: supplier.name, phone: supplier.phone, email: supplier.email, address: supplier.address, tax_number: supplier.tax_number, notes: supplier.notes, is_active: supplier.is_active });
        setError(null);
        setSuccess(null);
    };

    const set = <K extends keyof SupplierInput>(key: K, value: SupplierInput[K]) => setForm((prev) => ({ ...prev, [key]: value }));

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing) return;
        if (!form.name.trim()) { setError('اسم المورد مطلوب.'); return; }
        setSaving(true);
        setError(null);
        try {
            const id = editing === 'new' ? null : editing.id;
            const isActive = isAdmin || editing === 'new' ? form.is_active : (editing as Supplier).is_active;
            await saveSupplier(id, { ...form, is_active: isActive });
            setSuccess(id ? `تم تحديث بيانات «${form.name.trim()}».` : `تمت إضافة المورد «${form.name.trim()}».`);
            setEditing(null);
            await load();
        } catch (err) {
            setError(errorMessage(err, 'تعذر حفظ المورد.'));
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <Spinner label="جاري تحميل الموردين..." />;

    return (
        <div className="space-y-8">
            <PageHeader
                title="الموردون"
                subtitle="الجهات التي تُشترى منها البضاعة. تُربط بها فواتير الشراء ومرتجعات الموردين."
                icon={<Building2 className="w-8 h-8 text-brand-blue" />}
                actions={<button type="button" onClick={openNew} className={primaryButtonClass}><Plus className="w-5 h-5" /> إضافة مورد</button>}
            />

            {error && <Notice kind="error">{error}</Notice>}
            {success && <Notice kind="success">{success}</Notice>}

            {editing && (
                <Card className="p-6">
                    <form onSubmit={submit} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-black text-slate-900">{editing === 'new' ? 'مورد جديد' : `تعديل — ${editing.name}`}</h3>
                            <button type="button" onClick={() => setEditing(null)} className="p-2 text-slate-400 hover:text-slate-600" aria-label="إغلاق"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="grid md:grid-cols-3 gap-4">
                            <Field label="الاسم" required><input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} required /></Field>
                            <Field label="الهاتف"><input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} className={inputClass} dir="ltr" /></Field>
                            <Field label="البريد الإلكتروني"><input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} className={inputClass} dir="ltr" /></Field>
                            <Field label="الرقم الضريبي"><input value={form.tax_number ?? ''} onChange={(e) => set('tax_number', e.target.value)} className={inputClass} dir="ltr" /></Field>
                            <Field label="العنوان"><input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} className={inputClass} /></Field>
                            <Field label="ملاحظات"><input value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} className={inputClass} /></Field>
                        </div>
                        {isAdmin && (
                            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                                <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4 accent-brand-blue" /> مورد نشط
                            </label>
                        )}
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setEditing(null)} className={secondaryButtonClass}>إلغاء</button>
                            <button type="submit" disabled={saving} className={primaryButtonClass}>{saving ? 'جاري الحفظ...' : 'حفظ'}</button>
                        </div>
                    </form>
                </Card>
            )}

            <Card className="overflow-hidden">
                <div className="p-5 border-b border-slate-50 bg-slate-50/30">
                    <div className="relative max-w-md">
                        <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="بحث بالاسم أو الهاتف..."
                            className="w-full pl-12 pr-5 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-brand-blue/30 font-medium text-sm"
                        />
                    </div>
                </div>
                <Table headers={['المورد', 'الهاتف', 'الرقم الضريبي', 'الحالة', 'الإجراءات']} empty={visible.length === 0} emptyText="لا يوجد موردون مطابقون">
                    {visible.map((supplier) => (
                        <tr key={supplier.id} className={`hover:bg-slate-50/50 ${supplier.is_active ? '' : 'opacity-60'}`}>
                            <td className="px-6 py-4">
                                <p className="font-black text-slate-900 text-sm">{supplier.name}</p>
                                {supplier.email && <p className="text-[10px] text-slate-400 font-bold" dir="ltr">{supplier.email}</p>}
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-600" dir="ltr">{supplier.phone || '—'}</td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-600" dir="ltr">{supplier.tax_number || '—'}</td>
                            <td className="px-6 py-4"><StatusPill tone={supplier.is_active ? 'success' : 'neutral'}>{supplier.is_active ? 'نشط' : 'متوقف'}</StatusPill></td>
                            <td className="px-6 py-4">
                                <button type="button" onClick={() => openEdit(supplier)} className={`${smallButtonClass} bg-blue-50 text-brand-blue flex items-center gap-1`}><Edit className="w-3.5 h-3.5" /> تعديل</button>
                            </td>
                        </tr>
                    ))}
                </Table>
            </Card>
        </div>
    );
};

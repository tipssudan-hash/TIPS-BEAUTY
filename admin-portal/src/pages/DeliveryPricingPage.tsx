import React, { useEffect, useState } from 'react';
import { Gauge, Plus, Edit, Trash2, X, Calculator } from 'lucide-react';
import type { DeliveryPricingConfig, DeliveryQuote, DeliveryZone, Warehouse } from '../types';
import { SUDANESE_STATES } from '../types';
import { deletePricingConfig, fetchDeliveryZones, fetchPricingConfigs, fetchWarehouses, savePricingConfig, simulateDeliveryQuote, type PricingConfigInput } from '../lib/catalogApi';
import { errorMessage } from '../lib/errors';
import { formatSDG } from '../lib/format';
import { Card, Field, Notice, PageHeader, Spinner, StatusPill, Table, inputClass, primaryButtonClass, secondaryButtonClass, smallButtonClass } from '../components/ui';

const emptyConfig: PricingConfigInput = {
    warehouse_id: null, delivery_zone_id: null, state: null,
    base_fee: 0, per_km_rate: 0, weight_multiplier: 0, road_multiplier: 1.25,
    min_fee: 0, max_fee: null, avg_speed_kmh: 30, per_kg_rate: 0, per_extra_warehouse_fee: 0, handling_fee: 0, is_active: true,
};

// A proposed-change warning threshold for the simulator — a UX nudge, not a charged coefficient,
// so (unlike base_fee/per_km_rate/etc.) it's fine to keep as a constant here.
const BIG_CHANGE_THRESHOLD = 0.2;

const numberOrNull = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
};

const scopeLabel = (c: DeliveryPricingConfig, warehouseName: (id: string | null) => string, zoneName: (id: string | null) => string) => {
    if (c.delivery_zone_id) return `${warehouseName(c.warehouse_id)} → ${zoneName(c.delivery_zone_id)}`;
    if (c.warehouse_id) return `${warehouseName(c.warehouse_id)} — كل محليات ${c.state ?? '—'}`;
    return 'الإعداد العام (كل المخازن والمحليات)';
};

export const DeliveryPricingPage: React.FC = () => {
    const [configs, setConfigs] = useState<DeliveryPricingConfig[]>([]);
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [zones, setZones] = useState<DeliveryZone[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<{ id: string | null; data: PricingConfigInput } | null>(null);
    const [saving, setSaving] = useState(false);

    const [simWarehouse, setSimWarehouse] = useState('');
    const [simZone, setSimZone] = useState('');
    const [simWeight, setSimWeight] = useState('0');
    const [simQuote, setSimQuote] = useState<DeliveryQuote | null>(null);
    const [simPrevQuote, setSimPrevQuote] = useState<DeliveryQuote | null>(null);
    const [simLoading, setSimLoading] = useState(false);
    const [simError, setSimError] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const [c, w, z] = await Promise.all([fetchPricingConfigs(), fetchWarehouses(), fetchDeliveryZones()]);
            setConfigs(c);
            setWarehouses(w);
            setZones(z);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل إعدادات التسعير.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const warehouseName = (id: string | null) => warehouses.find((w) => w.id === id)?.name ?? '—';
    const zoneName = (id: string | null) => zones.find((z) => z.id === id)?.name ?? '—';

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing) return;
        if (editing.data.delivery_zone_id && !editing.data.warehouse_id) { setError('إعداد خاص بمحلية يجب أن يحدد المخزن أيضاً.'); return; }
        if (editing.data.base_fee < 0 || editing.data.per_km_rate < 0 || editing.data.min_fee < 0) { setError('القيم لا يمكن أن تكون سالبة.'); return; }
        if (editing.data.max_fee != null && editing.data.max_fee < editing.data.min_fee) { setError('الحد الأقصى يجب أن يكون أكبر من أو يساوي الحد الأدنى.'); return; }
        setSaving(true);
        setError(null);
        try {
            await savePricingConfig(editing.id, editing.data);
            setEditing(null);
            await load();
        } catch (err) {
            setError(errorMessage(err, 'تعذر الحفظ — تأكدي من عدم تكرار نفس النطاق (مخزن/محلية أو مخزن/ولاية).'));
        } finally {
            setSaving(false);
        }
    };

    const remove = async (config: DeliveryPricingConfig) => {
        if (!window.confirm(`حذف إعداد التسعير "${scopeLabel(config, warehouseName, zoneName)}"؟`)) return;
        setError(null);
        try {
            await deletePricingConfig(config.id);
            setConfigs((prev) => prev.filter((c) => c.id !== config.id));
        } catch (err) {
            setError(errorMessage(err));
        }
    };

    const runSimulation = async () => {
        if (!simWarehouse || !simZone) { setSimError('اختاري مخزناً ومحلية.'); return; }
        setSimLoading(true);
        setSimError(null);
        try {
            const quote = await simulateDeliveryQuote(simWarehouse, simZone, Number(simWeight) || 0);
            setSimPrevQuote(simQuote);
            setSimQuote(quote);
        } catch (err) {
            setSimError(errorMessage(err, 'تعذر حساب السعر التجريبي.'));
        } finally {
            setSimLoading(false);
        }
    };

    const bigChange = simQuote && simPrevQuote && simPrevQuote.fee > 0
        ? Math.abs(simQuote.fee - simPrevQuote.fee) / simPrevQuote.fee >= BIG_CHANGE_THRESHOLD
        : false;

    if (loading) return <Spinner />;

    return (
        <div className="space-y-8">
            <PageHeader
                title="تسعير التوصيل الديناميكي"
                subtitle="معاملات حساب رسوم التوصيل حسب المسافة (GPS). لا يُطبَّق إلا على الولايات المفعّلة من إعدادات النظام — الولايات الأخرى تستخدم الرسوم الثابتة الحالية."
                icon={<Gauge className="w-8 h-8 text-brand-blue" />}
                actions={<button type="button" onClick={() => setEditing({ id: null, data: emptyConfig })} className={primaryButtonClass}><Plus className="w-5 h-5" /> إعداد جديد</button>}
            />

            {error && <Notice kind="error">{error}</Notice>}

            <Card className="p-6">
                <h3 className="font-black text-slate-900 mb-4 flex items-center gap-2"><Calculator className="w-5 h-5 text-brand-blue" /> محاكي السعر</h3>
                <p className="text-xs text-slate-500 font-bold mb-4">يستدعي نفس الدالة التي يستخدمها الموقع فعلياً — وليس نسخة مبسطة منها — لتجربة أي تغيير قبل أن يصل للعميل.</p>
                <div className="grid md:grid-cols-4 gap-4">
                    <Field label="المخزن" required>
                        <select value={simWarehouse} onChange={(e) => setSimWarehouse(e.target.value)} className={inputClass}>
                            <option value="">اختاري...</option>
                            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}{w.latitude == null ? ' (بدون GPS)' : ''}</option>)}
                        </select>
                    </Field>
                    <Field label="المحلية" required>
                        <select value={simZone} onChange={(e) => setSimZone(e.target.value)} className={inputClass}>
                            <option value="">اختاري...</option>
                            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}{z.latitude == null ? ' (بدون GPS)' : ''}</option>)}
                        </select>
                    </Field>
                    <Field label="الوزن (كجم)"><input type="number" min={0} step="0.1" value={simWeight} onChange={(e) => setSimWeight(e.target.value)} className={inputClass} dir="ltr" /></Field>
                    <div className="flex items-end">
                        <button type="button" onClick={() => void runSimulation()} disabled={simLoading} className={`${primaryButtonClass} w-full`}>{simLoading ? 'جاري الحساب...' : 'احسبي السعر'}</button>
                    </div>
                </div>
                {simError && <div className="mt-4"><Notice kind="error">{simError}</Notice></div>}
                {simQuote && !simError && (
                    <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-wrap items-center gap-4">
                        <div>
                            <span className="text-xs font-black text-slate-500 block">الرسوم</span>
                            <span className="text-xl font-black text-slate-900">{formatSDG(simQuote.fee)}</span>
                        </div>
                        <div>
                            <span className="text-xs font-black text-slate-500 block">الوقت التقديري</span>
                            <span className="text-sm font-bold text-slate-700">{simQuote.eta_minutes != null ? `${simQuote.eta_minutes} دقيقة` : '—'}</span>
                        </div>
                        <div>
                            <span className="text-xs font-black text-slate-500 block">المصدر</span>
                            <StatusPill tone={simQuote.source === 'dynamic' ? 'success' : 'attention'}>
                                {simQuote.source === 'dynamic' ? 'ديناميكي (GPS)' : simQuote.source === 'flat_fee' ? 'ثابت (الولاية غير مفعّلة)' : simQuote.source === 'flat_fee_missing_coordinates' ? 'ثابت (بدون إحداثيات)' : 'ثابت (بدون إعداد تسعير)'}
                            </StatusPill>
                        </div>
                        {bigChange && (
                            <div className="w-full">
                                <Notice kind="error">التغيير الأخير حرّك السعر أكثر من {Math.round(BIG_CHANGE_THRESHOLD * 100)}% مقارنة بالحساب السابق — راجعي الإعداد قبل الاعتماد عليه.</Notice>
                            </div>
                        )}
                    </div>
                )}
            </Card>

            {editing && (
                <Card className="p-6">
                    <form onSubmit={submit} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-black text-slate-900">{editing.id ? 'تعديل إعداد تسعير' : 'إعداد تسعير جديد'}</h3>
                            <button type="button" onClick={() => setEditing(null)} className="p-2 text-slate-400 hover:text-slate-600" aria-label="إغلاق"><X className="w-5 h-5" /></button>
                        </div>
                        <p className="text-xs text-slate-500 font-bold">اتركي المخزن والمحلية فارغين لإعداد عام، أو حددي المخزن فقط لإعداد خاص بولاية، أو حددي الاثنين لإعداد مسار محدد.</p>
                        <div className="grid md:grid-cols-3 gap-4">
                            <Field label="المخزن" hint="فارغ = ينطبق على كل المخازن">
                                <select value={editing.data.warehouse_id ?? ''} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, warehouse_id: e.target.value || null, delivery_zone_id: e.target.value ? editing.data.delivery_zone_id : null } })} className={inputClass}>
                                    <option value="">بدون (إعداد عام)</option>
                                    {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>
                            </Field>
                            <Field label="المحلية" hint="فارغ = ينطبق على كل محليات الولاية">
                                <select value={editing.data.delivery_zone_id ?? ''} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, delivery_zone_id: e.target.value || null } })} className={inputClass} disabled={!editing.data.warehouse_id}>
                                    <option value="">بدون</option>
                                    {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                                </select>
                            </Field>
                            <Field label="الولاية" hint="لإعداد خاص بولاية (بدون محلية محددة)">
                                <select value={editing.data.state ?? ''} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, state: e.target.value || null } })} className={inputClass} disabled={!editing.data.warehouse_id || Boolean(editing.data.delivery_zone_id)}>
                                    <option value="">بدون</option>
                                    {SUDANESE_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </Field>
                        </div>
                        <div className="grid md:grid-cols-3 gap-4">
                            <Field label="الرسم الأساسي (ج.س)" required><input type="number" min={0} step="1" value={editing.data.base_fee} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, base_fee: Number(e.target.value) || 0 } })} className={inputClass} dir="ltr" required /></Field>
                            <Field label="سعر الكيلومتر (ج.س)" required><input type="number" min={0} step="1" value={editing.data.per_km_rate} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, per_km_rate: Number(e.target.value) || 0 } })} className={inputClass} dir="ltr" required /></Field>
                            <Field label="معامل الطريق" required hint="تعويض عن عدم وجود محرك مسارات حقيقي — 1.0 = خط مستقيم"><input type="number" min={0.01} step="0.05" value={editing.data.road_multiplier} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, road_multiplier: Number(e.target.value) || 1 } })} className={inputClass} dir="ltr" required /></Field>
                            <Field label="معامل الوزن (لكل كجم)"><input type="number" min={0} step="1" value={editing.data.weight_multiplier} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, weight_multiplier: Number(e.target.value) || 0 } })} className={inputClass} dir="ltr" /></Field>
                            <Field label="الحد الأدنى للرسوم (ج.س)" required><input type="number" min={0} step="1" value={editing.data.min_fee} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, min_fee: Number(e.target.value) || 0 } })} className={inputClass} dir="ltr" required /></Field>
                            <Field label="الحد الأقصى للرسوم (ج.س)" hint="فارغ = بدون حد أقصى"><input type="number" min={0} step="1" value={editing.data.max_fee ?? ''} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, max_fee: numberOrNull(e.target.value) } })} className={inputClass} dir="ltr" /></Field>
                            <Field label="متوسط السرعة (كم/ساعة)" required hint="لحساب وقت التوصيل التقديري"><input type="number" min={1} step="1" value={editing.data.avg_speed_kmh} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, avg_speed_kmh: Number(e.target.value) || 30 } })} className={inputClass} dir="ltr" required /></Field>
                            <Field label="سعر الكيلوغرام (ج.س/كجم)" hint="0 = لا يُحتسب الوزن"><input type="number" min={0} step="0.01" value={editing.data.per_kg_rate} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, per_kg_rate: Number(e.target.value) || 0 } })} className={inputClass} dir="ltr" /></Field>
                            <Field label="رسوم المستودع الإضافي (ج.س)" hint="لكل مستودع إضافي بعد الأول (تجميع الطلب)"><input type="number" min={0} step="1" value={editing.data.per_extra_warehouse_fee} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, per_extra_warehouse_fee: Number(e.target.value) || 0 } })} className={inputClass} dir="ltr" /></Field>
                            <Field label="رسوم التغليف والتجهيز (ج.س)" hint="رسم ثابت على كل طلب"><input type="number" min={0} step="1" value={editing.data.handling_fee} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, handling_fee: Number(e.target.value) || 0 } })} className={inputClass} dir="ltr" /></Field>
                        </div>
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                                <input type="checkbox" checked={editing.data.is_active} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, is_active: e.target.checked } })} className="w-4 h-4 accent-brand-blue" /> نشط
                            </label>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setEditing(null)} className={secondaryButtonClass}>إلغاء</button>
                                <button type="submit" disabled={saving} className={primaryButtonClass}>{saving ? 'جاري الحفظ...' : 'حفظ'}</button>
                            </div>
                        </div>
                    </form>
                </Card>
            )}

            <Card className="overflow-hidden">
                <Table headers={['النطاق', 'الرسم الأساسي', 'سعر الكم', 'معامل الطريق', 'الحد الأدنى/الأقصى', 'الحالة', 'الإجراءات']} empty={configs.length === 0} emptyText="لا توجد إعدادات تسعير بعد — أضيفي إعداداً عاماً على الأقل لتفعيل المحاكي.">
                    {configs.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/50">
                            <td className="px-6 py-4 text-sm font-black text-slate-900">{scopeLabel(c, warehouseName, zoneName)}</td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-600">{formatSDG(c.base_fee)}</td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-600">{formatSDG(c.per_km_rate)}</td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-600" dir="ltr">×{c.road_multiplier}</td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-600">{formatSDG(c.min_fee)} / {c.max_fee != null ? formatSDG(c.max_fee) : '∞'}</td>
                            <td className="px-6 py-4"><StatusPill tone={c.is_active ? 'success' : 'neutral'}>{c.is_active ? 'نشط' : 'متوقف'}</StatusPill></td>
                            <td className="px-6 py-4">
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setEditing({ id: c.id, data: { warehouse_id: c.warehouse_id, delivery_zone_id: c.delivery_zone_id, state: c.state, base_fee: c.base_fee, per_km_rate: c.per_km_rate, weight_multiplier: c.weight_multiplier, road_multiplier: c.road_multiplier, min_fee: c.min_fee, max_fee: c.max_fee, avg_speed_kmh: c.avg_speed_kmh, per_kg_rate: c.per_kg_rate, per_extra_warehouse_fee: c.per_extra_warehouse_fee, handling_fee: c.handling_fee, is_active: c.is_active } })} className={`${smallButtonClass} bg-blue-50 text-brand-blue flex items-center gap-1`}><Edit className="w-3.5 h-3.5" /> تعديل</button>
                                    <button type="button" onClick={() => void remove(c)} className={`${smallButtonClass} bg-red-50 text-red-600 flex items-center gap-1`}><Trash2 className="w-3.5 h-3.5" /> حذف</button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </Table>
            </Card>
        </div>
    );
};

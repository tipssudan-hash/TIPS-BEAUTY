import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useStore } from '../../context/StoreContext';
import { useAuth } from '../../context/AuthContext';
import { DeliveryZone, PaymentMethod } from '../../types';
import { checkout, uploadPaymentProof, submitPaymentProof, fetchPaymentMethods, fetchDeliveryZones, errorMessage } from '../../lib/api';
import { discountedPrice, formatSDG } from '../../lib/pricing';
import { Banknote, Wallet, Loader2 } from 'lucide-react';

const IDEMPOTENCY_KEY = 'checkout_idempotency_key';
const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const DEFAULT_SUFFIX = ' — افتراضي';

function getIdempotencyKey(): string {
    let key = sessionStorage.getItem(IDEMPOTENCY_KEY);
    if (!key) {
        key = crypto.randomUUID();
        sessionStorage.setItem(IDEMPOTENCY_KEY, key);
    }
    return key;
}

const isDefaultZone = (zone: DeliveryZone) => zone.name.endsWith(DEFAULT_SUFFIX);
const zoneLabel = (zone: DeliveryZone) => isDefaultZone(zone) ? `محليات أخرى في ${zone.state ?? ''}` : zone.name;

export const CheckoutPage: React.FC = () => {
    const { cart, cartCount, clearCart } = useStore();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [zones, setZones] = useState<DeliveryZone[]>([]);
    const [methods, setMethods] = useState<PaymentMethod[]>([]);
    const [loadingOptions, setLoadingOptions] = useState(true);
    const [optionsError, setOptionsError] = useState<string | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        state: '',
        zoneId: '',
        address: '',
        paymentMethod: '',
        reference: '',
    });
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [proofError, setProofError] = useState<string | null>(null);

    useEffect(() => {
        if (user) {
            setFormData(prev => ({
                ...prev,
                name: prev.name || user.user_metadata?.full_name || '',
                phone: prev.phone || user.user_metadata?.phone || '',
            }));
        }
    }, [user]);

    useEffect(() => {
        let cancelled = false;
        Promise.all([fetchDeliveryZones(), fetchPaymentMethods()])
            .then(([z, m]) => {
                if (cancelled) return;
                setZones(z);
                setMethods(m);
                setFormData(prev => ({
                    ...prev,
                    state: prev.state || (z.find(x => x.state === 'الخرطوم')?.state ?? z[0]?.state ?? ''),
                    paymentMethod: prev.paymentMethod || (m[0]?.code ?? ''),
                }));
            })
            .catch(err => { if (!cancelled) setOptionsError(errorMessage(err, 'تعذر تحميل خيارات التوصيل والدفع.')); })
            .finally(() => { if (!cancelled) setLoadingOptions(false); });
        return () => { cancelled = true; };
    }, []);

    const states = useMemo(() => Array.from(new Set(zones.map(z => z.state).filter((s): s is string => !!s))), [zones]);
    const stateZones = useMemo(() => {
        const list = zones.filter(z => z.state === formData.state);
        return [...list.filter(z => !isDefaultZone(z)), ...list.filter(isDefaultZone)];
    }, [zones, formData.state]);

    useEffect(() => {
        if (stateZones.length && !stateZones.some(z => z.id === formData.zoneId)) {
            setFormData(prev => ({ ...prev, zoneId: stateZones[0].id }));
        }
    }, [stateZones, formData.zoneId]);

    const selectedZone = zones.find(z => z.id === formData.zoneId) ?? null;
    const selectedMethod = methods.find(m => m.code === formData.paymentMethod) ?? null;

    const subtotal = cart.reduce((sum, item) => sum + discountedPrice(item.price, item.discountPercentage) * item.quantity, 0);
    const shipping = selectedZone?.fee ?? 0;
    const total = subtotal + shipping;

    if (cartCount === 0 && !submitting) return <Navigate to="/cart" replace />;

    const handleProofChange = (file: File | null) => {
        setProofError(null);
        if (!file) { setProofFile(null); return; }
        if (!file.type.startsWith('image/')) { setProofError('يرجى اختيار صورة لإثبات الدفع.'); setProofFile(null); return; }
        if (file.size > MAX_PROOF_BYTES) { setProofError('حجم الصورة يجب ألا يتجاوز 5 ميجابايت.'); setProofFile(null); return; }
        setProofFile(file);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        if (!user || !selectedZone || !selectedMethod) return;
        if (selectedMethod.requiresProof) {
            if (!formData.reference.trim()) { setSubmitError('يرجى إدخال الرقم المرجعي.'); return; }
            if (!proofFile) { setProofError('يرجى إرفاق إثبات الدفع.'); return; }
        }

        setSubmitting(true);
        const idempotencyKey = getIdempotencyKey();
        try {
            let proofPath: string | null = null;
            if (selectedMethod.requiresProof && proofFile) {
                proofPath = await uploadPaymentProof(user.id, idempotencyKey, proofFile);
            }

            const result = await checkout({
                customerName: formData.name.trim(),
                phone: formData.phone.trim(),
                shippingAddress: formData.address.trim(),
                zoneName: selectedZone.name,
                state: formData.state,
                paymentMethod: selectedMethod.code,
                items: cart.map(i => ({ id: i.productId, quantity: i.quantity })),
                idempotencyKey,
            });

            let proofWarning: string | undefined;
            if (proofPath) {
                try {
                    await submitPaymentProof(result.orderId, selectedMethod.code, result.total, formData.reference.trim(), proofPath);
                } catch (err) {
                    console.error('submitPaymentProof failed', err);
                    proofWarning = 'تم إنشاء الطلب، لكن تعذر إرفاق إثبات الدفع. يمكنك إرفاقه من صفحة الطلب.';
                }
            }

            sessionStorage.removeItem(IDEMPOTENCY_KEY);
            navigate(`/orders/${result.orderId}`, { state: { justOrdered: true, orderNumber: result.orderNumber, proofWarning }, replace: true });
            clearCart();
        } catch (err) {
            console.error(err);
            setSubmitError(errorMessage(err, 'فشل إنشاء الطلب، حاولي مرة أخرى.'));
            setSubmitting(false);
        }
    };

    const inputClass = 'w-full bg-gray-50 border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-brand-blue';

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8">
            <h1 className="text-2xl font-bold text-gray-800 mb-8">إتمام الطلب</h1>

            {optionsError && (
                <div className="mb-6 bg-red-50 border border-red-100 text-red-700 rounded-xl p-4 text-sm">{optionsError}</div>
            )}

            <div className="grid md:grid-cols-2 gap-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                        <h2 className="font-bold border-b border-gray-50 pb-2">بيانات التوصيل</h2>
                        <label className="block">
                            <span className="text-sm font-bold text-gray-700 block mb-1">الاسم بالكامل</span>
                            <input required minLength={2} value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className={inputClass} />
                        </label>
                        <label className="block">
                            <span className="text-sm font-bold text-gray-700 block mb-1">رقم الهاتف</span>
                            <input required minLength={5} type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className={inputClass} />
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block">
                                <span className="text-sm font-bold text-gray-700 block mb-1">الولاية</span>
                                <select required value={formData.state} onChange={e => setFormData({ ...formData, state: e.target.value, zoneId: '' })} className={inputClass} disabled={loadingOptions}>
                                    {states.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-sm font-bold text-gray-700 block mb-1">المحلية</span>
                                <select required value={formData.zoneId} onChange={e => setFormData({ ...formData, zoneId: e.target.value })} className={inputClass} disabled={loadingOptions}>
                                    {stateZones.map(z => <option key={z.id} value={z.id}>{zoneLabel(z)} — {formatSDG(z.fee)}</option>)}
                                </select>
                            </label>
                        </div>
                        <label className="block">
                            <span className="text-sm font-bold text-gray-700 block mb-1">العنوان بالتفصيل</span>
                            <textarea required minLength={5} value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} className={inputClass} rows={3} />
                        </label>
                    </div>

                    <fieldset className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                        <legend className="font-bold border-b border-gray-50 pb-2 w-full">طريقة الدفع</legend>
                        <div className="space-y-3">
                            {loadingOptions && <p className="text-sm text-gray-500">جاري تحميل طرق الدفع...</p>}
                            {methods.map((pm) => {
                                const active = formData.paymentMethod === pm.code;
                                const Icon = pm.requiresProof ? Wallet : Banknote;
                                const accountEntries = Object.entries(pm.accountDetails ?? {});
                                return (
                                    <label key={pm.code} className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all ${active ? 'border-brand-blue bg-brand-blue-soft' : 'border-gray-200 hover:bg-gray-50'}`}>
                                        <input
                                            type="radio"
                                            name="payment"
                                            value={pm.code}
                                            checked={active}
                                            onChange={() => setFormData({ ...formData, paymentMethod: pm.code })}
                                            className="w-4 h-4 mt-1 text-brand-blue focus:ring-brand-blue"
                                        />
                                        <div className={`p-2 rounded-lg ${active ? 'bg-white' : 'bg-gray-100'}`}>
                                            <Icon className={`w-6 h-6 ${active ? 'text-brand-blue' : 'text-gray-500'}`} />
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-bold text-gray-800">{pm.nameAr}</p>
                                            {pm.descriptionAr && <p className="text-xs text-gray-500">{pm.descriptionAr}</p>}
                                            {active && accountEntries.length > 0 && (
                                                <div className="mt-2 text-xs bg-white rounded-lg p-2 border border-gray-100 space-y-1">
                                                    <p className="font-bold text-gray-700">بيانات التحويل:</p>
                                                    {accountEntries.map(([k, v]) => <p key={k} className="text-gray-600"><span className="font-semibold">{k}:</span> {String(v)}</p>)}
                                                </div>
                                            )}
                                        </div>
                                    </label>
                                );
                            })}
                        </div>

                        {selectedMethod?.requiresProof && (
                            <div className="space-y-3 pt-2 border-t border-gray-50">
                                <label className="block">
                                    <span className="text-sm font-bold text-gray-700 block mb-1">الرقم المرجعي</span>
                                    <input required value={formData.reference} onChange={e => setFormData({ ...formData, reference: e.target.value })} className={inputClass} placeholder="الرقم المرجعي للتحويل" />
                                </label>
                                <label className="block">
                                    <span className="text-sm font-bold text-gray-700 block mb-1">إثبات الدفع (صورة حتى 5 ميجابايت)</span>
                                    <input required type="file" accept="image/*" onChange={e => handleProofChange(e.target.files?.[0] ?? null)} className="w-full text-sm text-gray-600 file:ml-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-brand-blue-soft file:text-brand-blue file:font-bold" />
                                    {proofError && <p className="text-xs text-red-600 mt-1">{proofError}</p>}
                                    {proofFile && !proofError && <p className="text-xs text-green-600 mt-1">تم اختيار: {proofFile.name}</p>}
                                </label>
                            </div>
                        )}
                    </fieldset>

                    {submitError && (
                        <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl p-4 text-sm">{submitError}</div>
                    )}

                    <button
                        type="submit"
                        disabled={submitting || loadingOptions || !selectedZone || !selectedMethod}
                        className="w-full bg-brand-blue hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
                    >
                        {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /> جاري المعالجة...</> : `تأكيد الطلب (${formatSDG(total)})`}
                    </button>
                </form>

                <div className="h-fit bg-gray-50 p-6 rounded-2xl border border-gray-200 sticky top-24">
                    <h3 className="font-bold text-gray-800 mb-4">ملخص الطلب ({cartCount} منتجات)</h3>
                    <div className="space-y-3 mb-6 max-h-60 overflow-y-auto pr-2">
                        {cart.map((item) => (
                            <div key={item.productId} className="flex gap-3 text-sm">
                                <img src={item.image} className="w-12 h-12 rounded-lg object-cover" alt="" />
                                <div className="flex-1">
                                    <p className="font-bold text-gray-800">{item.name_ar}</p>
                                    <div className="flex justify-between mt-1">
                                        <span className="text-gray-500">x{item.quantity}</span>
                                        <span className="font-medium">{formatSDG(discountedPrice(item.price, item.discountPercentage))}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="space-y-2 border-t border-gray-200 pt-4">
                        <div className="flex justify-between text-gray-600">
                            <span>المجموع</span>
                            <span>{formatSDG(subtotal)}</span>
                        </div>
                        <div className="flex justify-between text-gray-600">
                            <span>التوصيل{selectedZone ? ` (${zoneLabel(selectedZone)})` : ''}</span>
                            <span>{selectedZone ? formatSDG(shipping) : '—'}</span>
                        </div>
                        <div className="flex justify-between font-bold text-lg text-gray-800 pt-2">
                            <span>الإجمالي</span>
                            <span className="text-brand-blue">{formatSDG(total)}</span>
                        </div>
                        <p className="text-xs text-gray-500 pt-1">يتم احتساب الإجمالي النهائي وتأكيده من النظام عند إنشاء الطلب.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

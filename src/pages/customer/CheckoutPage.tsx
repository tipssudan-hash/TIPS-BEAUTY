import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useStore } from '../../context/StoreContext';
import { useAuth } from '../../context/AuthContext';
import { CouponPreview, DeliveryZone, PaymentMethod } from '../../types';
import { checkout, previewCoupon, uploadPaymentProof, submitPaymentProof, fetchPaymentMethods, fetchDeliveryZones } from '../../lib/api';
import { couponRefusalMessage, errorMessage } from '../../lib/errors';
import { cartLineKey, cartLineUnavailable, cartUnitPrice } from '../../lib/pricing';
import { formatSDG } from '../../lib/format';
import { Banknote, Wallet, Loader2, Ticket, X } from 'lucide-react';
import { Card, Notice, Field, inputClass, primaryButtonClass } from '../../components/ui';

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
    const { cart, cartCount, clearCart, products } = useStore();
    const live = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
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

    // Coupon: typed, previewed by the backend, and only an accepted preview is sent with the Order.
    const [couponInput, setCouponInput] = useState('');
    const [coupon, setCoupon] = useState<CouponPreview | null>(null);
    const [couponError, setCouponError] = useState<string | null>(null);
    const [couponChecking, setCouponChecking] = useState(false);

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

    const lineSubtotal = cart.reduce((sum, item) => sum + cartUnitPrice(item, live.get(item.productId)) * item.quantity, 0);
    // An accepted Coupon replaces the line rules: the Order is priced from the base subtotal minus the Coupon.
    const couponApplied = coupon?.ok ? coupon : null;
    const subtotal = couponApplied ? couponApplied.baseSubtotal : lineSubtotal;
    const shipping = selectedZone?.fee ?? 0;
    const total = Math.max(subtotal - (couponApplied?.reduction ?? 0), 0) + shipping;
    const cartItems = cart.map(i => ({ id: i.productId, variant_id: i.variantId, quantity: i.quantity }));
    // A line whose Variant is gone would be refused by checkout_order: block the Order until it is removed.
    const hasUnavailableLine = cart.some(i => cartLineUnavailable(i, live.get(i.productId)));

    const applyCoupon = async () => {
        const code = couponInput.trim();
        if (!code) return;
        setCouponChecking(true);
        setCouponError(null);
        try {
            const result = await previewCoupon(code, cartItems);
            if (result.ok) {
                setCoupon(result);
            } else {
                setCoupon(null);
                setCouponError(couponRefusalMessage(result.reason));
            }
        } catch (err) {
            setCoupon(null);
            setCouponError(errorMessage(err, 'تعذر التحقق من كود الخصم.'));
        } finally {
            setCouponChecking(false);
        }
    };
    const removeCoupon = () => { setCoupon(null); setCouponError(null); setCouponInput(''); };
    // A preview is only good for the Cart it was computed on: drop it when the lines change.
    const cartSignature = cart.map(i => `${cartLineKey(i)}:${i.quantity}`).join(',');
    useEffect(() => { setCoupon(null); }, [cartSignature]);

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
                items: cartItems,
                couponCode: couponApplied?.code ?? null,
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

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8">
            <h1 className="text-2xl font-bold text-gray-800 mb-8">إتمام الطلب</h1>

            {optionsError && (
                <div className="mb-6"><Notice kind="error">{optionsError}</Notice></div>
            )}

            <div className="grid md:grid-cols-2 gap-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <Card className="p-6 space-y-4">
                        <h2 className="font-bold border-b border-gray-50 pb-2">بيانات التوصيل</h2>
                        <Field label="الاسم بالكامل" required>
                            <input required minLength={2} value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className={inputClass} />
                        </Field>
                        <Field label="رقم الهاتف" required>
                            <input required minLength={5} type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className={inputClass} />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="الولاية" required>
                                <select required value={formData.state} onChange={e => setFormData({ ...formData, state: e.target.value, zoneId: '' })} className={inputClass} disabled={loadingOptions}>
                                    {states.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </Field>
                            <Field label="المحلية" required>
                                <select required value={formData.zoneId} onChange={e => setFormData({ ...formData, zoneId: e.target.value })} className={inputClass} disabled={loadingOptions}>
                                    {stateZones.map(z => <option key={z.id} value={z.id}>{zoneLabel(z)} — {formatSDG(z.fee)}</option>)}
                                </select>
                            </Field>
                        </div>
                        <Field label="العنوان بالتفصيل" required>
                            <textarea required minLength={5} value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} className={inputClass} rows={3} />
                        </Field>
                    </Card>

                    <fieldset className="bg-white p-6 rounded-card shadow-card border border-gray-100 space-y-4">
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
                                <Field label="الرقم المرجعي" required>
                                    <input required value={formData.reference} onChange={e => setFormData({ ...formData, reference: e.target.value })} className={inputClass} placeholder="الرقم المرجعي للتحويل" />
                                </Field>
                                <Field label="إثبات الدفع (صورة حتى 5 ميجابايت)" required hint={proofFile && !proofError ? `تم اختيار: ${proofFile.name}` : undefined}>
                                    <input required type="file" accept="image/*" onChange={e => handleProofChange(e.target.files?.[0] ?? null)} className="w-full text-sm text-gray-600 file:ml-3 file:py-2 file:px-4 file:rounded-control file:border-0 file:bg-brand-blue-soft file:text-brand-blue file:font-bold" />
                                    {proofError && <p role="alert" className="text-xs text-red-600 mt-1">{proofError}</p>}
                                </Field>
                            </div>
                        )}
                    </fieldset>

                    {submitError && <Notice kind="error">{submitError}</Notice>}

                    <button
                        type="submit"
                        disabled={submitting || loadingOptions || !selectedZone || !selectedMethod || hasUnavailableLine}
                        className={`w-full ${primaryButtonClass}`}
                    >
                        {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /> جاري المعالجة...</> : `تأكيد الطلب (${formatSDG(total)})`}
                    </button>
                </form>

                <div className="h-fit bg-gray-50 p-6 rounded-card border border-gray-200 sticky top-24">
                    <h3 className="font-bold text-gray-800 mb-4">ملخص الطلب ({cartCount} منتجات)</h3>
                    <div className="space-y-3 mb-6 max-h-60 overflow-y-auto pr-2">
                        {cart.map((item) => (
                            <div key={cartLineKey(item)} className="flex gap-3 text-sm">
                                <img src={item.image} className="w-12 h-12 rounded-lg object-cover" alt="" />
                                <div className="flex-1">
                                    <p className="font-bold text-gray-800">{item.name_ar}</p>
                                    {item.variantName && <p className="text-xs text-gray-500">الخيار: {item.variantName}</p>}
                                    {cartLineUnavailable(item, live.get(item.productId)) && <p role="alert" className="text-xs text-red-600">هذا الخيار لم يعد متاحاً، احذفيه من السلة</p>}
                                    <div className="flex justify-between mt-1">
                                        <span className="text-gray-500">x{item.quantity}</span>
                                        <span className="font-medium">{formatSDG(cartUnitPrice(item, live.get(item.productId)))}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mb-4">
                        <label className="text-sm font-bold text-gray-700 flex items-center gap-1 mb-1"><Ticket className="w-4 h-4" /> كود الخصم</label>
                        {couponApplied ? (
                            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm">
                                <span className="font-bold text-green-700" dir="ltr">{couponApplied.code}</span>
                                <span className="text-green-700">- {formatSDG(couponApplied.reduction)}</span>
                                <button type="button" onClick={removeCoupon} className="text-gray-400 hover:text-red-500 min-w-8 min-h-8 flex items-center justify-center" aria-label="إزالة كود الخصم"><X className="w-4 h-4" /></button>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <input
                                    value={couponInput}
                                    onChange={e => { setCouponInput(e.target.value); setCouponError(null); }}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void applyCoupon(); } }}
                                    className={`${inputClass} flex-1`}
                                    placeholder="أدخلي الكود"
                                    dir="ltr"
                                    autoCapitalize="characters"
                                    aria-label="كود الخصم"
                                />
                                <button type="button" onClick={() => void applyCoupon()} disabled={couponChecking || !couponInput.trim()} className="px-4 rounded-lg bg-gray-800 text-white text-sm font-bold disabled:bg-gray-300">
                                    {couponChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'تطبيق'}
                                </button>
                            </div>
                        )}
                        {couponError && <p className="text-xs text-red-600 mt-1">{couponError}</p>}
                    </div>
                    <div className="space-y-2 border-t border-gray-200 pt-4">
                        <div className="flex justify-between text-gray-600">
                            <span>المجموع</span>
                            <span>{formatSDG(subtotal)}</span>
                        </div>
                        {couponApplied && (
                            <div className="flex justify-between text-green-700">
                                <span>كود الخصم ({couponApplied.code})</span>
                                <span>- {formatSDG(couponApplied.reduction)}</span>
                            </div>
                        )}
                        {couponApplied && couponApplied.lineReductions > 0 && (
                            <p className="text-xs text-gray-500">يُحسب كود الخصم على السعر الأصلي للمنتجات بدلاً من تخفيضاتها؛ لا تتراكم التخفيضات.</p>
                        )}
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

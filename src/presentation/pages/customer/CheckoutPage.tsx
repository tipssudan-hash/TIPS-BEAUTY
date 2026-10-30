import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useStore } from '../../context/StoreContext';
import { useAuth } from '../../context/AuthContext';
import { CouponPreview, CustomerAddress, DeliveryQuote, DeliveryZone, PaymentMethod } from '@domain/entities';
import {
    checkout, previewCoupon, previewDeliveryQuote, uploadPaymentProof, submitPaymentProof, fetchPaymentMethods, fetchDeliveryZones,
    cancelMyOrder, fetchMyAddresses, saveMyAddress, fetchLoyaltyProfile, type CheckoutItem,
} from '@infrastructure/repositories';
import { isValidSudanPhone, normalizeSudanPhone } from '@infrastructure/auth/phone';
import { couponRefusalMessage, errorMessage } from '@application/errors';
import { cartLineKey, cartLineUnavailable, cartSignature, cartUnitPrice } from '@domain/valueObjects';
import { formatSDG } from '@application/services/format';
import { Banknote, Wallet, Loader2, Ticket, X } from 'lucide-react';
import { Card, Notice, Field, inputClass, primaryButtonClass } from '../../components/ui';
import { useCustomerGps, type CustomerGpsState } from '../../hooks/useCustomerGps';
import { useCartPricing } from '../../hooks/useCartPricing';
import { usePageMeta } from '../../hooks/usePageMeta';

const IDEMPOTENCY_KEY = 'checkout_idempotency_key';
const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const DEFAULT_SUFFIX = ' — افتراضي';
const LOW_GPS_ACCURACY_METERS = 100;
const DEFAULT_ADDRESS_LABEL = 'المنزل';

// A key names one Order attempt: it changes whenever the attempt's content changes, or its Order is cancelled.
function newIdempotencyKey(): string {
    const key = crypto.randomUUID();
    sessionStorage.setItem(IDEMPOTENCY_KEY, key);
    return key;
}

function getIdempotencyKey(): string {
    return sessionStorage.getItem(IDEMPOTENCY_KEY) ?? newIdempotencyKey();
}

function errorDetail(err: unknown): string {
    return err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '';
}

const isDefaultZone = (zone: DeliveryZone) => zone.name.endsWith(DEFAULT_SUFFIX);
const zoneLabel = (zone: DeliveryZone) => isDefaultZone(zone) ? `محليات أخرى في ${zone.state ?? ''}` : zone.name;
const zoneForAddress = (zones: DeliveryZone[], address: CustomerAddress) =>
    zones.find((z) => z.state === address.state && z.name === address.city) ?? null;

const GPS_FAILURE_MESSAGES: Partial<Record<CustomerGpsState['status'], string>> = {
    timeout: 'استغرق تحديد الموقع وقتاً طويلاً، يمكنك المحاولة مجدداً.',
};

const GpsCapture: React.FC<{ gps: CustomerGpsState; manual: boolean; onManual: () => void; onExitManual: () => void }> = ({ gps, manual, onManual, onExitManual }) => {
    if (gps.status === 'requesting') {
        return (
            <p className="flex items-center gap-2 text-sm text-gray-600" role="status">
                <Loader2 className="w-4 h-4 animate-spin" /> جاري تحديد موقعك...
            </p>
        );
    }
    if (gps.status === 'granted') {
        return (
            <div className="space-y-1">
                <div className="flex items-center justify-between gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700" role="status">
                    <span>✓ تم تحديد موقعك{gps.accuracyMeters != null ? ` - دقة ${Math.round(gps.accuracyMeters)} متر` : ''}</span>
                    <button type="button" onClick={gps.clearGps} className="text-gray-400 hover:text-red-500 min-w-8 min-h-8 flex items-center justify-center" aria-label="إلغاء تحديد الموقع"><X className="w-4 h-4" /></button>
                </div>
                {gps.accuracyMeters != null && gps.accuracyMeters > LOW_GPS_ACCURACY_METERS && (
                    <p className="text-xs text-amber-700">دقة الموقع منخفضة؛ جرّبي من الموبايل مع تفعيل الـ GPS أو من مكان مفتوح</p>
                )}
            </div>
        );
    }
    if (gps.status === 'denied' || gps.status === 'unavailable') {
        return (
            <div className="space-y-3">
                <Notice kind="error">
                    {gps.status === 'denied'
                        ? 'تم حظر صلاحية الموقع. يمكنك تفعيلها من إعدادات المتصفح، أو المتابعة بتحديد الولاية والمحلية والعنوان.'
                        : 'الموقع الجغرافي غير متاح على هذا الجهاز. يمكنك المتابعة بتحديد الولاية والمحلية والعنوان.'}
                </Notice>
                {manual ? (
                    <div className="space-y-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                        <p>سنعتمد الولاية والمحلية والعنوان الذي تكتبينه أدناه. سيؤكد فريقنا العنوان معك هاتفياً قبل التوصيل.</p>
                        <div className="flex flex-wrap gap-3">
                            <button type="button" onClick={gps.requestGps} className="px-3 py-1.5 rounded-lg border border-amber-300 text-xs font-bold text-amber-800 hover:bg-amber-100">📍 إعادة تحديد الموقع</button>
                            <button type="button" onClick={onExitManual} className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-600 hover:bg-white">إلغاء</button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-3">
                        <button type="button" onClick={gps.requestGps} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50">📍 إعادة المحاولة</button>
                        <button type="button" onClick={onManual} className="px-4 py-2 rounded-lg border border-brand-blue text-sm font-bold text-brand-blue hover:bg-brand-blue-soft">المتابعة بالولاية والمحلية والعنوان</button>
                    </div>
                )}
            </div>
        );
    }
    const failure = GPS_FAILURE_MESSAGES[gps.status];
    return (
        <div className="space-y-2">
            <Notice kind="error">يرجى تحديد موقعك أولاً للمتابعة.</Notice>
            <button type="button" onClick={gps.requestGps} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50">📍 حدد موقعي</button>
            {failure && <p role="alert" className="text-xs text-gray-500">{failure}</p>}
        </div>
    );
};

export const CheckoutPage: React.FC = () => {
    const { cart, cartCount, clearCart, products, revalidateCart } = useStore();
    const live = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
    const { user } = useAuth();
    const navigate = useNavigate();
    const gps = useCustomerGps();

    usePageMeta({ title: 'إتمام الطلب | Tips Beauty', noindex: true });

    const [zones, setZones] = useState<DeliveryZone[]>([]);
    const [methods, setMethods] = useState<PaymentMethod[]>([]);
    const [loadingOptions, setLoadingOptions] = useState(true);
    const [optionsError, setOptionsError] = useState<string | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [orphanOrder, setOrphanOrder] = useState<{ orderId: string; orderNumber: string } | null>(null);
    const [idempotencyKey, setIdempotencyKey] = useState(getIdempotencyKey);

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

    // Without GPS (permission refused or no device support) the customer picks state, locality and address instead.
    const [manualLocation, setManualLocation] = useState(false);

    const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
    const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
    const [saveAddress, setSaveAddress] = useState(false);
    const [addressLabel, setAddressLabel] = useState(DEFAULT_ADDRESS_LABEL);

    // Coupon: the code stays in the field while it is applied. Its validity is re-checked by the backend on every
    // Cart change (useCartPricing), and a refusal shows its reason instead of silently dropping the code.
    const [couponInput, setCouponInput] = useState('');
    const [appliedCode, setAppliedCode] = useState<string | null>(null);
    const [couponError, setCouponError] = useState<string | null>(null);
    const [couponChecking, setCouponChecking] = useState(false);

    const [loyaltyBalance, setLoyaltyBalance] = useState<number | null>(null);
    const [pointsInput, setPointsInput] = useState('');

    // A live preview of what checkout_order_safe will actually charge for delivery; null before the answer or on error,
    // in which case the zone's listed fee is shown as an estimate.
    const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);

    const cartItems = useMemo<CheckoutItem[]>(
        () => cart.map(i => ({ id: i.productId, variant_id: i.variantId, quantity: i.quantity })),
        [cart],
    );
    const signature = cartSignature(cart);

    useEffect(() => { void revalidateCart(); }, [revalidateCart]);

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
        if (!user) return;
        fetchLoyaltyProfile(user.id)
            .then(profile => setLoyaltyBalance(profile.beautyPoints))
            .catch(err => console.error('Loyalty balance failed', err));
        fetchMyAddresses()
            .then(setAddresses)
            .catch(err => console.error('Saved addresses failed', err));
    }, [user]);

    const loadOptions = useCallback(async () => {
        setLoadingOptions(true);
        setOptionsError(null);
        try {
            const [z, m] = await Promise.all([fetchDeliveryZones(), fetchPaymentMethods()]);
            setZones(z);
            setMethods(m);
            setFormData(prev => ({
                ...prev,
                state: prev.state || (z.find(x => x.state === 'الخرطوم')?.state ?? z[0]?.state ?? ''),
                paymentMethod: prev.paymentMethod || (m[0]?.code ?? ''),
            }));
        } catch (err) {
            setOptionsError(errorMessage(err, 'تعذر تحميل خيارات التوصيل والدفع.'));
        } finally {
            setLoadingOptions(false);
        }
    }, []);

    useEffect(() => { void loadOptions(); }, [loadOptions]);

    // The default saved address is pre-filled once, as soon as both the addresses and the zones are known.
    const defaultAddressApplied = useRef(false);
    useEffect(() => {
        if (defaultAddressApplied.current || addresses.length === 0 || zones.length === 0) return;
        defaultAddressApplied.current = true;
        const fallback = addresses.find(a => a.isDefault);
        if (!fallback) return;
        const zone = zoneForAddress(zones, fallback);
        setSelectedAddressId(fallback.id);
        setFormData(prev => ({
            ...prev,
            name: fallback.recipientName || prev.name,
            phone: fallback.phone || prev.phone,
            state: fallback.state,
            zoneId: zone?.id ?? prev.zoneId,
            address: fallback.addressLine,
        }));
    }, [addresses, zones]);

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

    const gpsReady = gps.status === 'granted' && gps.latitude != null && gps.longitude != null;
    const locationMode: 'gps' | 'zone' | null = gpsReady ? 'gps' : manualLocation ? 'zone' : null;

    // Re-quoted whenever the zone, the Cart or the location basis changes. Without GPS the backend prices from the zone.
    const hasZone = selectedZone !== null;
    useEffect(() => {
        if (!hasZone || locationMode === null) {
            setDeliveryQuote(null);
            return;
        }
        let cancelled = false;
        previewDeliveryQuote(cartItems, gpsReady ? gps.latitude : null, gpsReady ? gps.longitude : null)
            .then(q => { if (!cancelled) setDeliveryQuote(q); })
            .catch(err => { console.error('Delivery quote preview failed', err); if (!cancelled) setDeliveryQuote(null); });
        return () => { cancelled = true; };
    }, [hasZone, formData.zoneId, cartItems, locationMode, gpsReady, gps.latitude, gps.longitude]);

    const lineSubtotal = cart.reduce((sum, item) => sum + cartUnitPrice(item, live.get(item.productId)) * item.quantity, 0);
    // The backend's price for this Cart and the applied Coupon. Until it answers, the local estimate above stands in.
    const cartPricing = useCartPricing(cartItems, appliedCode);
    const pricing = cartPricing.pricing;
    const pricedCoupon = pricing?.coupon && !pricing.coupon.reason && pricing.coupon.code
        ? { code: pricing.coupon.code, reduction: pricing.coupon.reduction }
        : null;
    const couponRejected = Boolean(appliedCode && pricing && !pricedCoupon);
    const couponRefusal = couponRejected ? couponRefusalMessage(pricing?.coupon?.reason) : null;
    const subtotal = pricing ? pricing.baseSubtotal - pricing.lineReductions : lineSubtotal;
    const shipping = deliveryQuote?.fee ?? selectedZone?.fee ?? 0;
    const total = Math.max(subtotal - (pricedCoupon?.reduction ?? 0), 0) + shipping;
    // A line whose Variant is gone would be refused by checkout_order: block the Order until it is removed.
    const hasUnavailableLine = cart.some(i => cartLineUnavailable(i, live.get(i.productId)));

    const pointsValue = Math.floor(Number(pointsInput) || 0);
    const pointsError = pointsValue > 0 && loyaltyBalance !== null && pointsValue > loyaltyBalance
        ? `رصيدك ${loyaltyBalance} نقطة فقط`
        : pointsValue < 0 ? 'لا يمكن استخدام عدد سالب من النقاط' : null;

    const applyCoupon = async () => {
        const code = couponInput.trim();
        if (!code) return;
        setCouponChecking(true);
        setCouponError(null);
        try {
            const result: CouponPreview = await previewCoupon(code, cartItems);
            if (result.ok) {
                setAppliedCode(code);
            } else {
                setAppliedCode(null);
                setCouponError(couponRefusalMessage(result.reason));
            }
        } catch (err) {
            setAppliedCode(null);
            setCouponError(errorMessage(err, 'تعذر التحقق من كود الخصم.'));
        } finally {
            setCouponChecking(false);
        }
    };
    const removeCoupon = () => { setAppliedCode(null); setCouponError(null); setCouponInput(''); };

    const selectSavedAddress = (id: string) => {
        if (!id) {
            setSelectedAddressId(null);
            return;
        }
        const address = addresses.find(a => a.id === id);
        if (!address) return;
        const zone = zoneForAddress(zones, address);
        setSelectedAddressId(address.id);
        setFormData(prev => ({
            ...prev,
            name: address.recipientName || prev.name,
            phone: address.phone || prev.phone,
            state: address.state,
            zoneId: zone?.id ?? prev.zoneId,
            address: address.addressLine,
        }));
    };

    // Editing the address by hand makes it a new address, so the saved one is no longer the one being used.
    const editField = (patch: Partial<typeof formData>) => {
        if ('state' in patch || 'zoneId' in patch || 'address' in patch) setSelectedAddressId(null);
        setFormData(prev => ({ ...prev, ...patch }));
    };

    // A changed cart, coupon, address, location basis or payment method starts a new attempt, hence a new key.
    const attemptFingerprint = [signature, pricedCoupon?.code ?? '', formData.address, formData.paymentMethod, formData.zoneId, locationMode ?? '', pointsValue].join('|');
    const attemptFingerprintRef = useRef(attemptFingerprint);
    useEffect(() => {
        if (attemptFingerprintRef.current === attemptFingerprint) return;
        attemptFingerprintRef.current = attemptFingerprint;
        setIdempotencyKey(newIdempotencyKey());
    }, [attemptFingerprint]);

    if (cartCount === 0 && !submitting) return <Navigate to="/cart" replace />;

    const handleProofChange = (file: File | null) => {
        setProofError(null);
        if (!file) { setProofFile(null); return; }
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            setProofError('يرجى اختيار صورة صحيحة لإثبات الدفع بصيغة PNG أو JPG أو WebP.');
            setProofFile(null);
            return;
        }
        if (file.size > MAX_PROOF_BYTES) { setProofError('حجم الصورة يجب ألا يتجاوز 5 ميجابايت.'); setProofFile(null); return; }
        setProofFile(file);
    };

    // An Order without its proof is cancelled so it cannot sit unpaid; the key moves on only once that cancel succeeds,
    // because a retry under a surviving key returns the same Order and can still attach the proof to it.
    const discardUnpaidOrder = async (orderId: string, orderNumber: string) => {
        try {
            await cancelMyOrder(orderId);
            setIdempotencyKey(newIdempotencyKey());
            setSubmitError('أُنشئ الطلب ثم أُلغي لتعذّر إرفاق الإثبات');
        } catch (cancelErr) {
            console.error('cancelMyOrder failed after proof error', cancelErr);
            setOrphanOrder({ orderId, orderNumber });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        setOrphanOrder(null);
        if (!locationMode) {
            setSubmitError(
                gps.status === 'denied'
                    ? 'صلاحية الموقع محظورة. فعّليها من إعدادات المتصفح، أو تابعي بتحديد الولاية والمحلية والعنوان.'
                    : 'يرجى تحديد موقعك أولاً للمتابعة.'
            );
            return;
        }
        if (locationMode === 'zone' && !formData.address.trim()) {
            setSubmitError('يرجى كتابة العنوان بالتفصيل، لأن الموقع لم يُحدَّد.');
            return;
        }
        if (!user || !selectedZone || !selectedMethod) return;

        if (!isValidSudanPhone(formData.phone)) {
            setSubmitError('يرجى إدخال رقم هاتف سوداني صحيح.');
            return;
        }
        if (pointsError) {
            setSubmitError(pointsError);
            return;
        }
        if (couponRejected) {
            setSubmitError('كود الخصم لم يعد صالحاً لهذه السلة. أزيليه للمتابعة.');
            return;
        }

        if (selectedMethod.requiresProof) {
            if (!formData.reference.trim()) { setSubmitError('يرجى إدخال الرقم المرجعي.'); return; }
            if (!proofFile) { setProofError('يرجى إرفاق إثبات الدفع.'); return; }
        }

        setSubmitting(true);
        try {
            let proofPath: string | null = null;
            if (selectedMethod.requiresProof && proofFile) {
                try {
                    proofPath = await uploadPaymentProof(user.id, idempotencyKey, proofFile);
                } catch (err) {
                    setSubmitError(errorMessage(err, 'تعذر رفع صورة إثبات الدفع، تحققي من اتصالك وحاولي مرة أخرى.'));
                    setSubmitting(false);
                    return;
                }
            }

            const phone = normalizeSudanPhone(formData.phone) ?? formData.phone.trim();
            const result = await checkout({
                customerName: formData.name.trim(),
                phone,
                shippingAddress: formData.address.trim() || 'الموقع محدد عبر الخريطة',
                zoneName: selectedZone.name,
                state: formData.state,
                paymentMethod: selectedMethod.code,
                items: cartItems,
                couponCode: pricedCoupon?.code ?? null,
                idempotencyKey,
                customerLat: gpsReady ? gps.latitude : null,
                customerLng: gpsReady ? gps.longitude : null,
                pointsToRedeem: pointsValue,
            });

            if (proofPath) {
                try {
                    await submitPaymentProof(result.orderId, selectedMethod.code, result.total, formData.reference.trim(), proofPath);
                } catch (err) {
                    console.error('submitPaymentProof failed', err);
                    await discardUnpaidOrder(result.orderId, result.orderNumber);
                    setSubmitting(false);
                    return;
                }
            }

            if (saveAddress && !selectedAddressId && formData.address.trim()) {
                try {
                    await saveMyAddress(user.id, {
                        label: addressLabel.trim() || DEFAULT_ADDRESS_LABEL,
                        recipientName: formData.name,
                        phone,
                        state: formData.state,
                        city: selectedZone.name,
                        addressLine: formData.address,
                        latitude: gpsReady ? gps.latitude : null,
                        longitude: gpsReady ? gps.longitude : null,
                    }, addresses.length === 0);
                } catch (err) {
                    console.error('saveMyAddress failed', err);
                }
            }

            sessionStorage.removeItem(IDEMPOTENCY_KEY);
            navigate(`/orders/${result.orderId}`, { state: { justOrdered: true, orderNumber: result.orderNumber, unconfirmedLocation: locationMode === 'zone' }, replace: true });
            clearCart();
        } catch (err) {
            console.error(err);
            // A refused key belongs to a request with other content (or to a cancelled Order): the next attempt needs its own.
            if (/IDEMPOTENCY_(ORDER_CANCELLED|KEY_REUSED)/.test(errorDetail(err))) setIdempotencyKey(newIdempotencyKey());
            setSubmitError(errorMessage(err, 'تعذر إنشاء الطلب، تحققي من اتصالك وحاولي مرة أخرى.'));
            setSubmitting(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 animate-fadeIn">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6">إتمام الطلب</h1>

            {optionsError && (
                <div className="mb-6 space-y-3">
                    <Notice kind="error">{optionsError}</Notice>
                    <button type="button" onClick={() => void loadOptions()} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50">إعادة المحاولة</button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
                <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-6">
                    <Card className="p-6 space-y-4">
                        <h2 className="font-bold border-b border-gray-50 pb-2">بيانات التوصيل</h2>
                        {addresses.length > 0 && (
                            <Field label="عنوان محفوظ">
                                <select value={selectedAddressId ?? ''} onChange={e => selectSavedAddress(e.target.value)} className={inputClass}>
                                    <option value="">عنوان جديد</option>
                                    {addresses.map(a => <option key={a.id} value={a.id}>{a.label} — {a.city}، {a.state}</option>)}
                                </select>
                            </Field>
                        )}
                        <Field label="الاسم بالكامل" required>
                            <input required minLength={2} value={formData.name} onChange={e => editField({ name: e.target.value })} className={inputClass} />
                        </Field>
                        <Field label="رقم الهاتف" required>
                            <input required minLength={5} type="tel" value={formData.phone} onChange={e => editField({ phone: e.target.value })} className={inputClass} />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="الولاية" required>
                                <select required value={formData.state} onChange={e => editField({ state: e.target.value, zoneId: '' })} className={inputClass} disabled={loadingOptions}>
                                    {states.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </Field>
                            <Field label="المحلية" required>
                                <select required value={formData.zoneId} onChange={e => editField({ zoneId: e.target.value })} className={inputClass} disabled={loadingOptions}>
                                    {stateZones.map(z => <option key={z.id} value={z.id}>{zoneLabel(z)} — {formatSDG(z.fee)}</option>)}
                                </select>
                            </Field>
                        </div>
                        {!loadingOptions && !optionsError && zones.length === 0 && (
                            <p className="text-sm text-gray-500">لا توجد محليات توصيل متاحة حالياً.</p>
                        )}
                        <Field label="العنوان بالتفصيل" hint={manualLocation && !gpsReady ? 'معالم قريبة، رقم العمارة أو الشقة. مطلوب لأن الموقع لم يُحدَّد.' : 'معالم قريبة، رقم العمارة أو الشقة'}>
                            <textarea
                                value={formData.address}
                                onChange={e => editField({ address: e.target.value })}
                                className={inputClass}
                                rows={3}
                                required={manualLocation && !gpsReady}
                                placeholder="معالم إضافية، رقم الشقة أو الطابق"
                            />
                        </Field>
                        {user && !selectedAddressId && (
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm text-gray-700">
                                    <input type="checkbox" checked={saveAddress} onChange={e => setSaveAddress(e.target.checked)} disabled={!formData.address.trim()} className="w-4 h-4" />
                                    حفظ هذا العنوان
                                </label>
                                {saveAddress && (
                                    <Field label="اسم العنوان" hint="مثل: المنزل أو العمل">
                                        <input value={addressLabel} maxLength={30} onChange={e => setAddressLabel(e.target.value)} className={inputClass} />
                                    </Field>
                                )}
                            </div>
                        )}
                        {/* Customer location pin: GPS pricing when granted; otherwise the zone and address above are used. */}
                        <GpsCapture
                            gps={gps}
                            manual={manualLocation}
                            onManual={() => setManualLocation(true)}
                            onExitManual={() => setManualLocation(false)}
                        />
                        {locationMode === 'zone' && (
                            <p className="text-xs text-gray-500">سيؤكد فريقنا العنوان معك هاتفياً قبل تأكيد الطلب.</p>
                        )}
                    </Card>

                    <fieldset className="bg-white p-6 rounded-card shadow-card border border-gray-100 space-y-4">
                        <legend className="font-bold border-b border-gray-50 pb-2 w-full">طريقة الدفع</legend>
                        <div className="space-y-3">
                            {loadingOptions && <p className="text-sm text-gray-500">جاري تحميل طرق الدفع...</p>}
                            {!loadingOptions && !optionsError && methods.length === 0 && <p className="text-sm text-gray-500">لا توجد طرق دفع متاحة حالياً.</p>}
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
                                <Field label="إثبات الدفع - صورة حتى 5 ميجابايت" required hint={proofFile && !proofError ? `تم اختيار: ${proofFile.name}` : undefined}>
                                    <input required type="file" accept="image/*" onChange={e => handleProofChange(e.target.files?.[0] ?? null)} className="w-full text-sm text-gray-600 file:ml-3 file:py-2 file:px-4 file:rounded-control file:border-0 file:bg-brand-blue-soft file:text-brand-blue file:font-bold" />
                                    {proofError && <p role="alert" className="text-xs text-red-600 mt-1">{proofError}</p>}
                                </Field>
                            </div>
                        )}
                    </fieldset>

                    {submitError && <Notice kind="error">{submitError}</Notice>}
                    {orphanOrder && (
                        <Notice kind="error">
                            تعذّر إلغاء الطلب {orphanOrder.orderNumber} الذي أُنشئ دون إرفاق الإثبات. <Link to={`/orders/${orphanOrder.orderId}`} className="font-bold underline">افتحي الطلب</Link> لإلغائه قبل إعادة المحاولة.
                        </Notice>
                    )}

                    <button
                        type="submit"
                        disabled={submitting || loadingOptions || !!optionsError || !selectedZone || !selectedMethod || hasUnavailableLine || !locationMode || couponRejected || !!pointsError}
                        className={`w-full ${primaryButtonClass}`}
                    >
                        {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /> جاري المعالجة...</> : `تأكيد الطلب (${formatSDG(total)})`}
                    </button>
                </form>

                <div className="lg:col-span-5 h-fit bg-white p-5 sm:p-6 rounded-2xl border border-brand-blue-soft shadow-card lg:sticky lg:top-20">
                    <h3 className="font-bold text-gray-800 mb-4 pb-2 border-b border-gray-100">ملخص الطلب ({cartCount} منتجات)</h3>
                    <div className="space-y-3 mb-6 max-h-60 overflow-y-auto pr-2">
                        {cart.map((item, index) => (
                            <div key={cartLineKey(item)} className="flex gap-3 text-sm">
                                <img src={item.image} loading="lazy" decoding="async" width={48} height={48} className="w-12 h-12 rounded-lg object-cover" alt="" />
                                <div className="flex-1">
                                    <p className="font-bold text-gray-800">{item.name_ar}</p>
                                    {item.variantName && <p className="text-xs text-gray-500">الخيار: {item.variantName}</p>}
                                    {cartLineUnavailable(item, live.get(item.productId)) && <p role="alert" className="text-xs text-red-600">هذا الخيار لم يعد متاحاً، احذفيه من السلة</p>}
                                    <div className="flex justify-between mt-1">
                                        <span className="text-gray-500">x{item.quantity}</span>
                                        <span className="font-medium">{formatSDG(pricing?.lines.find(l => l.lineIndex === index)?.effectiveUnitPrice ?? cartUnitPrice(item, live.get(item.productId)))}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mb-4">
                        <label htmlFor="coupon-code" className="text-sm font-bold text-gray-700 flex items-center gap-1 mb-1"><Ticket className="w-4 h-4" /> كود الخصم</label>
                        <div className="flex gap-2">
                            <input
                                id="coupon-code"
                                value={couponInput}
                                onChange={e => { setCouponInput(e.target.value); setCouponError(null); }}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void applyCoupon(); } }}
                                className={`${inputClass} flex-1`}
                                placeholder="أدخلي الكود"
                                dir="ltr"
                                autoCapitalize="characters"
                            />
                            {appliedCode ? (
                                <button type="button" onClick={removeCoupon} className="px-3 rounded-lg border border-gray-200 text-gray-600 text-sm font-bold hover:bg-gray-50 flex items-center gap-1" aria-label="إزالة كود الخصم">
                                    <X className="w-4 h-4" /> إزالة
                                </button>
                            ) : (
                                <button type="button" onClick={() => void applyCoupon()} disabled={couponChecking || !couponInput.trim()} className="px-4 rounded-lg bg-gray-800 text-white text-sm font-bold disabled:bg-gray-300">
                                    {couponChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'تطبيق'}
                                </button>
                            )}
                        </div>
                        {couponError && <p className="text-xs text-red-600 mt-1">{couponError}</p>}
                        {pricedCoupon && <p className="text-xs text-green-700 mt-1">✓ الكود {pricedCoupon.code} مطبّق</p>}
                        {couponRefusal && (
                            <p role="alert" className="text-xs text-red-600 mt-1">
                                {couponRefusal}. الكود ما زال في الحقل؛ أزيليه للمتابعة بدونه.
                            </p>
                        )}
                    </div>
                    {loyaltyBalance !== null && loyaltyBalance > 0 && (
                        <div className="mb-4 space-y-1">
                            <label htmlFor="points-input" className="text-sm font-bold text-gray-700">استخدام النقاط</label>
                            <input
                                id="points-input"
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={loyaltyBalance}
                                step={1}
                                value={pointsInput}
                                onChange={e => setPointsInput(e.target.value)}
                                className={inputClass}
                                placeholder={`حتى ${loyaltyBalance} نقطة`}
                            />
                            <p className="text-xs text-gray-500">رصيدك {loyaltyBalance} نقطة. تُحسب قيمة النقاط عند تأكيد الطلب.</p>
                            {pointsError && <p role="alert" className="text-xs text-red-600">{pointsError}</p>}
                        </div>
                    )}
                    <div className="space-y-2 border-t border-gray-200 pt-4">
                        {cartPricing.error && (
                            <div className="space-y-2">
                                <Notice kind="error">تعذر حساب العروض من الخادم، والمبلغ أدناه تقدير وقد يختلف عند تأكيد الطلب.</Notice>
                                <button type="button" onClick={cartPricing.retry} className="text-brand-blue text-xs font-bold hover:underline">إعادة المحاولة</button>
                            </div>
                        )}
                        {pricing && pricing.lineReductions > 0 && (
                            <div className="flex justify-between text-gray-500 text-sm">
                                <span>قبل العروض</span>
                                <span className="line-through">{formatSDG(pricing.baseSubtotal)}</span>
                            </div>
                        )}
                        {pricing?.appliedPromotions.map((p) => (
                            <div key={p.promotionId} className="flex justify-between text-green-700 text-sm">
                                <span>{p.ruleLabel}</span>
                                <span>- {formatSDG(p.reduction)}</span>
                            </div>
                        ))}
                        <div className="flex justify-between text-gray-600">
                            <span>المجموع{pricing ? '' : ' (تقدير)'}</span>
                            <span>{formatSDG(subtotal)}</span>
                        </div>
                        {pricedCoupon && (
                            <div className="flex justify-between text-green-700">
                                <span>كود الخصم ({pricedCoupon.code})</span>
                                <span>- {formatSDG(pricedCoupon.reduction)}</span>
                            </div>
                        )}
                        {pricedCoupon && pricing && pricing.coupon && pricing.coupon.reduction > 0 && pricing.lineReductions > 0 && (
                            <p className="text-xs text-gray-500">يُحسب كود الخصم على السعر الأصلي للمنتجات بدلاً من تخفيضاتها؛ لا تتراكم التخفيضات.</p>
                        )}
                        <div className="flex justify-between text-gray-600">
                            <span>التوصيل{selectedZone ? ` (${zoneLabel(selectedZone)})` : ''}</span>
                            <span>{selectedZone ? formatSDG(shipping) : '—'}</span>
                        </div>
                        {selectedZone && !deliveryQuote && locationMode === 'zone' && (
                            <p className="text-xs text-gray-500">رسوم التوصيل المعروضة تقدير من المحلية المختارة، ويؤكدها النظام عند إنشاء الطلب.</p>
                        )}
                        {deliveryQuote && (
                            <div className="text-xs text-gray-500 space-y-1">
                                {deliveryQuote.distanceKm > 0 && (
                                    <p>
                                        المسافة التقديرية: {deliveryQuote.distanceKm.toFixed(1)} كم
                                        {deliveryQuote.warehousesCount > 1 && ` (من ${deliveryQuote.warehousesCount} مستودعات)`}
                                    </p>
                                )}
                                {deliveryQuote.etaMinutes != null && (
                                    <p>
                                        الوصول خلال حوالي {deliveryQuote.etaMinutes < 60 ? `${deliveryQuote.etaMinutes} دقيقة` : `${Math.round(deliveryQuote.etaMinutes / 60)} ساعة`} —
                                        {' '}تنبيه: وقت التوصيل المعروض تقديري وقد يختلف حسب حالة الطريق والظروف الجوية.
                                    </p>
                                )}
                            </div>
                        )}
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

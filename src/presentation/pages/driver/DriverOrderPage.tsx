import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
    ArrowRight,
    Phone,
    Banknote,
    PackageCheck,
    AlertTriangle,
    Loader2,
    StickyNote,
    MessageCircle,
    CheckSquare,
    Square,
    ShieldCheck,
    Package,
    Clock,
    Navigation,
    Copy,
    Check,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';
import { useDriver } from './DriverContext';
import { fetchDriverDelivery as fetchMyDelivery, updateMyDeliveryStatus, type Delivery } from '@infrastructure/repositories';
import { errorMessage } from '@application/errors';
import { formatSDG, formatDateTime } from '@application/services/format';
import { EmptyState, Notice, Spinner } from '../../components/ui';
import { cn } from '@presentation/utils/cn';
import { useProductImageMap } from '../../hooks/useProductImageMap';
import { BarcodeScannerModal } from '../../components/driver/BarcodeScannerModal';

const FAILURE_REASONS = [
    'العميل لا يرد على الهاتف',
    'العنوان غير صحيح أو غير واضح',
    'العميل رفض استلام الطلب',
    'العميل طلب تأجيل موعد التوصيل',
    'تعذر الوصول إلى الموقع الجغرافي',
];

export const DriverOrderPage: React.FC = () => {
    const { id } = useParams();
    const { deliveries, refresh } = useDriver();
    const { getProductImageUrl } = useProductImageMap();
    const [fallback, setFallback] = useState<Delivery | null | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [failing, setFailing] = useState(false);
    const [reason, setReason] = useState(FAILURE_REASONS[0]);
    const [note, setNote] = useState('');
    const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});
    const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
    const [barcodeVerified, setBarcodeVerified] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const [showAllProducts, setShowAllProducts] = useState(false);

    const fromFeed = deliveries.find((d) => d.id === id);
    useEffect(() => {
        if (fromFeed || !id) return;
        let cancelled = false;
        fetchMyDelivery(id)
            .then((d) => {
                if (!cancelled) setFallback(d);
            })
            .catch(() => {
                if (!cancelled) setFallback(null);
            });
        return () => {
            cancelled = true;
        };
    }, [id, fromFeed]);

    const delivery = fromFeed ?? fallback;

    if (delivery === undefined) return <Spinner label="جاري تحميل بيانات الطلب..." />;
    if (!delivery) {
        return (
            <EmptyState
                title="هذا الطلب ليس مسنداً إليك"
                body="قد يكون الطلب قد تم إعادة إسناده أو إنجازه بالفعل."
                action={
                    <Link to="/driver" className="inline-flex items-center justify-center px-5 py-2.5 bg-black text-white font-bold text-sm rounded-lg hover:bg-gray-800 transition-colors">
                        العودة إلى توصيلاتي
                    </Link>
                }
            />
        );
    }

    const toggleItemChecked = (index: number) => {
        setCheckedItems((prev) => ({ ...prev, [index]: !prev[index] }));
    };

    const copyToClipboard = async (text: string, label: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(label);
            setTimeout(() => setCopied(null), 2000);
        } catch {
            // Fallback
        }
    };

    const act = async (status: 'shipped' | 'delivered' | 'delivery_failed') => {
        if (status === 'delivered') {
            if (delivery.codAmount != null && delivery.codAmount > 0) {
                const confirmed = window.confirm(
                    `تأكيد تسليم الطلب وتحصيل مبلغ ${formatSDG(delivery.codAmount)} نقداً من العميل؟`
                );
                if (!confirmed) return;
            } else {
                if (!window.confirm('تأكيد تسليم الطلب للعميل؟')) return;
            }
        }

        setBusy(true);
        setError(null);
        try {
            await updateMyDeliveryStatus(
                delivery.id,
                status,
                status === 'delivery_failed' ? reason : undefined,
                note.trim() || undefined
            );
            setFailing(false);
            setNote('');
            await refresh();
            if (fallback) setFallback(await fetchMyDelivery(delivery.id));
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحديث حالة الطلب.'));
        } finally {
            setBusy(false);
        }
    };

    const cleanPhone = delivery.phone.replace(/[^0-9]/g, '');
    const formattedPhone = cleanPhone.startsWith('0')
        ? `249${cleanPhone.slice(1)}`
        : cleanPhone.startsWith('249')
        ? cleanPhone
        : `249${cleanPhone}`;
    const displayPhone = delivery.phone;

    const whatsappMessage = encodeURIComponent(
        `مرحباً ${delivery.customerName}، أنا مندوب التوصيل من متجر تيبس لمستحضرات التجميل. بخصوص طلبك رقم (${delivery.orderNumber})، أنا في طريقي للتوصيل إليك الآن.`
    );
    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${whatsappMessage}`;

    const hasPin = delivery.customerLat != null && delivery.customerLng != null;
    const fullAddress = [delivery.address, delivery.city, delivery.state].filter(Boolean).join('، ');
    const mapsUrl = hasPin
        ? `https://www.google.com/maps/dir/?api=1&destination=${delivery.customerLat},${delivery.customerLng}&travelmode=driving`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;

    const canPickUp = delivery.status === 'confirmed' || delivery.status === 'preparing';
    const onTheRoad = delivery.status === 'shipped';
    const closed = delivery.status === 'delivered' || delivery.status === 'delivery_failed';

    const checkedCount = Object.values(checkedItems).filter(Boolean).length;
    const allChecked = checkedCount === delivery.items.length && delivery.items.length > 0;

    const ITEMS_PREVIEW = 4;
    const visibleItems = showAllProducts ? delivery.items : delivery.items.slice(0, ITEMS_PREVIEW);
    const hasMore = delivery.items.length > ITEMS_PREVIEW;

    return (
        <div className="pb-36 space-y-4 text-gray-900">
            {/* Header Navigation */}
            <div className="flex items-center justify-between">
                <Link
                    to="/driver"
                    className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-gray-700 hover:text-black transition-colors bg-white px-3.5 py-2 rounded-lg border border-gray-200 shadow-xs"
                >
                    <ArrowRight className="w-4 h-4" /> توصيلاتي
                </Link>

                <div className="text-xs font-bold text-gray-600 bg-white px-3.5 py-2 rounded-lg border border-gray-200 shadow-xs">
                    <span>{delivery.warehouseName ?? 'مستودع تيبس'}</span>
                </div>
            </div>

            {/* Order Hero Status Card */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-xs p-4 sm:p-5 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold bg-black text-white px-2.5 py-1 rounded-md font-mono">
                                #{delivery.orderNumber}
                            </span>
                            <span className={cn(
                                'text-xs font-bold px-2.5 py-1 rounded-md border',
                                delivery.status === 'shipped' ? 'bg-sky-50 text-sky-900 border-sky-200' :
                                delivery.status === 'delivered' ? 'bg-emerald-50 text-emerald-900 border-emerald-200' :
                                delivery.status === 'delivery_failed' ? 'bg-rose-50 text-rose-900 border-rose-200' :
                                'bg-gray-50 text-gray-800 border-gray-200'
                            )}>
                                {delivery.status === 'shipped' ? 'في الطريق للتوصيل' :
                                 delivery.status === 'delivered' ? 'تم التسليم بنجاح ✓' :
                                 delivery.status === 'delivery_failed' ? 'تعذر التسليم' :
                                 'بانتظار الاستلام من المستودع'}
                            </span>
                        </div>
                        <h1 className="text-lg sm:text-xl font-bold mt-1.5 text-gray-900">{delivery.customerName}</h1>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        <span>تاريخ الطلب: {formatDateTime(delivery.createdAt)}</span>
                    </div>
                </div>

                {/* Progress Indicators */}
                <div className="grid grid-cols-3 gap-2 pt-0.5 text-center">
                    <div className={cn(
                        'py-2 px-2.5 rounded-lg text-xs font-bold border transition-colors',
                        canPickUp ? 'bg-black text-white border-black' : 'bg-gray-50 text-gray-500 border-gray-200'
                    )}>
                        1. الاستلام
                    </div>
                    <div className={cn(
                        'py-2 px-2.5 rounded-lg text-xs font-bold border transition-colors',
                        onTheRoad ? 'bg-black text-white border-black' : 'bg-gray-50 text-gray-500 border-gray-200'
                    )}>
                        2. في الطريق
                    </div>
                    <div className={cn(
                        'py-2 px-2.5 rounded-lg text-xs font-bold border transition-colors',
                        closed ? (delivery.status === 'delivered' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-rose-600 text-white border-rose-600') : 'bg-gray-50 text-gray-500 border-gray-200'
                    )}>
                        3. التسليم
                    </div>
                </div>
            </div>

            {/* Customer Information & Address Card (Matched with Supervisor layout) */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-xs p-4 sm:p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                    <div>
                        <h2 className="font-bold text-gray-900 text-xs sm:text-sm">بيانات العميل والتوصيل</h2>
                        <p className="text-xs text-gray-500 mt-0.5">{delivery.customerName} · <span dir="ltr" className="font-mono font-medium">{displayPhone}</span></p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <a
                            href={`tel:${delivery.phone}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs transition-colors"
                        >
                            <Phone className="w-3.5 h-3.5 text-gray-700" />
                            <span>اتصال</span>
                        </a>
                        <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 font-bold text-xs transition-colors"
                        >
                            <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                            <span>واتساب</span>
                        </a>
                        <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-50 text-violet-800 hover:bg-violet-100 border border-violet-200 font-bold text-xs transition-colors"
                        >
                            <Navigation className="w-3.5 h-3.5 text-violet-600" />
                            <span>الخريطة</span>
                        </a>
                    </div>
                </div>

                <div className="space-y-3 text-xs">
                    <div>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-400 font-bold block">العنوان:</span>
                            <button
                                type="button"
                                onClick={() => void copyToClipboard(fullAddress, 'address')}
                                className="px-2 py-0.5 rounded-md bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors text-gray-700 flex items-center gap-1 text-[11px] font-bold"
                            >
                                {copied === 'address' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                <span>{copied === 'address' ? 'تم النسخ' : 'نسخ العنوان'}</span>
                            </button>
                        </div>
                        <p className="text-gray-900 font-medium mt-1 leading-relaxed">
                            {fullAddress}
                        </p>
                    </div>

                    {delivery.notes && (
                        <div className="pt-2 border-t border-gray-100 flex items-start gap-2 bg-gray-50 p-2.5 rounded-md text-gray-800">
                            <StickyNote className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
                            <div>
                                <span className="font-bold block text-[11px] text-gray-700">ملاحظات العميل:</span>
                                <p className="text-xs text-gray-800 mt-0.5 font-normal">{delivery.notes}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Financials & COD Collection Card */}
            {delivery.codAmount != null && (
                <div className="bg-white rounded-lg border border-gray-200 shadow-xs p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-gray-100 text-gray-800 border border-gray-200 flex items-center justify-center shadow-2xs shrink-0">
                                <Banknote className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-gray-500">المبلغ المطلوب تحصيله نقداً (COD)</p>
                                <p className="text-xl sm:text-2xl font-black text-gray-900 font-mono tracking-tight" dir="ltr">
                                    {formatSDG(delivery.codAmount)}
                                </p>
                            </div>
                        </div>
                        {closed && delivery.status === 'delivered' && (
                            <span className="flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                                <ShieldCheck className="w-4 h-4" /> تم التحصيل
                            </span>
                        )}
                    </div>
                </div>
            )}

            {delivery.codAmount == null && delivery.paymentMethod !== 'COD' && (
                <div className="rounded-lg p-4 bg-emerald-50/60 border border-emerald-200">
                    <div className="flex items-center gap-3">
                        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div>
                            <p className="text-sm font-bold text-emerald-950">الطلب مدفوع مسبقاً (إلكتروني / بنكك)</p>
                            <p className="text-xs text-emerald-700 mt-0.5">لا يوجد تحصيل نقدي — سلّم المنتجات للعميل مباشرة</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Product Items Checklist Card */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-xs p-4 sm:p-5 space-y-3.5">
                <div className="flex items-center justify-between pb-2.5 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-gray-700" />
                        <h2 className="text-sm font-bold text-gray-900">
                            محتويات الشحنة ({delivery.itemCount} قطعة)
                        </h2>
                    </div>
                    {onTheRoad && (
                        <span className={cn(
                            'text-xs font-bold px-2.5 py-1 rounded-md border transition-all',
                            allChecked ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-gray-50 text-gray-700 border-gray-200'
                        )}>
                            {checkedCount} من {delivery.items.length} تم فحصها ✓
                        </span>
                    )}
                </div>

                <div className="divide-y divide-gray-100">
                    {visibleItems.map((item, index) => {
                        const img = getProductImageUrl(item, 200);
                        const isChecked = !!checkedItems[index];

                        return (
                            <div
                                key={index}
                                onClick={() => onTheRoad && toggleItemChecked(index)}
                                className={cn(
                                    'py-3 flex items-center gap-3 transition-colors px-1.5 rounded-lg',
                                    onTheRoad ? 'cursor-pointer hover:bg-gray-50' : '',
                                    isChecked && onTheRoad ? 'bg-emerald-50/40' : ''
                                )}
                            >
                                {onTheRoad && (
                                    <button
                                        type="button"
                                        aria-label="تحديد المنتج"
                                        className="shrink-0 text-gray-400 hover:text-emerald-600"
                                    >
                                        {isChecked ? (
                                            <CheckSquare className="w-5 h-5 text-emerald-600" />
                                        ) : (
                                            <Square className="w-5 h-5 text-gray-300" />
                                        )}
                                    </button>
                                )}

                                {/* Product Image */}
                                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-md bg-white border border-gray-200 shrink-0 overflow-hidden flex items-center justify-center p-1">
                                    {img ? (
                                        <img
                                            src={img}
                                            alt={item.name_ar}
                                            className="w-full h-full object-contain"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <Package className="w-6 h-6 text-gray-400" />
                                    )}
                                </div>

                                {/* Product Info */}
                                <div className="min-w-0 flex-1">
                                    <p className={cn(
                                        'text-sm font-bold text-gray-900 leading-snug',
                                        isChecked && onTheRoad ? 'line-through text-gray-400' : ''
                                    )}>
                                        {item.name_ar}
                                    </p>
                                    {item.variant_name && (
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            الدرجة / النوع: <span className="font-bold text-gray-800">{item.variant_name}</span>
                                        </p>
                                    )}
                                    <div className="flex items-center gap-2 mt-1.5">
                                        <span className="text-xs font-bold text-gray-800 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-md">
                                            الكمية: {item.quantity}
                                        </span>
                                        {item.lineTotal != null && (
                                            <span className="text-xs font-bold text-gray-600 font-mono" dir="ltr">
                                                {formatSDG(item.lineTotal)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {hasMore && (
                    <button
                        type="button"
                        onClick={() => setShowAllProducts(!showAllProducts)}
                        className="w-full py-2 text-xs font-bold text-gray-800 hover:bg-gray-100 transition-colors flex items-center justify-center gap-1 rounded-lg border border-gray-200"
                    >
                        {showAllProducts ? (
                            <><ChevronUp className="w-4 h-4" /> عرض أقل</>
                        ) : (
                            <><ChevronDown className="w-4 h-4" /> عرض باقي المنتجات ({delivery.items.length - ITEMS_PREVIEW})</>
                        )}
                    </button>
                )}
            </div>

            {error && <Notice kind="error">{error}</Notice>}

            {/* Failure Reason Form */}
            {failing && onTheRoad && (
                <div className="bg-rose-50/40 rounded-lg border border-rose-200 p-4 sm:p-5 space-y-3">
                    <h2 className="text-sm font-bold text-rose-950 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        سبب تعذر تسليم الشحنة
                    </h2>
                    <div className="grid gap-2">
                        {FAILURE_REASONS.map((r) => (
                            <label
                                key={r}
                                className={cn(
                                    'flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg border px-3 text-xs font-bold transition-all',
                                    reason === r
                                        ? 'border-rose-500 bg-white text-rose-800 shadow-xs'
                                        : 'border-rose-200 bg-white/70 text-gray-700 hover:bg-white'
                                )}
                            >
                                <input
                                    type="radio"
                                    name="reason"
                                    value={r}
                                    checked={reason === r}
                                    onChange={() => setReason(r)}
                                    className="accent-rose-600"
                                />
                                {r}
                            </label>
                        ))}
                    </div>
                    <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="ملاحظة إضافية للإدارة (اختياري)..."
                        className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 bg-white focus:border-black outline-hidden transition-all text-gray-900"
                        aria-label="ملاحظة إضافية"
                    />
                </div>
            )}

            {/* Fixed Bottom Actions Bar */}
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur-md p-3.5 pb-safe shadow-lg">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-2">
                    {canPickUp && (
                        <button
                            type="button"
                            onClick={() => void act('shipped')}
                            disabled={busy}
                            className="w-full py-3 px-4 bg-black hover:bg-gray-800 text-white font-bold text-sm sm:text-base rounded-lg flex items-center justify-center gap-2 shadow-xs transition-all active:scale-95"
                        >
                            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                            استلمت الشحنة من المستودع — بدء التوصيل
                        </button>
                    )}

                    {onTheRoad && !failing && (
                        <div className="grid grid-cols-2 gap-2.5">
                            <button
                                type="button"
                                onClick={() => {
                                    if (!barcodeVerified) {
                                        setBarcodeModalOpen(true);
                                    } else {
                                        void act('delivered');
                                    }
                                }}
                                disabled={busy}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 sm:py-3 px-3 rounded-lg flex items-center justify-center gap-1.5 shadow-xs transition-colors text-xs sm:text-sm active:scale-95"
                            >
                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
                                {barcodeVerified ? 'تأكيد التسليم' : 'مسح الباركود والتسليم'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setFailing(true)}
                                disabled={busy}
                                className="bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 font-bold py-2.5 sm:py-3 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-xs sm:text-sm active:scale-95"
                            >
                                <AlertTriangle className="w-4 h-4" /> تعذر التسليم
                            </button>
                        </div>
                    )}

                    {onTheRoad && failing && (
                        <div className="grid grid-cols-2 gap-2.5">
                            <button
                                type="button"
                                onClick={() => void act('delivery_failed')}
                                disabled={busy}
                                className="bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 sm:py-3 px-3 rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5 text-xs sm:text-sm"
                            >
                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                                تأكيد تعذر التسليم
                            </button>
                            <button
                                type="button"
                                onClick={() => setFailing(false)}
                                disabled={busy}
                                className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 font-bold py-2.5 sm:py-3 px-3 rounded-lg transition-colors text-xs sm:text-sm"
                            >
                                رجوع
                            </button>
                        </div>
                    )}

                    {closed && (
                        <div className="p-3 text-center rounded-lg bg-gray-50 border border-gray-200 text-xs font-bold text-gray-700">
                            {delivery.status === 'delivered'
                                ? '✓ تم تسليم هذا الطلب للعميل بنجاح'
                                : 'سُجّل تعذر التسليم — تمت إعادة توجيه الطلب لإدارة المستودع'}
                        </div>
                    )}
                </div>
            </div>

            {/* Barcode / QR Scanner Verification Modal */}
            <BarcodeScannerModal
                isOpen={barcodeModalOpen}
                orderNumber={delivery.orderNumber}
                orderId={delivery.id}
                onClose={() => setBarcodeModalOpen(false)}
                onVerified={() => {
                    setBarcodeVerified(true);
                    setBarcodeModalOpen(false);
                    void act('delivered');
                }}
            />
        </div>
    );
};

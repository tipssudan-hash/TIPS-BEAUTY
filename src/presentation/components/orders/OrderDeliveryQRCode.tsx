import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, ShieldCheck, Copy, Check, Info, PackageCheck, ReceiptText } from 'lucide-react';
import { Card } from '../ui';
import { formatSDG, formatDateTime } from '@application/services/format';
import type { Order } from '@domain/entities';

interface Props {
    order: Order;
    customerName?: string;
}

/**
 * Generates a deterministic 12-character alphanumeric code (XXXX-XXXX-XXXX)
 * using an unambiguous Base32 alphabet (no 0/O or 1/I).
 */
export function generate12DigitDeliveryCode(orderId: string, orderNumber: string): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const seedString = `${orderId}:${orderNumber}:tips-beauty`;
    let hash1 = 5381;
    let hash2 = 52711;

    for (let i = 0; i < seedString.length; i++) {
        const char = seedString.charCodeAt(i);
        hash1 = ((hash1 << 5) + hash1) ^ char;
        hash2 = ((hash2 << 5) + hash2) ^ (char * 31);
    }

    let rawCode = '';
    for (let i = 0; i < 12; i++) {
        const seedVal = Math.abs(hash1 * (i + 1) + hash2 * (12 - i) + (orderId.charCodeAt(i % orderId.length) || 0) * 19);
        rawCode += chars[seedVal % chars.length];
    }

    return `${rawCode.slice(0, 4)}-${rawCode.slice(4, 8)}-${rawCode.slice(8, 12)}`;
}

export const OrderDeliveryQRCode: React.FC<Props> = ({ order, customerName }) => {
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // 12-character alphanumeric verification code
    const verificationCode = useMemo(
        () => generate12DigitDeliveryCode(order.id, order.orderNumber),
        [order.id, order.orderNumber]
    );

    // Build rich, real order information payload for the QR Code
    const qrPayload = useMemo(() => {
        const address = [order.shippingAddress, order.city, order.state].filter(Boolean).join('، ');

        return JSON.stringify({
            app: 'TIPS-BEAUTY',
            type: 'DELIVERY_VERIFICATION',
            verification_code: verificationCode,
            order_number: order.orderNumber,
            order_id: order.id,
            created_at: order.createdAt,
            customer: {
                name: customerName || 'عميل TIPS BEAUTY',
                address: address || 'الخرطوم',
            },
            financials: {
                payment_method: order.paymentMethod,
                payment_status: order.paymentStatus,
                total_sdg: order.total,
                shipping_fee_sdg: order.shippingFee,
                discount_sdg: order.discountAmount || 0,
            },
            items: (order.items || []).map((item) => ({
                id: item.id,
                name: item.name_ar || 'منتج تجميل',
                variant: item.variant_name || null,
                quantity: item.quantity,
                unit_price: item.unit_price ?? item.effective_unit_price ?? null,
                line_total: item.line_total ?? null,
            })),
        });
    }, [order, customerName, verificationCode]);

    useEffect(() => {
        QRCode.toDataURL(qrPayload, {
            width: 320,
            margin: 2,
            color: {
                dark: '#0f172a',
                light: '#ffffff',
            },
            errorCorrectionLevel: 'M',
        })
            .then(setQrDataUrl)
            .catch((err) => console.error('Failed to generate delivery QR:', err));
    }, [qrPayload]);

    const handleCopyCode = () => {
        navigator.clipboard.writeText(verificationCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const isDelivered = order.status === 'delivered';

    return (
        <Card className="overflow-hidden border border-brand-blue-soft/60 shadow-md bg-white">
            {/* Header */}
            <div className="bg-linear-to-r from-brand-blue to-sky-900 p-4 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-xs shadow-inner">
                        <QrCode className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h2 className="font-bold text-sm">رمز تأكيد استلام الشحنة (QR Code)</h2>
                        <p className="text-2xs text-sky-100">يحتوي على بيانات الطلب الرسمية ورمز التحقق الأمني</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-2xs font-bold backdrop-blur-xs">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                    <span>حماية التسليم</span>
                </div>
            </div>

            {/* Body */}
            <div className="p-5 flex flex-col md:flex-row items-center gap-6">
                {/* QR Code Graphic Box */}
                <div className="relative flex flex-col items-center justify-center p-3 bg-gray-50 rounded-2xl border border-gray-200 shadow-inner shrink-0">
                    {qrDataUrl ? (
                        <img
                            src={qrDataUrl}
                            alt={`QR Code for Order ${order.orderNumber}`}
                            className="w-48 h-48 rounded-xl mix-blend-multiply"
                        />
                    ) : (
                        <div className="w-48 h-48 flex items-center justify-center text-gray-400 text-xs animate-pulse">
                            جاري إنشاء الباركود...
                        </div>
                    )}
                    <span className="text-2xs font-mono text-gray-600 font-black mt-2 tracking-wider">
                        {order.orderNumber}
                    </span>
                </div>

                {/* Details & 12-digit Code Section */}
                <div className="space-y-4 flex-1 w-full text-right">
                    <div className="space-y-1">
                        <p className="text-xs text-gray-500 font-bold">تعليمات الاستلام:</p>
                        <p className="text-xs text-gray-800 font-medium leading-relaxed">
                            {isDelivered
                                ? '✅ تم تأكيد استلام هذا الطلب ومطابقة الرمز بنجاح.'
                                : 'اعرض هذا الباركود لمندوب التوصيل عند استلام الطلب والدفع، ليقوم بمسحه وتأكيد التسليم.'}
                        </p>
                    </div>

                    {/* 12-Character Alphanumeric Code */}
                    <div className="p-3.5 bg-sky-50/90 rounded-2xl border border-sky-200 flex items-center justify-between gap-3 shadow-2xs">
                        <div>
                            <p className="text-2xs text-sky-800 font-bold flex items-center gap-1">
                                <PackageCheck className="w-3.5 h-3.5 text-brand-blue" />
                                <span>رمز التحقق اليدوي (12 خانة):</span>
                            </p>
                            <p className="text-base sm:text-lg font-black font-mono text-brand-blue tracking-widest mt-0.5" dir="ltr">
                                {verificationCode}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleCopyCode}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-sky-300 text-sky-900 hover:bg-sky-100 text-xs font-bold transition-all shadow-xs active:scale-95 shrink-0"
                        >
                            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-brand-blue" />}
                            <span>{copied ? 'تم النسخ' : 'نسخ الرمز'}</span>
                        </button>
                    </div>

                    {/* Order Financial & Items Summary Badge */}
                    <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 p-3 rounded-xl border border-gray-200">
                        <div className="flex items-center gap-1.5 text-gray-700">
                            <ReceiptText className="w-3.5 h-3.5 text-gray-500" />
                            <span>المبلغ المستحق:</span>
                            <strong className="text-gray-900 font-black">{formatSDG(order.total)}</strong>
                        </div>
                        <div className="text-left text-gray-600">
                            <span>المنتجات: </span>
                            <strong className="text-gray-800">{order.items?.length || 0} صنف</strong>
                        </div>
                        <div className="text-gray-600">
                            <span>الدفع: </span>
                            <strong className="text-brand-blue">{order.paymentMethod === 'COD' ? 'نقداً عند الاستلام' : order.paymentMethod}</strong>
                        </div>
                        <div className="text-left text-3xs text-gray-500">
                            {formatDateTime(order.createdAt)}
                        </div>
                    </div>

                    {/* Anti-fraud hint */}
                    <div className="flex items-center gap-1.5 text-3xs text-amber-800 bg-amber-50 px-3 py-2 rounded-xl border border-amber-200">
                        <Info className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                        <span>يرجى عدم السماح بمسح الرمز إلا بعد استلام كافة المنتجات والتأكد من سلامتها.</span>
                    </div>
                </div>
            </div>
        </Card>
    );
};

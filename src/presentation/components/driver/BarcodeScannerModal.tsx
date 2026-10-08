import React, { useState } from 'react';
import { X, QrCode, CheckCircle2, AlertCircle, ScanLine } from 'lucide-react';
import { inputClass } from '../ui';
import { generate12DigitDeliveryCode } from '../orders/OrderDeliveryQRCode';

interface Props {
    isOpen: boolean;
    orderNumber: string;
    orderId?: string;
    onClose: () => void;
    onVerified: () => void;
}

export const BarcodeScannerModal: React.FC<Props> = ({
    isOpen,
    orderNumber,
    orderId,
    onClose,
    onVerified,
}) => {
    const [scannedCode, setScannedCode] = useState('');
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const expected12Code = generate12DigitDeliveryCode(orderId || orderNumber, orderNumber);
    const expectedClean12 = expected12Code.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const expectedPin = (orderNumber.replace(/[^0-9]/g, '').slice(-4) || '8842').padStart(4, '0');

    const handleConfirm = (e: React.FormEvent) => {
        e.preventDefault();
        const raw = scannedCode.trim();
        const cleanScanned = raw.toLowerCase();
        const cleanAlphaNumeric = raw.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const cleanExpected = orderNumber.trim().toLowerCase();

        let matched = false;

        // 1. Match with 12-character verification code (with or without dashes)
        if (cleanAlphaNumeric === expectedClean12 || cleanScanned === expected12Code.toLowerCase()) {
            matched = true;
        }

        // 2. Match with order number or substring
        if (!matched && (cleanScanned === cleanExpected || cleanExpected.includes(cleanScanned) || cleanScanned.includes(cleanExpected))) {
            matched = true;
        }

        // 3. Match with 4-digit PIN
        if (!matched && cleanScanned === expectedPin.toLowerCase()) {
            matched = true;
        }

        // 4. Match from scanned QR JSON payload
        if (!matched && (raw.startsWith('{') && raw.endsWith('}'))) {
            try {
                const parsed = JSON.parse(raw);
                const parsed12 = (parsed.verification_code || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                if (
                    parsed12 === expectedClean12 ||
                    parsed.order_number?.toLowerCase() === cleanExpected ||
                    parsed.orderNumber?.toLowerCase() === cleanExpected ||
                    parsed.order_id?.toLowerCase() === (orderId || '').toLowerCase() ||
                    parsed.orderId?.toLowerCase() === (orderId || '').toLowerCase() ||
                    parsed.pin === expectedPin
                ) {
                    matched = true;
                }
            } catch {
                // Not JSON
            }
        }

        if (matched) {
            setError(null);
            onVerified();
        } else {
            setError('الرمز أو الباركود المدخل لا يطابق هذا الطلب. تأكد من مسح QR العميل أو إدخال رمز التحقق المكون من 12 خانة.');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn" dir="rtl">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
                <div className="p-5 bg-linear-to-r from-sky-900 to-brand-blue text-white flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                            <ScanLine className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="font-bold text-lg">تأكيد استلام الشحنة</h2>
                            <p className="text-xs text-sky-100">مسح باركود العميل (QR) أو إدخال رمز التحقق</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 text-sky-200 hover:text-white rounded-xl hover:bg-white/10">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleConfirm} className="p-6 space-y-4">
                    <div className="text-center py-4 bg-gray-50 rounded-2xl border border-gray-200">
                        <QrCode className="w-12 h-12 text-brand-blue mx-auto mb-2 animate-pulse" />
                        <p className="text-xs text-gray-500">رقم الطلب المطلوب التحقق منه:</p>
                        <p className="text-lg font-black font-mono text-brand-blue mt-0.5 tracking-wider">{orderNumber}</p>
                        <p className="text-2xs text-gray-400 font-mono mt-1">رمز التحقق المتوقع: {expected12Code}</p>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5">امسح الباركود أو أدخل رمز التحقق</label>
                        <input
                            type="text"
                            required
                            autoFocus
                            value={scannedCode}
                            onChange={(e) => setScannedCode(e.target.value)}
                            placeholder={`أدخل رمز التحقق (12 خانة) أو ${orderNumber}`}
                            className={inputClass}
                            dir="ltr"
                        />
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => {
                                setScannedCode(expected12Code);
                            }}
                            className="py-3 px-4 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 font-bold text-xs"
                        >
                            مطابقة بالرمز
                        </button>
                        <button
                            type="submit"
                            disabled={!scannedCode.trim()}
                            className="flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl bg-brand-blue hover:bg-brand-blue/90 text-white font-bold text-xs shadow-xs transition-colors disabled:opacity-50"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                            تأكيد المطابقة
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

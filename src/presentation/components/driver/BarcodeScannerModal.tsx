import React, { useState, useEffect, useRef } from 'react';
import { X, QrCode, CheckCircle2, AlertCircle, ScanLine, Camera, Keyboard } from 'lucide-react';
import jsQR from 'jsqr';
import { inputClass } from '../ui';
import { generate12DigitDeliveryCode } from '../orders/OrderDeliveryQRCode';

interface Props {
    isOpen: boolean;
    orderNumber: string;
    orderId?: string;
    onClose: () => void;
    onVerified: () => void;
}

/**
 * Validates whether the scanned or entered code strictly matches the
 * customer's secret delivery verification code.
 * Rejects orderNumber, PIN, or any public data to prevent unauthorized delivery confirmation.
 */
export function validateDeliveryCode(input: string, orderId: string, orderNumber: string): boolean {
    const raw = input.trim();
    if (!raw) return false;

    const expected12Code = generate12DigitDeliveryCode(orderId || orderNumber, orderNumber);
    const expectedClean12 = expected12Code.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    // 1. Direct match with 12-character verification code (case-insensitive, ignores hyphens/spaces)
    const cleanAlphaNumeric = raw.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (cleanAlphaNumeric === expectedClean12) {
        return true;
    }

    // 2. Scanned QR JSON payload from customer's screen
    if (raw.startsWith('{') && raw.endsWith('}')) {
        try {
            const parsed = JSON.parse(raw);
            const parsedCode = (parsed.verification_code || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            if (parsedCode === expectedClean12) {
                return true;
            }
        } catch {
            return false;
        }
    }

    return false;
}

export const BarcodeScannerModal: React.FC<Props> = ({
    isOpen,
    orderNumber,
    orderId,
    onClose,
    onVerified,
}) => {
    const [mode, setMode] = useState<'camera' | 'manual'>('camera');
    const [scannedCode, setScannedCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [cameraAvailable, setCameraAvailable] = useState<boolean | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
    };

    useEffect(() => {
        if (!isOpen) {
            stopCamera();
            setScannedCode('');
            setError(null);
            setMode('camera');
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || mode !== 'camera') {
            stopCamera();
            return;
        }

        let isCancelled = false;

        const startCamera = async () => {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                setCameraAvailable(false);
                setMode('manual');
                return;
            }

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' } },
                });
                if (isCancelled) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }
                setCameraAvailable(true);
            } catch (err) {
                console.warn('Camera access unavailable:', err);
                if (!isCancelled) {
                    setCameraAvailable(false);
                    setMode('manual');
                }
            }
        };

        void startCamera();

        return () => {
            isCancelled = true;
            stopCamera();
        };
    }, [isOpen, mode]);

    useEffect(() => {
        if (!isOpen || mode !== 'camera' || !cameraAvailable) return;

        let active = true;
        let rafId: number | null = null;

        if (!canvasRef.current) {
            canvasRef.current = document.createElement('canvas');
        }
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const scanFrame = () => {
            if (!active || !videoRef.current || !ctx) return;
            const video = videoRef.current;
            if (video.readyState < 2) {
                rafId = requestAnimationFrame(scanFrame);
                return;
            }

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const result = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert',
            });

            if (result && result.data) {
                if (validateDeliveryCode(result.data, orderId || orderNumber, orderNumber)) {
                    active = false;
                    stopCamera();
                    onVerified();
                    return;
                }
            }

            rafId = requestAnimationFrame(scanFrame);
        };

        rafId = requestAnimationFrame(scanFrame);

        return () => {
            active = false;
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, [isOpen, mode, cameraAvailable, orderId, orderNumber, onVerified]);

    if (!isOpen) return null;

    const handleConfirm = (e: React.FormEvent) => {
        e.preventDefault();
        const valid = validateDeliveryCode(scannedCode, orderId || orderNumber, orderNumber);
        if (valid) {
            setError(null);
            stopCamera();
            onVerified();
        } else {
            setError('رمز التحقق غير صحيح. تأكد من مسح باركود العميل أو كتابة رمز التحقق المكون من 12 خانة الموجود في هاتف العميل فقط.');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn" dir="rtl">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-5 bg-gradient-to-r from-sky-900 to-brand-blue text-white flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                            <ScanLine className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="font-bold text-lg">تأكيد استلام العميل</h2>
                            <p className="text-xs text-sky-100">طلب رقم: {orderNumber}</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 text-sky-200 hover:text-white rounded-xl hover:bg-white/10">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Mode Selector Tabs */}
                <div className="flex border-b border-gray-100 bg-gray-50/80 p-1.5 gap-1.5 text-xs font-bold">
                    <button
                        type="button"
                        onClick={() => setMode('camera')}
                        className={`flex-1 py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                            mode === 'camera'
                                ? 'bg-white text-brand-blue shadow-xs'
                                : 'text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        <Camera className="w-4 h-4" />
                        مسح بالكاميرا (QR)
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('manual')}
                        className={`flex-1 py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                            mode === 'manual'
                                ? 'bg-white text-brand-blue shadow-xs'
                                : 'text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        <Keyboard className="w-4 h-4" />
                        إدخال الرمز يدوياً
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {mode === 'camera' && (
                        <div className="space-y-3">
                            <div className="relative aspect-square w-full bg-black rounded-2xl overflow-hidden flex items-center justify-center shadow-inner">
                                <video
                                    ref={videoRef}
                                    playsInline
                                    muted
                                    className="w-full h-full object-cover"
                                />
                                {/* Viewfinder overlay */}
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="w-52 h-52 border-2 border-emerald-400/80 rounded-2xl relative">
                                        <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                                        <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                                        <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                                        <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
                                        <div className="w-full h-0.5 bg-emerald-400/80 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse mt-24" />
                                    </div>
                                </div>
                            </div>
                            <p className="text-xs text-center text-gray-500 font-medium">
                                وجه الكاميرا نحو باركود (QR) الظاهر في هاتف العميل
                            </p>
                        </div>
                    )}

                    {mode === 'manual' && (
                        <form onSubmit={handleConfirm} className="space-y-4">
                            <div className="p-4 bg-sky-50/80 rounded-2xl border border-sky-100 flex items-start gap-3">
                                <QrCode className="w-5 h-5 text-brand-blue shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs font-bold text-sky-950">أين يجد العميل الرمز؟</p>
                                    <p className="text-xs text-sky-800 mt-0.5 leading-relaxed">
                                        اطلب من العميل فتح تفاصيل طلبه في التطبيق وقراءة <strong>رمز التحقق اليدوي المكون من 12 خانة</strong>.
                                    </p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                                    رمز التحقق من العميل (12 خانة)
                                </label>
                                <input
                                    type="text"
                                    required
                                    autoFocus
                                    value={scannedCode}
                                    onChange={(e) => {
                                        setScannedCode(e.target.value.toUpperCase());
                                        if (error) setError(null);
                                    }}
                                    placeholder="XXXX-XXXX-XXXX"
                                    className={`${inputClass} tracking-widest text-center font-mono text-base font-black uppercase`}
                                    dir="ltr"
                                    maxLength={16}
                                />
                            </div>

                            {error && (
                                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={!scannedCode.trim()}
                                className="w-full flex items-center justify-center gap-1.5 py-3.5 px-4 rounded-xl bg-brand-blue hover:bg-sky-800 text-white font-bold text-sm shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-98"
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                تأكيد التحقق والتسليم
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

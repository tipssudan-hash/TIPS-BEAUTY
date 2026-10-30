import React, { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';

// Delivery proof photo from the device camera. A plain file input with capture is used on every
// platform, so no native camera plugin is needed; the photo is kept as a Blob until the status is sent.
const MAX_BYTES = 5 * 1024 * 1024;

interface Props {
    photo: Blob | null;
    onChange: (photo: Blob | null) => void;
    disabled?: boolean;
}

export const ProofPhotoInput: React.FC<Props> = ({ photo, onChange, disabled = false }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!photo) {
            setPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(photo);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [photo]);

    const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] ?? null;
        event.target.value = '';
        setError(null);
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setError('يرجى التقاط صورة لإثبات التسليم.');
            return;
        }
        if (file.size > MAX_BYTES) {
            setError('حجم الصورة يجب ألا يتجاوز 5 ميجابايت، أعيدي التقاطها.');
            return;
        }
        onChange(file);
    };

    return (
        <div className="space-y-2">
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                aria-label="صورة إثبات التسليم"
                onChange={handleFile}
                disabled={disabled}
            />

            {previewUrl ? (
                <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-2.5">
                    <img src={previewUrl} alt="معاينة صورة الإثبات" className="h-16 w-16 rounded-md border border-gray-200 object-cover" />
                    <p className="flex-1 text-xs font-bold text-gray-800">تم التقاط صورة الإثبات</p>
                    <button
                        type="button"
                        onClick={() => onChange(null)}
                        disabled={disabled}
                        className="flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                    >
                        <X className="h-3.5 w-3.5" /> إزالة
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={disabled}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white py-3 text-xs font-bold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                    <Camera className="h-4 w-4" /> التقاط صورة الإثبات
                </button>
            )}

            {error && <p role="alert" className="text-xs font-bold text-rose-700">{error}</p>}
        </div>
    );
};

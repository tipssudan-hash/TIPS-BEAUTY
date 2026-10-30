import React from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { primaryButtonClass, secondaryButtonClass } from './index';

// Shared confirmation for actions that cannot be taken back. Mounted only while it is asked; `onCancel`
// must be a stable callback, since the focus trap re-arms whenever it changes.
export interface ConfirmDialogProps {
    title: string;
    body?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: 'default' | 'danger';
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    title,
    body,
    confirmLabel = 'تأكيد',
    cancelLabel = 'رجوع',
    tone = 'default',
    busy = false,
    onConfirm,
    onCancel,
}) => {
    const titleId = React.useId();
    const bodyId = React.useId();
    const containerRef = useFocusTrap<HTMLDivElement>(true, onCancel);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" dir="rtl">
            <div
                ref={containerRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={body ? bodyId : undefined}
                className="w-full max-w-sm space-y-4 rounded-card bg-white p-5 shadow-card"
            >
                <h2 id={titleId} className="text-base font-bold text-gray-900">{title}</h2>
                {body && <p id={bodyId} className="text-sm leading-relaxed text-gray-600">{body}</p>}
                <div className="grid grid-cols-2 gap-2.5">
                    <button type="button" onClick={onCancel} disabled={busy} className={secondaryButtonClass}>
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={busy}
                        className={tone === 'danger' ? 'flex items-center justify-center rounded-control bg-red-600 px-4 py-3 font-bold text-white transition-all hover:bg-red-700 disabled:opacity-50' : primaryButtonClass}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

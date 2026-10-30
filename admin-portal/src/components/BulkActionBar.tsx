import React from 'react';
import { X } from 'lucide-react';
import { smallButtonClass } from './ui';

export const BulkActionBar: React.FC<{ count: number; onClear: () => void; children: React.ReactNode; busy?: boolean }> = ({ count, onClear, children, busy }) => {
    if (count === 0) return null;
    return (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg" role="region" aria-label="إجراءات جماعية">
            <span className="text-sm font-black text-slate-800">محدد: {count}</span>
            <div className="flex flex-wrap items-center gap-2 disabled:opacity-60" aria-busy={busy}>{children}</div>
            <button type="button" onClick={onClear} className={`${smallButtonClass} mr-auto flex items-center gap-1 bg-slate-100 text-slate-600`}>
                <X size={14} /> إلغاء التحديد
            </button>
        </div>
    );
};

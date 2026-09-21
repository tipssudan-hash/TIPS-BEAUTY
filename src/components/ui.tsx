import React from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '../lib/cn';

// Storefront primitives — mirrors admin-portal/src/components/ui.tsx in shape (same names, same
// job) but themed per DESIGN.md's "Clear Sky Counter" identity (Cairo weights, 16px card radius,
// sky-blue tinted glow) rather than the Admin Portal's "Confident Dark Console" identity.
// Checked for export-surface parity by scripts/check-primitives-parity.mjs.

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div className={cn('bg-white rounded-card border border-gray-100 shadow-card', className)}>{children}</div>
);

export const Notice: React.FC<{ kind: 'error' | 'success'; children: React.ReactNode }> = ({ kind, children }) => (
    <div role={kind === 'error' ? 'alert' : 'status'} className={cn('p-4 rounded-control flex items-center gap-2 text-sm font-bold border', kind === 'error' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-green-50 text-green-700 border-green-100')}>
        {kind === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
        <span>{children}</span>
    </div>
);

export const Spinner: React.FC<{ label?: string }> = ({ label = 'جاري التحميل...' }) => (
    <div className="min-h-[40vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-brand-blue" />
        <p className="text-gray-400 font-bold text-sm">{label}</p>
    </div>
);

const NATIVE_CONTROL_TAGS = ['input', 'select', 'textarea'];

export const Field: React.FC<{ label: string; required?: boolean; hint?: string; children: React.ReactNode; className?: string }> = ({ label, required, hint, children, className = '' }) => {
    const id = React.useId();
    const labelId = `${id}-label`;
    const isSingleControl = React.isValidElement(children) && typeof children.type === 'string' && NATIVE_CONTROL_TAGS.includes(children.type);
    const control = isSingleControl ? (children as React.ReactElement<{ id?: string }>) : null;
    const controlId = control?.props.id ?? id;
    const labelClasses = 'text-sm font-bold text-gray-700 flex items-center gap-1';
    const labelContent = <>{label}{required && <span className="text-brand-blue">*</span>}</>;

    return (
        <div className={cn('space-y-1', className)} {...(!isSingleControl && { role: 'group', 'aria-labelledby': labelId })}>
            {isSingleControl
                ? <label htmlFor={controlId} className={labelClasses}>{labelContent}</label>
                : <span id={labelId} className={labelClasses}>{labelContent}</span>}
            {control ? React.cloneElement(control, { id: controlId }) : children}
            {hint && <p className="text-xs text-gray-400">{hint}</p>}
        </div>
    );
};

export const inputClass = 'w-full bg-gray-50 border border-gray-200 rounded-control p-3 outline-none focus:ring-2 focus:ring-brand-blue text-gray-800 transition-all placeholder:text-gray-300 disabled:opacity-60';
export const primaryButtonClass = 'bg-brand-blue hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold px-6 py-3.5 rounded-control flex items-center justify-center gap-2 transition-all shadow-card-glow active:scale-95';
export const secondaryButtonClass = 'bg-white border border-gray-200 text-gray-600 px-5 py-3 rounded-control font-bold hover:bg-gray-50 transition-all disabled:opacity-50';
export const smallButtonClass = 'px-3 py-2.5 rounded-control text-xs font-bold transition-all disabled:opacity-50';

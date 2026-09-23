import React from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '../lib/cn';

// Storefront primitives — mirrors admin-portal/src/components/ui.tsx in shape (same names, same
// job) but themed per DESIGN.md's "Clear Sky Counter" identity (Cairo weights, 16px card radius,
// sky-blue tinted glow) rather than the Admin Portal's "Confident Dark Console" identity.
// Checked for export-surface parity by scripts/check-primitives-parity.mjs.

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div className={cn('bg-white rounded-card border border-brand-blue-soft shadow-card', className)}>{children}</div>
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

// --- States -------------------------------------------------------------------------------------
// Every page shows one of four states with the same furniture: loading (Skeleton/Spinner), empty
// (EmptyState with one action), error (Notice + retry), or content. PageState picks for you.

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div aria-hidden="true" className={cn('animate-pulse rounded-control bg-gray-100', className)} />
);

export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode }> = ({ icon, title, body, action }) => (
    <div className="bg-white rounded-card border border-gray-100 p-10 text-center">
        {icon && <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-blue-soft text-brand-blue">{icon}</div>}
        <h2 className="text-lg font-bold text-gray-800">{title}</h2>
        {body && <p className="mt-1 text-sm text-gray-500">{body}</p>}
        {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
);

export const PageState: React.FC<{ loading?: boolean; error?: string | null; onRetry?: () => void; empty?: boolean; emptyState?: React.ReactNode; children: React.ReactNode }> = ({ loading, error, onRetry, empty, emptyState, children }) => {
    if (loading) return <Spinner />;
    if (error) {
        return (
            <div className="space-y-3">
                <Notice kind="error">{error}</Notice>
                {onRetry && <button type="button" onClick={onRetry} className={secondaryButtonClass}>إعادة المحاولة</button>}
            </div>
        );
    }
    if (empty && emptyState) return <>{emptyState}</>;
    return <>{children}</>;
};

// --- Status ---------------------------------------------------------------------------------------
// One pill for every "state" the customer reads (order, payment, delivery); colour = role, from the
// shared status tokens, never chosen per screen.

export type StatusTone = 'success' | 'attention' | 'danger' | 'info' | 'neutral';

const STATUS_TONE_CLASS: Record<StatusTone, string> = {
    success: 'bg-status-success-ground text-status-success-ink',
    attention: 'bg-status-attention-ground text-status-attention-ink',
    danger: 'bg-status-danger-ground text-status-danger-ink',
    info: 'bg-status-info-ground text-status-info-ink',
    neutral: 'bg-status-neutral-ground text-status-neutral-ink',
};

export const StatusPill: React.FC<{ tone: StatusTone; children: React.ReactNode; className?: string }> = ({ tone, children, className = '' }) => (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold', STATUS_TONE_CLASS[tone], className)}>{children}</span>
);

import React from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '../lib/cn';

export const PageHeader: React.FC<{ title: string; subtitle?: string; icon?: React.ReactNode; actions?: React.ReactNode }> = ({ title, subtitle, icon, actions }) => (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">{icon}{title}</h1>
            {subtitle && <p className="text-slate-500 font-medium mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
);

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div className={`bg-white rounded-3xl border border-slate-100 shadow-sm ${className}`}>{children}</div>
);

export const Notice: React.FC<{ kind: 'error' | 'success'; children: React.ReactNode }> = ({ kind, children }) => (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`p-4 rounded-2xl flex items-center gap-2 text-sm font-bold border ${kind === 'error' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
        {kind === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
        <span>{children}</span>
    </div>
);

export const Spinner: React.FC<{ label?: string }> = ({ label = 'جاري التحميل...' }) => (
    <div className="min-h-[40vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-brand-blue" />
        <p className="text-slate-400 font-bold text-sm">{label}</p>
    </div>
);

const NATIVE_CONTROL_TAGS = ['input', 'select', 'textarea'];

export const Field: React.FC<{ label: string; required?: boolean; hint?: string; children: React.ReactNode; className?: string }> = ({ label, required, hint, children, className = '' }) => {
    const id = React.useId();
    const labelId = `${id}-label`;
    const isSingleControl = React.isValidElement(children) && typeof children.type === 'string' && NATIVE_CONTROL_TAGS.includes(children.type);
    const control = isSingleControl ? (children as React.ReactElement<{ id?: string }>) : null;
    const controlId = control?.props.id ?? id;
    const labelClasses = 'text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-1';
    const labelContent = <>{label}{required && <span className="text-brand-blue">*</span>}</>;

    return (
        <div className={`space-y-2 ${className}`} {...(!isSingleControl && { role: 'group', 'aria-labelledby': labelId })}>
            {isSingleControl
                ? <label htmlFor={controlId} className={labelClasses}>{labelContent}</label>
                : <span id={labelId} className={labelClasses}>{labelContent}</span>}
            {control ? React.cloneElement(control, { id: controlId }) : children}
            {hint && <p className="text-[10px] text-slate-400 font-medium">{hint}</p>}
        </div>
    );
};

export const inputClass = 'w-full p-3.5 bg-slate-50 rounded-2xl border border-slate-100 focus:ring-2 focus:ring-brand-blue outline-none font-bold text-slate-800 transition-all placeholder:text-slate-300 disabled:opacity-60';
export const primaryButtonClass = 'bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-2xl font-black flex items-center justify-center gap-2 transition-all shadow-lg shadow-slate-900/10 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';
export const secondaryButtonClass = 'bg-white border border-slate-200 text-slate-600 px-5 py-3 rounded-2xl font-bold hover:bg-slate-50 transition-all disabled:opacity-50';
export const smallButtonClass = 'px-3 py-2.5 rounded-xl text-xs font-black transition-all disabled:opacity-50';

export const Table: React.FC<{ headers: string[]; children: React.ReactNode; empty?: boolean; emptyText?: string }> = ({ headers, children, empty, emptyText = 'لا توجد بيانات بعد' }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-right border-collapse">
            <thead>
                <tr className="bg-slate-50/50">
                    {headers.map((h) => <th key={h} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>)}
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">{children}</tbody>
        </table>
        {empty && <div className="p-12 text-center text-slate-400 font-bold text-sm">{emptyText}</div>}
    </div>
);

// --- States -------------------------------------------------------------------------------------
// Every page shows one of four states with the same furniture: loading (Skeleton/Spinner), empty
// (EmptyState with one action), error (Notice + retry), or content. PageState picks for you.
// Mirrors src/components/ui.tsx (storefront) — see launch step 3's commit message.

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div aria-hidden="true" className={cn('animate-pulse rounded-control bg-slate-100', className)} />
);

export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode }> = ({ icon, title, body, action }) => (
    <div className="bg-white rounded-card border border-slate-100 p-10 text-center">
        {icon && <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-brand-blue">{icon}</div>}
        <h2 className="text-lg font-black text-slate-900">{title}</h2>
        {body && <p className="mt-1 text-sm text-slate-500 font-medium">{body}</p>}
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
// One pill for every "state" staff read (product, driver, banner, coupon...); colour = role, from
// the shared status tokens, never chosen per screen. Same tone vocabulary as the storefront's
// StatusPill — kept identical on purpose so "success/attention/danger/info/neutral" means the same
// thing everywhere, not just within one portal.

export type StatusTone = 'success' | 'attention' | 'danger' | 'info' | 'neutral';

const STATUS_TONE_CLASS: Record<StatusTone, string> = {
    success: 'bg-status-success-ground text-status-success-ink',
    attention: 'bg-status-attention-ground text-status-attention-ink',
    danger: 'bg-status-danger-ground text-status-danger-ink',
    info: 'bg-status-info-ground text-status-info-ink',
    neutral: 'bg-status-neutral-ground text-status-neutral-ink',
};

export const StatusPill: React.FC<{ tone: StatusTone; children: React.ReactNode; className?: string }> = ({ tone, children, className = '' }) => (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black', STATUS_TONE_CLASS[tone], className)}>{children}</span>
);

import React from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

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

export const Field: React.FC<{ label: string; required?: boolean; hint?: string; children: React.ReactNode; className?: string }> = ({ label, required, hint, children, className = '' }) => (
    <div className={`space-y-2 ${className}`}>
        <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
            {label}{required && <span className="text-brand-blue">*</span>}
        </label>
        {children}
        {hint && <p className="text-[10px] text-slate-400 font-medium">{hint}</p>}
    </div>
);

export const inputClass = 'w-full p-3.5 bg-slate-50 rounded-2xl border border-slate-100 focus:ring-2 focus:ring-brand-blue outline-none font-bold text-slate-800 transition-all placeholder:text-slate-300 disabled:opacity-60';
export const primaryButtonClass = 'bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-2xl font-black flex items-center justify-center gap-2 transition-all shadow-lg shadow-slate-900/10 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';
export const secondaryButtonClass = 'bg-white border border-slate-200 text-slate-600 px-5 py-3 rounded-2xl font-bold hover:bg-slate-50 transition-all disabled:opacity-50';
export const smallButtonClass = 'px-3 py-1.5 rounded-xl text-xs font-black transition-all disabled:opacity-50';

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

export const StatusPill: React.FC<{ active: boolean; activeText?: string; inactiveText?: string }> = ({ active, activeText = 'نشط', inactiveText = 'متوقف' }) => (
    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{active ? activeText : inactiveText}</span>
);

import React from 'react';
import { Check, XCircle, AlertTriangle } from 'lucide-react';
import { ORDER_STEPS, orderProgress } from '@application/services/orderProgress';
import type { OrderStatus, OrderStatusEntry } from '@domain/entities';
import { formatDateTime } from '@application/services/format';
import { cn } from '@presentation/utils/cn';

// Where the Order is, at a glance. A vertical list on phones, a horizontal line on wider screens;
// the current step is announced for screen readers.

export const OrderStepper: React.FC<{ status: OrderStatus; history: OrderStatusEntry[] }> = ({ status, history }) => {
    const progress = orderProgress(status, history);
    const delivered = status === 'delivered';
    const currentLabel = progress.terminal ? (progress.terminal === 'cancelled' ? 'ملغي' : 'تعذر التسليم') : ORDER_STEPS[progress.reached].label;

    return (
        <div>
            <p className="sr-only" aria-live="polite">حالة الطلب: {currentLabel}</p>
            <ol className="grid gap-4 md:grid-cols-5 md:gap-2">
                {ORDER_STEPS.map((step, index) => {
                    const done = index < progress.reached || (index === progress.reached && delivered);
                    const current = index === progress.reached && !progress.terminal && !delivered;
                    const stopped = Boolean(progress.terminal) && index === progress.reached;
                    const upcoming = index > progress.reached;
                    const at = progress.reachedAt[index];
                    return (
                        <li key={step.status} className="relative flex items-start gap-3 md:flex-col md:items-center md:text-center" aria-current={current ? 'step' : undefined}>
                            {index < ORDER_STEPS.length - 1 && (
                                <span aria-hidden="true" className={cn('absolute right-[15px] top-8 h-full w-0.5 md:right-auto md:left-0 md:top-4 md:h-0.5 md:w-1/2 md:translate-x-0', index < progress.reached ? 'bg-brand-blue' : 'bg-gray-200')} />
                            )}
                            {index > 0 && (
                                <span aria-hidden="true" className={cn('hidden md:block absolute right-0 top-4 h-0.5 w-1/2', index <= progress.reached ? 'bg-brand-blue' : 'bg-gray-200')} />
                            )}
                            <span className={cn('relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold bg-white',
                                done && 'border-brand-blue bg-brand-blue text-white',
                                current && 'border-brand-blue text-brand-blue ring-4 ring-brand-blue-soft',
                                stopped && (progress.terminal === 'cancelled' ? 'border-gray-400 bg-gray-100 text-gray-500' : 'border-status-danger-ink bg-status-danger-ground text-status-danger-ink'),
                                upcoming && 'border-gray-200 text-gray-300')}>
                                {done ? <Check className="w-4 h-4" /> : stopped ? (progress.terminal === 'cancelled' ? <XCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />) : index + 1}
                            </span>
                            <span className="min-w-0">
                                <span className={cn('block text-sm', upcoming ? 'text-gray-400' : 'font-bold text-gray-800')}>{step.label}</span>
                                {current && <span className="block text-xs text-gray-500">{step.hint}</span>}
                                {at && !upcoming && <span className="block text-[10px] text-gray-400">{formatDateTime(at)}</span>}
                            </span>
                        </li>
                    );
                })}
            </ol>
            {progress.terminal && (
                <div role="status" className={cn('mt-4 rounded-control border p-3 text-sm', progress.terminal === 'cancelled' ? 'border-gray-200 bg-gray-50 text-gray-700' : 'border-status-danger-ground bg-status-danger-ground text-status-danger-ink')}>
                    <span className="font-bold">{progress.terminal === 'cancelled' ? 'تم إلغاء الطلب' : 'تعذر تسليم الطلب'}</span>
                    {progress.terminalAt && <span className="text-xs opacity-80"> · {formatDateTime(progress.terminalAt)}</span>}
                    {progress.terminalNote && <span className="block mt-1 text-xs">{progress.terminalNote}</span>}
                    {progress.terminal === 'delivery_failed' && <span className="block mt-1 text-xs">سنتواصل معك لإعادة محاولة التوصيل.</span>}
                </div>
            )}
        </div>
    );
};

export type OrderStatus = 'new' | 'confirmed' | 'preparing' | 'shipped' | 'delivered' | 'cancelled' | 'delivery_failed';
export type PaymentStatus = 'pending' | 'proof_submitted' | 'paid' | 'refunded';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
    new: 'جديد',
    confirmed: 'مؤكد',
    preparing: 'قيد التجهيز',
    shipped: 'في الطريق',
    delivered: 'تم التوصيل',
    cancelled: 'ملغي',
    delivery_failed: 'تعذر التسليم',
};

export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
    new: 'bg-blue-50 text-blue-600 border-blue-100',
    confirmed: 'bg-amber-50 text-amber-600 border-amber-100',
    preparing: 'bg-purple-50 text-purple-600 border-purple-100',
    shipped: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    delivered: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
    delivery_failed: 'bg-red-50 text-red-600 border-red-100',
};

export const ORDER_STATUS_DOTS: Record<OrderStatus, string> = {
    new: 'bg-blue-500',
    confirmed: 'bg-amber-500',
    preparing: 'bg-purple-500',
    shipped: 'bg-indigo-500',
    delivered: 'bg-emerald-500',
    cancelled: 'bg-slate-400',
    delivery_failed: 'bg-red-500',
};

export function orderStatusDot(status: string): string {
    return ORDER_STATUS_DOTS[status as OrderStatus] ?? 'bg-gray-400';
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
    pending: 'بانتظار الدفع',
    proof_submitted: 'بانتظار مراجعة الإثبات',
    paid: 'مدفوع',
    refunded: 'مسترد',
};

export const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
    pending: 'bg-slate-100 text-slate-600',
    proof_submitted: 'bg-amber-100 text-amber-700',
    paid: 'bg-emerald-100 text-emerald-700',
    refunded: 'bg-red-100 text-red-700',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
    COD: 'الدفع عند الاستلام',
    Mychashi: 'تحويل ماي كاشي',
};

export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    new: ['confirmed', 'cancelled'],
    confirmed: ['preparing', 'shipped', 'cancelled'],
    preparing: ['shipped', 'cancelled'],
    shipped: ['delivered', 'delivery_failed'],
    delivered: [],
    cancelled: [],
    delivery_failed: ['confirmed', 'cancelled'],
};

export function orderStatusLabel(status: string): string {
    return ORDER_STATUS_LABELS[status as OrderStatus] ?? status;
}

// The single "keep this order moving" action for a status, when there is one — the first
// non-cancel entry in ALLOWED_TRANSITIONS. `confirmed` has no unambiguous single next step
// (preparing or shipped are both valid), so callers should treat a null return as "open the
// order to decide," not as "nothing to do."
export function primaryForwardTransition(status: OrderStatus): OrderStatus | null {
    if (status === 'confirmed') return null;
    return ALLOWED_TRANSITIONS[status]?.find((s) => s !== 'cancelled') ?? null;
}

export function orderStatusStyle(status: string): string {
    return ORDER_STATUS_STYLES[status as OrderStatus] ?? 'bg-gray-50 text-gray-600 border-gray-100';
}

export function paymentStatusLabel(status: string): string {
    return PAYMENT_STATUS_LABELS[status as PaymentStatus] ?? status;
}

export function paymentStatusStyle(status: string): string {
    return PAYMENT_STATUS_STYLES[status as PaymentStatus] ?? 'bg-slate-100 text-slate-600';
}

export function paymentMethodLabel(code: string): string {
    return PAYMENT_METHOD_LABELS[code] ?? code;
}

const TIMEZONE = 'Africa/Khartoum';

export function formatSDG(amount: number | null | undefined): string {
    return `${Math.round(Number(amount ?? 0)).toLocaleString('ar-EG')} ج.س`;
}

export function formatNumber(value: number | null | undefined): string {
    return Number(value ?? 0).toLocaleString('ar-EG');
}

export function formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short', timeZone: TIMEZONE }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeZone: TIMEZONE }).format(new Date(iso));
}

// <input type="datetime-local"> speaks the browser's local time without a zone; these convert to
// and from the ISO instants the backend stores.
export function toLocalInput(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
    return value ? new Date(value).toISOString() : null;
}

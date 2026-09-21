// Money and dates as the Storefront shows them: Sudanese pounds with Arabic digits,
// timestamps converted from UTC to Sudan time.

const TIMEZONE = 'Africa/Khartoum';

export function formatSDG(amount: number | null | undefined): string {
    return `${Math.round(Number(amount ?? 0)).toLocaleString('ar-EG')} ج.س`;
}

export function formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short', timeZone: TIMEZONE }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeZone: TIMEZONE }).format(new Date(iso));
}

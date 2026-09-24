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

// "Since" wording for feeds: minutes/hours today, otherwise the date.
export function formatRelative(iso: string | null | undefined, now: Date = new Date()): string {
    if (!iso) return '';
    const then = new Date(iso);
    const minutes = Math.round((now.getTime() - then.getTime()) / 60_000);
    if (minutes < 1) return 'الآن';
    if (minutes < 60) return `قبل ${minutes} دقيقة`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `قبل ${hours} ساعة`;
    return formatDate(iso);
}

export function formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeZone: TIMEZONE }).format(new Date(iso));
}

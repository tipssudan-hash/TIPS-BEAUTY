export function discountedPrice(price: number, discountPercentage: number | null | undefined): number {
    const pct = discountPercentage ?? 0;
    return pct > 0 ? Number((price * (1 - pct / 100)).toFixed(2)) : price;
}

export function formatSDG(amount: number | null | undefined): string {
    return `${Math.round(amount ?? 0).toLocaleString('ar-EG')} ج.س`;
}

export function formatDateTime(iso: string): string {
    return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Khartoum' }).format(new Date(iso));
}

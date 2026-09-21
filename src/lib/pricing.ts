export function discountedPrice(price: number, discountPercentage: number | null | undefined): number {
    const pct = discountPercentage ?? 0;
    return pct > 0 ? Number((price * (1 - pct / 100)).toFixed(2)) : price;
}

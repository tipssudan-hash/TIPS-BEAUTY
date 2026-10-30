import type { OrderItem, Product, ProductVariant } from '../../domain/entities';

export interface ReorderLine {
    product: Product;
    variant: ProductVariant | null;
    quantity: number;
}

// The Cart lines a past Order would produce today. A line is skipped when its Product is gone, its Variant
// no longer exists, or the Product is out of stock. Stock caps are applied later, when the Cart takes the lines.
export function planReorder(items: Pick<OrderItem, 'id' | 'variant_id' | 'quantity'>[], products: Product[]): { lines: ReorderLine[]; skipped: number } {
    const live = new Map(products.map((p) => [p.id, p]));
    const lines: ReorderLine[] = [];
    let skipped = 0;
    for (const item of items) {
        const product = live.get(item.id);
        const variant = item.variant_id && product ? product.variants.find((v) => v.id === item.variant_id) ?? null : null;
        if (!product || product.isRemoved || (item.variant_id && !variant) || (!variant && product.stock <= 0)) {
            skipped++;
            continue;
        }
        lines.push({ product, variant, quantity: item.quantity });
    }
    return { lines, skipped };
}

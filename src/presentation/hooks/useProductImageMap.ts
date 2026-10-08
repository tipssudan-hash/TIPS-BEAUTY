import { useEffect, useState, useMemo } from 'react';
import { fetchProducts } from '@infrastructure/repositories';
import { imgUrl } from '@infrastructure/repositories/productRepository';
import type { Product } from '@domain/entities';

interface ProductImageLookup {
    byId: Map<string, string>;
    byName: Map<string, string>;
}

export function useProductImageMap() {
    const [products, setProducts] = useState<Product[]>([]);

    useEffect(() => {
        let active = true;
        fetchProducts()
            .then((list) => {
                if (active) setProducts(list);
            })
            .catch(() => {
                // Non-critical fallback
            });
        return () => {
            active = false;
        };
    }, []);

    const lookup = useMemo<ProductImageLookup>(() => {
        const byId = new Map<string, string>();
        const byName = new Map<string, string>();

        for (const p of products) {
            const img = p.image || (p.images && p.images[0]) || '';
            if (p.id && img) byId.set(p.id, img);
            if (p.name_ar && img) byName.set(p.name_ar.trim().toLowerCase(), img);
        }

        return { byId, byName };
    }, [products]);

    const getProductImageUrl = (item: { id?: string | null; productId?: string | null; name_ar?: string | null; imageUrl?: string | null }, width = 140): string => {
        if (item.imageUrl) return imgUrl(item.imageUrl, width);
        if (item.id && lookup.byId.has(item.id)) return imgUrl(lookup.byId.get(item.id)!, width);
        if (item.productId && lookup.byId.has(item.productId)) return imgUrl(lookup.byId.get(item.productId)!, width);
        if (item.name_ar) {
            const normalized = item.name_ar.trim().toLowerCase();
            if (lookup.byName.has(normalized)) return imgUrl(lookup.byName.get(normalized)!, width);
        }
        return '';
    };

    return { getProductImageUrl, products };
}

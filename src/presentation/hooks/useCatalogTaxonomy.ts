import { useEffect, useMemo, useState } from 'react';
import type { Brand, Category, Product } from '@domain/entities';
import { fetchBrands, fetchCategories } from '@infrastructure/repositories';
import { getCached, subscribeCache } from '@infrastructure/cache';
import { brandsFromProducts, categoriesFromProducts } from '@application/services/productSearch';

// Categories and brands come from the backend; when either read fails the lists are rebuilt from the
// products already loaded, so the storefront keeps filtering without any mock data.
export function useCatalogTaxonomy(products: Product[]): { categories: Category[]; brands: Brand[] } {
    const [categories, setCategories] = useState<Category[] | null>(() => getCached<Category[]>('catalog:categories'));
    const [brands, setBrands] = useState<Brand[] | null>(() => getCached<Brand[]>('catalog:brands'));

    useEffect(() => {
        let active = true;
        void Promise.allSettled([fetchCategories(), fetchBrands()]).then(([c, b]) => {
            if (!active) return;
            if (c.status === 'fulfilled') setCategories(c.value);
            else console.error('Failed to load categories', c.reason);
            if (b.status === 'fulfilled') setBrands(b.value);
            else console.error('Failed to load brands', b.reason);
        });
        return () => { active = false; };
    }, []);

    useEffect(() => subscribeCache<Category[]>('catalog:categories', setCategories), []);
    useEffect(() => subscribeCache<Brand[]>('catalog:brands', setBrands), []);

    return useMemo(
        () => ({
            categories: categories ?? categoriesFromProducts(products),
            brands: brands ?? brandsFromProducts(products),
        }),
        [categories, brands, products]
    );
}

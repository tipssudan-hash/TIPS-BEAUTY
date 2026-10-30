import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidateAll } from '../../src/infrastructure/cache';
import { fetchBanners, fetchBrands, fetchCategories, fetchCollections, fetchDeliveryZones, fetchOffers, fetchPaymentMethods } from '../../src/infrastructure/repositories/catalogRepository';
import { fetchProduct, fetchProducts } from '../../src/infrastructure/repositories/productRepository';

const mockState = vi.hoisted(() => {
    const state = { data: null as unknown, error: null as unknown };
    const builder = (): unknown => {
        const query: unknown = new Proxy({}, {
            get: (_target, prop) => prop === 'then'
                ? (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
                    Promise.resolve({ data: state.data, error: state.error }).then(resolve, reject)
                : () => query,
        });
        return query;
    };
    return { state, builder };
});

vi.mock('../../src/infrastructure/supabase/client', () => ({
    supabase: {
        rpc: () => mockState.builder(),
        from: () => mockState.builder(),
    },
}));

const loaders: [string, () => Promise<unknown>][] = [
    ['offers', () => fetchOffers()],
    ['banners', () => fetchBanners()],
    ['collections', () => fetchCollections()],
    ['categories', () => fetchCategories()],
    ['brands', () => fetchBrands()],
    ['payment methods', () => fetchPaymentMethods()],
    ['delivery zones', () => fetchDeliveryZones()],
    ['products', () => fetchProducts()],
    ['product', () => fetchProduct('prod-001')],
];

describe('catalog repositories when Supabase fails', () => {
    beforeEach(() => {
        invalidateAll();
        vi.stubEnv('VITE_USE_MOCKS', 'false');
        mockState.state.data = null;
        mockState.state.error = { message: 'permission denied for table products' };
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it.each(loaders)('rejects the %s read instead of returning mock data', async (_name, load) => {
        await expect(load()).rejects.toBeInstanceOf(Error);
    });

    it('does not cache the failed read', async () => {
        await expect(fetchDeliveryZones()).rejects.toBeInstanceOf(Error);

        mockState.state.error = null;
        mockState.state.data = [{ id: 'zone-1', name: 'الخرطوم - وسط', state: 'الخرطوم', fee: 1500 }];
        await expect(fetchDeliveryZones()).resolves.toEqual([{ id: 'zone-1', name: 'الخرطوم - وسط', state: 'الخرطوم', fee: 1500 }]);
    });

    it('treats a successful empty result as the real answer', async () => {
        mockState.state.error = null;
        mockState.state.data = [];

        await expect(fetchOffers()).resolves.toEqual([]);
        await expect(fetchPaymentMethods()).resolves.toEqual([]);
        await expect(fetchDeliveryZones()).resolves.toEqual([]);
    });
});

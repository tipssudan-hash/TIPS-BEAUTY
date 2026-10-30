// Local development only: with DEV off (any production build) the dynamic import is dead code and
// the mock catalogue never reaches the bundle or a customer's device.
export async function loadDevMockData(): Promise<typeof import('../mockData') | null> {
    if (!(import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true')) return null;
    return import('../mockData');
}

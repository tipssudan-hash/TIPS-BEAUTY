import { test, expect, type Page } from '@playwright/test';
import { TEST_TAG, cleanupTestOrders, creds, haveCreds, provisionProduct, signedInClient, type Client } from '../backend/helpers';

// T2-13 (GitHub #15): two local browser flows against the live project with the test accounts —
// customer login → add to Cart → COD checkout → Order in My Orders; admin login → Order visible
// → confirm. Reuses the vitest backend suite's own fixtures (TEST_TAG, provisionProduct,
// cleanupTestOrders) so this suite tags and cleans up its Order the same way, rather than a
// second ad hoc convention. Run with `npm run test:e2e` — not wired into CI.

const STOREFRONT = 'http://localhost:3000';
const ADMIN = 'http://localhost:5173';

const suite = haveCreds ? test.describe : test.describe.skip;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function loginCustomer(page: Page) {
    await page.goto(`${STOREFRONT}/login`);
    const emailToggle = page.getByRole('button', { name: 'تسجيل الدخول بالبريد الإلكتروني وكلمة المرور' });
    if (await emailToggle.isVisible().catch(() => false)) await emailToggle.click();
    await page.locator('input[type="email"]').fill(creds.customer.email);
    await page.locator('input[type="password"]').fill(creds.customer.password);
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

suite('smoke: customer checkout then admin confirm', () => {
    let admin: Client;
    let product: { id: string; warehouseId: string; release: () => Promise<void> };
    let zone: { id: string; name: string; state: string | null };
    // Shared between the two tests below — the admin flow confirms the Order the customer flow places.
    let orderNumber: string;

    test.beforeAll(async () => {
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        await cleanupTestOrders(admin);
        product = await provisionProduct(admin);
        const { data: z, error } = await admin.from('delivery_zones').select('id,name,state').eq('is_active', true).eq('state', 'الخرطوم').order('name').limit(1).single();
        if (error) throw error;
        zone = z;
    });

    test.afterAll(async () => {
        if (!admin) return;
        await cleanupTestOrders(admin);
        await product?.release();
    });

    test('customer logs in, adds to Cart, checks out with COD, and sees the Order in My Orders', async ({ page }) => {
        await loginCustomer(page);

        await page.goto(`${STOREFRONT}/product/${product.id}`);
        // The product page also renders a "related products" carousel with the same button
        // label on each mini card; the main product's own CTA is the first one in DOM order.
        await page.getByRole('button', { name: 'أضيفي للسلة' }).first().click();

        await page.goto(`${STOREFRONT}/checkout`);
        await page.getByLabel('الاسم بالكامل').fill(TEST_TAG);
        await page.getByLabel('رقم الهاتف').fill('0999999999');
        await page.getByLabel('الولاية').selectOption(zone.state ?? 'الخرطوم');
        await page.getByLabel('المحلية').selectOption(zone.id);
        await page.getByLabel('العنوان بالتفصيل').fill(`${TEST_TAG} — يرجى الحذف`);
        await page.locator('input[type="radio"][name="payment"][value="COD"]').check();
        await page.getByRole('button', { name: /تأكيد الطلب/ }).click();

        await page.waitForURL(/\/orders\/[^/]+$/, { timeout: 20_000 });
        const heading = page.getByRole('heading', { name: /^طلب / });
        await expect(heading).toBeVisible();
        const headingText = (await heading.textContent()) ?? '';
        orderNumber = headingText.replace('طلب', '').trim();
        expect(orderNumber.length).toBeGreaterThan(0);

        await page.goto(`${STOREFRONT}/orders`);
        await expect(page.getByText(orderNumber, { exact: false })).toBeVisible();
    });

    test('admin logs in, finds the Order, and confirms it', async ({ page }) => {
        expect(orderNumber, 'customer flow must run first and capture an order number').toBeTruthy();

        await page.goto(`${ADMIN}/login`);
        await page.locator('input[type="email"]').fill(creds.admin.email);
        await page.locator('input[type="password"]').fill(creds.admin.password);
        await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
        await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

        await page.goto(`${ADMIN}/orders`);
        await page.getByPlaceholder('البحث برقم الطلب، اسم العميل، أو الهاتف...').fill(orderNumber);

        const confirmButton = page.getByRole('button', { name: new RegExp(`نقل الطلب ${escapeRegExp(orderNumber)} إلى مؤكد`) });
        await expect(confirmButton).toBeVisible({ timeout: 10_000 });
        await confirmButton.click();

        // Scoped to this order's row — the page also has a status filter <select> with a hidden
        // "مؤكد" <option> that a page-wide text search would otherwise match instead.
        const row = page.locator('tr', { hasText: orderNumber });
        await expect(row.getByText('مؤكد', { exact: true })).toBeVisible({ timeout: 10_000 });
    });
});

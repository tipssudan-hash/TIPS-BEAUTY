import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import type { Database } from '../../src/lib/database.types';

config({ path: '.env' });
config({ path: '.env.test.local', override: true });

const url = process.env.VITE_SUPABASE_URL!;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY!;

export type Client = SupabaseClient<Database>;

export const TEST_TAG = 'TEST-AUTOMATED';

export function anonClient(): Client {
    return createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function signedInClient(email: string, password: string): Promise<Client> {
    const client = anonClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`Login failed for ${email}: ${error.message}`);
    return client;
}

export const creds = {
    customer: { email: process.env.TEST_CUSTOMER_EMAIL ?? '', password: process.env.TEST_CUSTOMER_PASSWORD ?? '' },
    admin: { email: process.env.TEST_ADMIN_EMAIL ?? '', password: process.env.TEST_ADMIN_PASSWORD ?? '' },
};

export const haveCreds = Boolean(creds.customer.email && creds.customer.password && creds.admin.email && creds.admin.password);

export const rpc = (client: Client, fn: string, args?: Record<string, unknown>) =>
    (client.rpc as unknown as (f: string, a?: Record<string, unknown>) => ReturnType<Client['rpc']>)(fn, args);

export async function publicStock(client: Client, productId: string): Promise<number> {
    const { data, error } = await client.rpc('get_public_product', { p_product_id: productId });
    if (error) throw error;
    return Number((data as { stock: number }[])[0]?.stock ?? 0);
}

export async function pickProduct(client: Client, minStock: number) {
    const { data, error } = await client.rpc('get_public_products');
    if (error) throw error;
    const rows = data as { id: string; stock: number; price: number; name_ar: string }[];
    const product = rows.find((p) => p.stock >= minStock);
    if (!product) throw new Error(`No product with stock >= ${minStock}; adjust inventory in the admin portal first`);
    return product;
}

export async function pickZone(client: Client) {
    const { data, error } = await client.from('delivery_zones').select('name,state,fee').eq('is_active', true).eq('state', 'الخرطوم').order('name').limit(1);
    if (error) throw error;
    if (!data?.[0]) throw new Error('No active Khartoum delivery zone');
    return data[0];
}

export function checkoutArgs(zone: { name: string; state: string | null }, items: { id: string; quantity: number }[], key: string) {
    return {
        p_customer_name: TEST_TAG,
        p_phone: '0999999999',
        p_shipping_address: 'عنوان اختبار آلي — يرجى الحذف',
        p_city: zone.name,
        p_state: zone.state ?? 'الخرطوم',
        p_payment_method: 'COD',
        p_items: items,
        p_idempotency_key: key,
    };
}

export async function cleanupTestOrders(admin: Client) {
    const { data } = await admin.from('orders').select('id,status').eq('customer_name', TEST_TAG);
    for (const order of data ?? []) {
        if (order.status !== 'cancelled') {
            await rpc(admin, 'admin_update_order_operation', { p_order_id: order.id, p_expected_status: order.status, p_status: 'cancelled', p_note: 'cleanup' });
        }
        await admin.from('orders').delete().eq('id', order.id);
    }
}

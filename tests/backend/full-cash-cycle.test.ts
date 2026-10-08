import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
    TEST_TAG,
    checkoutArgs,
    cleanupTestOrders,
    creds,
    haveCreds,
    pickZone,
    provisionProduct,
    rpc,
    signedInClient,
    type Client,
} from './helpers';

/**
 * Full order lifecycle:
 *   Customer checkout (COD) → Admin confirms → Supervisor assigns driver →
 *   Driver picks up (shipped) → Driver delivers → COD auto-marked paid →
 *   Driver submits cash remittance → Supervisor confirms remittance
 *
 * Requires .env.test.local with TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD,
 * TEST_CUSTOMER_EMAIL, TEST_CUSTOMER_PASSWORD.
 */

const suite = haveCreds ? describe : describe.skip;

suite('full order-to-settlement cycle', () => {
    let admin: Client;
    let customer: Client;
    let product: { id: string; warehouseId: string; release: () => Promise<void> };
    let zone: { name: string; state: string | null; fee: number };
    let driverId: string;
    let orderId: string;

    beforeAll(async () => {
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        customer = await signedInClient(creds.customer.email, creds.customer.password);
        await cleanupTestOrders(admin);
        product = await provisionProduct(admin);
        zone = await pickZone(customer);

        // Clean up any previous test drivers
        await admin.from('drivers').delete().like('name', `${TEST_TAG}%`);

        // Create driver record linked to the KRT warehouse
        const { data: wh } = await admin
            .from('warehouses')
            .select('id')
            .eq('code', 'KRT')
            .single();
        const { data: driverData, error: driverErr } = await admin
            .from('drivers')
            .insert({
                name: `${TEST_TAG} Cash-Cycle Driver`,
                phone: '0911223344',
                status: 'active',
                warehouse_id: wh!.id,
            })
            .select('id')
            .single();
        if (driverErr) throw driverErr;
        driverId = driverData.id;

        // Link the customer account as this driver
        const link = await rpc(admin, 'admin_link_driver_user', {
            p_driver_id: driverId,
            p_email: creds.customer.email,
        });
        if (link.error) throw link.error;
    });

    afterAll(async () => {
        if (!admin) return;
        await cleanupTestOrders(admin);
        if (driverId) {
            await rpc(admin, 'admin_unlink_driver_user', { p_driver_id: driverId });
            // Clean up remittances before deleting driver (FK cascade should handle it)
            await (admin.from as any)('driver_cash_remittances')
                .delete()
                .eq('driver_id', driverId);
            await admin.from('drivers').delete().eq('id', driverId);
        }
        await product?.release();
    });

    // ── Step 1: Customer places a COD order ─────────────────────────────────
    it('1️⃣ customer places a COD order → status = new, payment = pending', async () => {
        const created = await rpc(
            customer,
            'checkout_order_safe',
            checkoutArgs(zone, [{ id: product.id, quantity: 2 }], randomUUID()),
        );
        expect(created.error).toBeNull();
        orderId = (created.data as { order_id: string }[])[0].order_id;
        expect(orderId).toBeTruthy();

        const { data: order } = await admin
            .from('orders')
            .select('status, payment_method, payment_status, total')
            .eq('id', orderId)
            .single();
        expect(order!.status).toBe('new');
        expect(order!.payment_method).toBe('COD');
        expect(order!.payment_status).toBe('pending');
        expect(Number(order!.total)).toBeGreaterThan(0);
        console.log(`   ✓ Order ${orderId} created, total = ${order!.total} SDG`);
    });

    // ── Step 2: Admin confirms the order ────────────────────────────────────
    it('2️⃣ admin confirms order → status = confirmed', async () => {
        const confirm = await rpc(admin, 'admin_update_order_operation', {
            p_order_id: orderId,
            p_expected_status: 'new',
            p_status: 'confirmed',
            p_driver_id: driverId,
        });
        expect(confirm.error).toBeNull();

        const { data: order } = await admin
            .from('orders')
            .select('status, driver_id')
            .eq('id', orderId)
            .single();
        expect(order!.status).toBe('confirmed');
        expect(order!.driver_id).toBe(driverId);
        console.log('   ✓ Order confirmed and driver assigned');
    });

    // ── Step 3: Driver sees the order via RPC ───────────────────────────────
    it('3️⃣ driver sees the order with COD amount', async () => {
        const { data, error } = await rpc(customer, 'get_my_deliveries', { p_order_id: orderId });
        expect(error).toBeNull();
        const deliveries = data as unknown as {
            id: string;
            status: string;
            cod_amount: number | null;
            payment_method: string;
            customer_name: string;
        }[];
        expect(deliveries).toHaveLength(1);
        expect(deliveries[0].id).toBe(orderId);
        expect(deliveries[0].status).toBe('confirmed');
        expect(deliveries[0].payment_method).toBe('COD');
        expect(deliveries[0].cod_amount).toBeGreaterThan(0);
        console.log(`   ✓ Driver sees order, COD amount = ${deliveries[0].cod_amount} SDG`);
    });

    // ── Step 4: Driver picks up → shipped ───────────────────────────────────
    it('4️⃣ driver picks up order → status = shipped', async () => {
        const pickup = await rpc(customer, 'update_driver_order_status', {
            p_order_id: orderId,
            p_status: 'shipped',
        });
        expect(pickup.error).toBeNull();

        const { data: order } = await admin
            .from('orders')
            .select('status')
            .eq('id', orderId)
            .single();
        expect(order!.status).toBe('shipped');
        console.log('   ✓ Order picked up → shipped');
    });

    // ── Step 5: Driver delivers → delivered + COD auto-paid ─────────────────
    it('5️⃣ driver delivers → status = delivered, payment auto-flipped to paid', async () => {
        const deliver = await rpc(customer, 'update_driver_order_status', {
            p_order_id: orderId,
            p_status: 'delivered',
            p_note: `${TEST_TAG} cash collected`,
        });
        expect(deliver.error).toBeNull();

        const { data: order } = await admin
            .from('orders')
            .select('status, payment_status, financial_status')
            .eq('id', orderId)
            .single();
        expect(order!.status).toBe('delivered');
        expect(order!.payment_status).toBe('paid');
        expect(order!.financial_status).toBe('paid');
        console.log('   ✓ Order delivered, COD payment auto-confirmed ✅');
    });

    // ── Step 6: Driver submits cash remittance ──────────────────────────────
    it('6️⃣ driver submits cash remittance → stored with status submitted', async () => {
        const { data: order } = await admin
            .from('orders')
            .select('total')
            .eq('id', orderId)
            .single();
        const amount = Number(order!.total);

        const submit = await rpc(customer, 'driver_submit_cash_remittance', {
            p_amount: amount,
            p_notes: `${TEST_TAG} cash handover`,
        });
        expect(submit.error).toBeNull();
        const remittanceId = (submit.data as unknown as string);
        expect(remittanceId).toBeTruthy();

        // Verify the remittance is visible to the driver
        const { data: remittances } = await (customer.from as any)('driver_cash_remittances')
            .select('id, amount, status, driver_notes')
            .eq('id', remittanceId);
        expect(remittances).toHaveLength(1);
        expect(remittances[0].status).toBe('submitted');
        expect(Number(remittances[0].amount)).toBe(amount);
        console.log(`   ✓ Cash remittance submitted: ${amount} SDG (id: ${remittanceId})`);

        // Store for next step
        (globalThis as any).__testRemittanceId = remittanceId;
        (globalThis as any).__testRemittanceAmount = amount;
    });

    // ── Step 7: Supervisor confirms the remittance ──────────────────────────
    it('7️⃣ supervisor confirms cash remittance → status = confirmed', async () => {
        const remittanceId = (globalThis as any).__testRemittanceId;
        const amount = (globalThis as any).__testRemittanceAmount;

        // Use admin (who can act as supervisor for this test)
        const confirm = await rpc(admin, 'supervisor_confirm_cash_remittance', {
            p_remittance_id: remittanceId,
            p_action: 'confirmed',
            p_notes: `${TEST_TAG} cash received and counted`,
        });
        expect(confirm.error).toBeNull();

        // Verify the remittance status
        const { data: remittances } = await (admin.from as any)('driver_cash_remittances')
            .select('id, status, confirmed_at, supervisor_notes')
            .eq('id', remittanceId);
        expect(remittances).toHaveLength(1);
        expect(remittances[0].status).toBe('confirmed');
        expect(remittances[0].confirmed_at).not.toBeNull();
        console.log(`   ✓ Cash remittance confirmed by supervisor: ${amount} SDG ✅`);
    });

    // ── Step 8: Final verification — full cycle complete ────────────────────
    it('8️⃣ final state: order delivered + paid + cash settled', async () => {
        const { data: order } = await admin
            .from('orders')
            .select('status, payment_method, payment_status, financial_status, total, driver_id')
            .eq('id', orderId)
            .single();

        expect(order!.status).toBe('delivered');
        expect(order!.payment_method).toBe('COD');
        expect(order!.payment_status).toBe('paid');
        expect(order!.financial_status).toBe('paid');
        expect(order!.driver_id).toBe(driverId);

        // Check status history has the full trail
        const { data: history } = await admin
            .from('order_status_history')
            .select('status, note')
            .eq('order_id', orderId)
            .order('created_at', { ascending: true });

        const statuses = (history ?? []).map((h: any) => h.status);
        expect(statuses).toContain('confirmed');
        expect(statuses).toContain('shipped');
        expect(statuses).toContain('delivered');

        console.log('\n   ════════════════════════════════════════════════');
        console.log('   ✅ FULL CYCLE COMPLETE');
        console.log(`   Order: ${orderId}`);
        console.log(`   Total: ${order!.total} SDG`);
        console.log(`   Status: ${order!.status}`);
        console.log(`   Payment: ${order!.payment_status} (${order!.payment_method})`);
        console.log(`   Financial: ${order!.financial_status}`);
        console.log(`   History: ${statuses.join(' → ')}`);
        console.log('   ════════════════════════════════════════════════\n');
    });
});

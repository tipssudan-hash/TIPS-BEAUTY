import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
    TEST_TAG,
    checkoutArgs,
    cleanupTestOrders,
    creds,
    haveCreds,
    loose,
    pickZone,
    provisionProduct,
    rpc,
    signedInClient,
    type Client,
} from './helpers';

/**
 * Full order lifecycle:
 *   Customer checkout (COD) → Admin confirms → Supervisor assigns driver →
 *   Driver picks up (shipped) → Driver delivers → COD auto-marked paid and recorded in the driver cash ledger →
 *   Driver submits cash remittance → Supervisor confirms remittance (ledger entry, negative) → cash position closes
 *
 * Requires .env.test.local with TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD,
 * TEST_CUSTOMER_EMAIL, TEST_CUSTOMER_PASSWORD.
 */

const suite = haveCreds ? describe : describe.skip;

type DeliveryRow = { id: string; status: string; cod_amount: number | null; payment_method: string; customer_name: string; cod_collected: boolean };
type CashPosition = { closing_balance: number; collected: number; remitted_confirmed: number; adjustments: number; pending_submitted: number };

suite('full order-to-settlement cycle', () => {
    let admin: Client;
    let customer: Client;
    let product: { id: string; warehouseId: string; release: () => Promise<void> };
    let zone: { name: string; state: string | null; fee: number };
    let driverId: string;
    let orderId: string;
    let orderTotal: number;
    let remittanceId: string;
    let pendingRemittanceId: string;

    const ledgerRows = async (column: 'order_id' | 'driver_id' | 'remittance_id', value: string) => {
        const { data, error } = await loose(admin).from('driver_cash_ledger').select('*').eq(column, value);
        if (error) throw new Error(error.message);
        return data ?? [];
    };
    const outstanding = async () => (await ledgerRows('driver_id', driverId)).reduce((sum, row) => sum + Number(row.amount), 0);

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
            // Ledger rows reference drivers, remittances and orders with ON DELETE RESTRICT, so this cleanup is best-effort.
            await loose(admin).from('driver_cash_remittances').delete().eq('driver_id', driverId);
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
    it('3️⃣ driver sees the order with COD amount, not yet collected', async () => {
        const { data, error } = await rpc(customer, 'get_my_deliveries', { p_order_id: orderId });
        expect(error).toBeNull();
        const deliveries = data as unknown as DeliveryRow[];
        expect(deliveries).toHaveLength(1);
        expect(deliveries[0].id).toBe(orderId);
        expect(deliveries[0].status).toBe('confirmed');
        expect(deliveries[0].payment_method).toBe('COD');
        expect(deliveries[0].cod_amount).toBeGreaterThan(0);
        expect(deliveries[0].cod_collected).toBe(false);
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

    // ── Step 5: Driver delivers → delivered + COD auto-paid + one ledger entry ─
    it('5️⃣ driver delivers → status = delivered, payment auto-flipped to paid, cod_collected recorded once', async () => {
        const { data: priced } = await admin.from('orders').select('total').eq('id', orderId).single();
        orderTotal = Number(priced!.total);

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

        const entries = await ledgerRows('order_id', orderId);
        expect(entries).toHaveLength(1);
        expect(entries[0].entry_type).toBe('cod_collected');
        expect(Number(entries[0].amount)).toBe(orderTotal);

        const replay = await rpc(customer, 'update_driver_order_status', { p_order_id: orderId, p_status: 'delivered' });
        expect(replay.error).toBeTruthy();
        expect(await ledgerRows('order_id', orderId)).toHaveLength(1);

        const { data: deliveries } = await rpc(customer, 'get_my_deliveries', { p_order_id: orderId });
        const [delivered] = deliveries as unknown as DeliveryRow[];
        expect(delivered.cod_amount).toBe(orderTotal);
        expect(delivered.cod_collected).toBe(true);
        console.log('   ✓ Order delivered, COD payment auto-confirmed ✅');
    });

    // ── Step 6: Driver submits cash remittance ──────────────────────────────
    it('6️⃣ driver submits cash remittance → stored with status submitted', async () => {
        const submit = await rpc(customer, 'driver_submit_cash_remittance', {
            p_amount: orderTotal,
            p_notes: `${TEST_TAG} cash handover`,
        });
        expect(submit.error).toBeNull();
        remittanceId = submit.data as unknown as string;
        expect(remittanceId).toBeTruthy();

        // Verify the remittance is visible to the driver
        const { data: remittances } = await loose(customer).from('driver_cash_remittances')
            .select('id, amount, status, driver_notes')
            .eq('id', remittanceId);
        expect(remittances).toHaveLength(1);
        expect(remittances![0].status).toBe('submitted');
        expect(Number(remittances![0].amount)).toBe(orderTotal);
        console.log(`   ✓ Cash remittance submitted: ${orderTotal} SDG (id: ${remittanceId})`);
    });

    // ── Step 7: Supervisor confirms the remittance ──────────────────────────
    it('7️⃣ supervisor confirms cash remittance → status = confirmed, negative ledger entry', async () => {
        // Use admin (who can act as supervisor for this test)
        const confirm = await rpc(admin, 'supervisor_confirm_cash_remittance', {
            p_remittance_id: remittanceId,
            p_action: 'confirmed',
            p_notes: `${TEST_TAG} cash received and counted`,
        });
        expect(confirm.error).toBeNull();

        const { data: remittances } = await loose(admin).from('driver_cash_remittances')
            .select('id, status, confirmed_at, supervisor_notes')
            .eq('id', remittanceId);
        expect(remittances).toHaveLength(1);
        expect(remittances![0].status).toBe('confirmed');
        expect(remittances![0].confirmed_at).not.toBeNull();

        const entries = await ledgerRows('remittance_id', remittanceId);
        expect(entries).toHaveLength(1);
        expect(entries[0].entry_type).toBe('remittance_confirmed');
        expect(Number(entries[0].amount)).toBe(-orderTotal);
        expect(await outstanding()).toBe(0);
        console.log(`   ✓ Cash remittance confirmed by supervisor: ${orderTotal} SDG ✅`);
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

        const statuses = (history ?? []).map((h) => h.status);
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

    // ── Step 9: a driver cannot write a remittance straight to confirmed ────
    it('9️⃣ driver cannot insert a remittance already marked confirmed', async () => {
        const { error } = await loose(customer).from('driver_cash_remittances').insert({
            driver_id: driverId,
            amount: 1,
            status: 'confirmed',
        });
        expect(error).not.toBeNull();
    });

    // ── Step 10: a driver cannot remit more than the outstanding COD ────────
    it('🔟 remittance above the outstanding COD balance is refused at submission', async () => {
        expect(await outstanding()).toBe(0);
        const submit = await rpc(customer, 'driver_submit_cash_remittance', {
            p_amount: 1,
            p_notes: `${TEST_TAG} over-balance`,
        });
        expect(submit.error?.message).toMatch(/outstanding COD/);
    });

    // ── Step 11: one remittance awaits confirmation at a time ───────────────
    it('1️⃣1️⃣ a second remittance is refused while one awaits confirmation', async () => {
        const float = await rpc(admin, 'admin_adjust_driver_cash', {
            p_driver_id: driverId,
            p_amount: 50,
            p_note: `${TEST_TAG} opening float`,
        });
        expect(float.error).toBeNull();
        expect(await outstanding()).toBe(50);

        const first = await rpc(customer, 'driver_submit_cash_remittance', { p_amount: 40, p_notes: `${TEST_TAG} partial handover` });
        expect(first.error).toBeNull();
        pendingRemittanceId = first.data as unknown as string;

        const second = await rpc(customer, 'driver_submit_cash_remittance', { p_amount: 1, p_notes: `${TEST_TAG} duplicate` });
        expect(second.error?.message).toMatch(/already awaiting/);
    });

    // ── Step 12: confirming above the outstanding COD needs an override note ─
    it('1️⃣2️⃣ confirming above the outstanding COD is refused without a note and allowed with one', async () => {
        const correction = await rpc(admin, 'admin_adjust_driver_cash', {
            p_driver_id: driverId,
            p_amount: -45,
            p_note: `${TEST_TAG} count correction`,
        });
        expect(correction.error).toBeNull();
        expect(await outstanding()).toBe(5);

        const refused = await rpc(admin, 'supervisor_confirm_cash_remittance', {
            p_remittance_id: pendingRemittanceId,
            p_action: 'confirmed',
        });
        expect(refused.error?.message).toMatch(/note is required/);

        const confirmed = await rpc(admin, 'supervisor_confirm_cash_remittance', {
            p_remittance_id: pendingRemittanceId,
            p_action: 'confirmed',
            p_notes: `${TEST_TAG} confirmed against count`,
        });
        expect(confirmed.error).toBeNull();
        expect(await outstanding()).toBe(-35);
    });

    // ── Step 13: the driver's cash position closes at the ledger balance ────
    it('1️⃣3️⃣ get_my_cash_position closes at the ledger balance', async () => {
        const { data, error } = await rpc(customer, 'get_my_cash_position');
        expect(error).toBeNull();
        const position = data as unknown as CashPosition;
        expect(Number(position.closing_balance)).toBe(await outstanding());
        expect(Number(position.collected)).toBe(orderTotal);
        expect(Number(position.remitted_confirmed)).toBe(-(orderTotal + 40));
        expect(Number(position.adjustments)).toBe(5);
        expect(Number(position.pending_submitted)).toBe(0);
    });
});

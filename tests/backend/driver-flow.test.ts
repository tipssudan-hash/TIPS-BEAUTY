import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TEST_TAG, checkoutArgs, cleanupTestOrders, creds, haveCreds, loose, pickZone, provisionProduct, rpc, signedInClient, type Client } from './helpers';

// Driver flow (launch steps 7–8) over the RPCs the surfaces use: assignment by staff, the driver's
// allow-listed reads, pickup → location sharing → delivered, and the customer's delivery view that
// exists only while the order is on the road. The test customer account doubles as the driver login
// (linked and unlinked around the run), and a second customer order is placed before linking.

const suite = haveCreds ? describe : describe.skip;

type DeliveryRow = { id: string; status: string; customer_name: string; phone: string; items: { name_ar: string; quantity: number }[]; cod_amount: number | null; payment_method: string };
type DeliveryView = { driver_name: string; driver_phone: string; latitude: number | null; longitude: number | null; location_updated_at: string | null };

suite('driver delivery flow', () => {
    let admin: Client;
    let customer: Client;
    let product: { id: string; release: () => Promise<void> };
    let zone: { name: string; state: string | null; fee: number };
    let driverId: string;
    let orderId: string;

    const myDeliveries = async (orderId?: string) => {
        const { data, error } = await rpc(customer, 'get_my_deliveries', orderId ? { p_order_id: orderId } : undefined);
        if (error) throw error;
        return data as unknown as DeliveryRow[];
    };
    const customerView = async () => {
        const { data, error } = await rpc(customer, 'get_my_delivery', { p_order_id: orderId });
        if (error) throw error;
        return (data as unknown as DeliveryView[])[0] ?? null;
    };

    beforeAll(async () => {
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        customer = await signedInClient(creds.customer.email, creds.customer.password);
        await cleanupTestOrders(admin);
        product = await provisionProduct(admin);
        zone = await pickZone(customer);
        // The order is placed as a customer, before the account becomes a driver.
        const created = await rpc(customer, 'checkout_order_safe', checkoutArgs(zone, [{ id: product.id, quantity: 2 }], randomUUID()));
        if (created.error) throw created.error;
        orderId = (created.data as { order_id: string }[])[0].order_id;
        await admin.from('drivers').delete().like('name', `${TEST_TAG}%`);
        const { data: wh } = await admin.from('warehouses').select('id').eq('code', 'KRT').single();
        const { data, error } = await admin.from('drivers').insert({ name: `${TEST_TAG} Driver Flow`, phone: '0933333333', status: 'active', warehouse_id: wh!.id }).select('id').single();
        if (error) throw error;
        driverId = data.id;
        const link = await rpc(admin, 'admin_link_driver_user', { p_driver_id: driverId, p_email: creds.customer.email });
        if (link.error) throw link.error;
    });

    afterAll(async () => {
        if (!admin) return;
        await cleanupTestOrders(admin);
        if (driverId) {
            await rpc(admin, 'admin_unlink_driver_user', { p_driver_id: driverId });
            await admin.from('drivers').delete().eq('id', driverId);
        }
        await product?.release();
    });

    it('an unassigned driver sees nothing; assignment by staff makes the order appear with only the allow-listed columns', async () => {
        expect(await myDeliveries()).toHaveLength(0);
        const confirm = await rpc(admin, 'admin_update_order_operation', { p_order_id: orderId, p_expected_status: 'new', p_status: 'confirmed', p_driver_id: driverId });
        expect(confirm.error).toBeNull();
        const [d] = await myDeliveries();
        expect(d.id).toBe(orderId);
        expect(d.status).toBe('confirmed');
        expect(d.customer_name).toBe(TEST_TAG);
        expect(d.items[0].quantity).toBe(2);
        expect(d.payment_method).toBe('COD');
        expect(d.cod_amount).toBeGreaterThan(0);
        expect(Object.keys(d)).not.toContain('coupon_code');
        expect(Object.keys(d)).not.toContain('customer_id');
        expect(Object.keys(d)).not.toContain('unit_price');
    });

    it('location sharing is refused before pickup and the customer view is empty', async () => {
        const early = await rpc(customer, 'share_driver_location', { p_latitude: 15.59, p_longitude: 32.53, p_accuracy_meters: 10 });
        expect(early.error?.message).toMatch(/active delivery/);
        expect(await customerView()).toBeNull();
    });

    it('pickup puts the order on the road; the customer sees the driver and the shared position; delivery closes it', async () => {
        const pickup = await rpc(customer, 'update_driver_order_status', { p_order_id: orderId, p_status: 'shipped' });
        expect(pickup.error).toBeNull();
        expect((await myDeliveries(orderId))[0].status).toBe('shipped');

        let view = await customerView();
        expect(view?.driver_name).toBe(TEST_TAG.split(' ')[0]);
        expect(view?.driver_phone).toBe('0933333333');
        expect(view?.latitude).toBeNull();

        const share = await rpc(customer, 'share_driver_location', { p_latitude: 15.59, p_longitude: 32.53, p_accuracy_meters: 10 });
        expect(share.error).toBeNull();
        view = await customerView();
        expect(Number(view?.latitude)).toBeCloseTo(15.59, 4);
        expect(view?.location_updated_at).not.toBeNull();

        const failedWithoutReason = await rpc(customer, 'update_driver_order_status', { p_order_id: orderId, p_status: 'delivery_failed' });
        expect(failedWithoutReason.error?.message).toMatch(/reason/);

        const delivered = await rpc(customer, 'update_driver_order_status', { p_order_id: orderId, p_status: 'delivered', p_note: `${TEST_TAG} handed over` });
        expect(delivered.error).toBeNull();
        expect((await myDeliveries(orderId))[0].status).toBe('delivered');
        // Delivered orders still list for the day, and the customer view closes with the delivery.
        expect((await myDeliveries()).some((d) => d.id === orderId)).toBe(true);
        expect(await customerView()).toBeNull();
        const { data: loc } = await admin.from('driver_last_locations').select('driver_id').eq('driver_id', driverId);
        expect(loc).toHaveLength(0);
    });

    it('a repeated delivered from the same driver returns the status without error', async () => {
        const again = await rpc(customer, 'update_driver_order_status', { p_order_id: orderId, p_status: 'delivered' });
        expect(again.error).toBeNull();
        expect(again.data).toBe('delivered');
    });
});

suite('delivery code verification with require_delivery_code enabled', () => {
    let admin: Client;
    let customer: Client;
    let product: { id: string; release: () => Promise<void> };
    let zone: { name: string; state: string | null; fee: number };
    let driverId: string;
    let lockedOrderId: string;
    let originalFlag = false;

    const setFlag = async (value: boolean) => {
        const { error } = await loose(admin).from('app_settings').update({ require_delivery_code: value }).eq('id', true);
        if (error) throw new Error(error.message);
    };
    const shippedOrder = async () => {
        const created = await rpc(customer, 'checkout_order_safe', checkoutArgs(zone, [{ id: product.id, quantity: 1 }], randomUUID()));
        if (created.error) throw created.error;
        const orderId = (created.data as { order_id: string }[])[0].order_id;
        const confirm = await rpc(admin, 'admin_update_order_operation', { p_order_id: orderId, p_expected_status: 'new', p_status: 'confirmed', p_driver_id: driverId });
        if (confirm.error) throw confirm.error;
        const ship = await rpc(customer, 'update_driver_order_status', { p_order_id: orderId, p_status: 'shipped' });
        if (ship.error) throw ship.error;
        return orderId;
    };
    const issuedCode = async (orderId: string) => {
        const { data, error } = await loose(customer).from('customer_notifications').select('body_ar').eq('order_id', orderId).eq('type', 'delivery_code');
        if (error) throw new Error(error.message);
        const match = /(\d{12})/.exec(String(data?.[0]?.body_ar ?? ''));
        if (!match) throw new Error(`No delivery code notification for order ${orderId}`);
        return match[1];
    };
    const deliver = (orderId: string, code?: string) =>
        rpc(customer, 'update_driver_order_status', code === undefined
            ? { p_order_id: orderId, p_status: 'delivered' }
            : { p_order_id: orderId, p_status: 'delivered', p_delivery_code: code });
    const statusOf = async (orderId: string) => {
        const { data } = await rpc(customer, 'get_my_deliveries', { p_order_id: orderId });
        return (data as unknown as DeliveryRow[])[0]?.status;
    };

    beforeAll(async () => {
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        customer = await signedInClient(creds.customer.email, creds.customer.password);
        await cleanupTestOrders(admin);
        product = await provisionProduct(admin);
        zone = await pickZone(customer);
        const { data: flag, error: flagErr } = await loose(admin).from('app_settings').select('require_delivery_code').eq('id', true).single();
        if (flagErr) throw new Error(flagErr.message);
        originalFlag = Boolean(flag?.require_delivery_code);
        await setFlag(true);
        await admin.from('drivers').delete().like('name', `${TEST_TAG}%`);
        const { data: wh } = await admin.from('warehouses').select('id').eq('code', 'KRT').single();
        const { data, error } = await admin.from('drivers').insert({ name: `${TEST_TAG} Code Driver`, phone: '0955555555', status: 'active', warehouse_id: wh!.id }).select('id').single();
        if (error) throw error;
        driverId = data.id;
        const link = await rpc(admin, 'admin_link_driver_user', { p_driver_id: driverId, p_email: creds.customer.email });
        if (link.error) throw link.error;
    });

    afterAll(async () => {
        if (!admin) return;
        await setFlag(originalFlag);
        await cleanupTestOrders(admin);
        if (driverId) {
            await rpc(admin, 'admin_unlink_driver_user', { p_driver_id: driverId });
            await admin.from('drivers').delete().eq('id', driverId);
        }
        await product?.release();
    });

    it('delivery without a code or with a wrong code is refused and the order stays on the road', async () => {
        lockedOrderId = await shippedOrder();

        const none = await deliver(lockedOrderId);
        expect(none.error).toBeNull();
        expect(none.data).toBe('delivery_code_required');

        const wrong = await deliver(lockedOrderId, '000000000000');
        expect(wrong.error).toBeNull();
        expect(wrong.data).toBe('delivery_code_invalid');
        expect(await statusOf(lockedOrderId)).toBe('shipped');
    });

    it('five wrong attempts lock the code, and only a staff override can then deliver', async () => {
        const code = await issuedCode(lockedOrderId);
        const attempts: unknown[] = [];
        for (let i = 0; i < 4; i++) attempts.push((await deliver(lockedOrderId, '000000000000')).data);
        expect(attempts).toEqual(['delivery_code_invalid', 'delivery_code_invalid', 'delivery_code_invalid', 'delivery_code_locked']);

        expect((await deliver(lockedOrderId, code)).data).toBe('delivery_code_locked');

        const outOfScope = await rpc(customer, 'staff_override_delivery_code', { p_order_id: lockedOrderId, p_reason: `${TEST_TAG} not staff` });
        expect(outOfScope.error?.message).toMatch(/outside your warehouse scope/);

        const override = await rpc(admin, 'staff_override_delivery_code', { p_order_id: lockedOrderId, p_reason: `${TEST_TAG} confirmed by phone` });
        expect(override.error).toBeNull();

        const delivered = await deliver(lockedOrderId);
        expect(delivered.error).toBeNull();
        expect(delivered.data).toBe('delivered');
        expect(await statusOf(lockedOrderId)).toBe('delivered');

        const { data: history } = await admin.from('order_status_history').select('note').eq('order_id', lockedOrderId);
        expect((history ?? []).some((h) => String(h.note).includes(`${TEST_TAG} confirmed by phone`))).toBe(true);
    });

    it('the correct code delivers the order and the verification is recorded in its history', async () => {
        const orderId = await shippedOrder();
        const code = await issuedCode(orderId);

        expect((await deliver(orderId, '000000000000')).data).toBe('delivery_code_invalid');

        const delivered = await deliver(orderId, code);
        expect(delivered.error).toBeNull();
        expect(delivered.data).toBe('delivered');

        const { data: history } = await admin.from('order_status_history').select('status, note').eq('order_id', orderId).eq('status', 'delivered');
        expect((history ?? []).some((h) => String(h.note).includes('تم التحقق من رمز التسليم'))).toBe(true);
    });

    it('the customer cannot re-issue a code within a minute of the one issued at pickup', async () => {
        const orderId = await shippedOrder();
        const again = await rpc(customer, 'customer_issue_delivery_code', { p_order_id: orderId });
        expect(again.error?.message).toMatch(/wait a minute/);
    });

    it('a proof path outside the order folder, or without an uploaded photo, is refused and the order stays on the road', async () => {
        const orderId = await shippedOrder();

        const outside = await rpc(customer, 'update_driver_order_status', { p_order_id: orderId, p_status: 'delivered', p_proof_path: 'not-this-order/proof.jpg' });
        expect(outside.error?.message).toMatch(/order folder/);

        const missing = await rpc(customer, 'update_driver_order_status', { p_order_id: orderId, p_status: 'delivered', p_proof_path: `${orderId}/missing.jpg` });
        expect(missing.error?.message).toMatch(/not found/);

        expect(await statusOf(orderId)).toBe('shipped');
    });

    it('a delivery proof photo uploaded to the order folder is recorded on the delivered order', async () => {
        const orderId = await shippedOrder();
        const code = await issuedCode(orderId);
        const path = `${orderId}/${Date.now()}.jpg`;

        const upload = await customer.storage
            .from('delivery-proofs')
            .upload(path, new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), { contentType: 'image/jpeg' });
        expect(upload.error).toBeNull();

        const delivered = await rpc(customer, 'update_driver_order_status', { p_order_id: orderId, p_status: 'delivered', p_delivery_code: code, p_proof_path: path });
        expect(delivered.error).toBeNull();
        expect(delivered.data).toBe('delivered');

        const { data, error } = await loose(admin).from('orders').select('delivery_proof_path').eq('id', orderId).single();
        expect(error).toBeNull();
        expect(data?.delivery_proof_path).toBe(path);
    });
});

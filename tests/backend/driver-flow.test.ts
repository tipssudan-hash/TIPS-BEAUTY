import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TEST_TAG, checkoutArgs, cleanupTestOrders, creds, haveCreds, pickZone, provisionProduct, rpc, signedInClient, type Client } from './helpers';

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
});

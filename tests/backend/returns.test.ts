import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_TAG, cleanupTestOrders, createTestOrder, creds, haveCreds, pickZone, provisionProduct, rpc, signedInClient, type Client } from './helpers';

// T2-12 Returns: request_order_return's Return Window + store_credit rejection (both added by
// 20261001000400_t2_12_returns_gaps.sql — the original RPC only checked status='delivered' and
// allowed store_credit), review_order_return's restock-into-the-right-warehouse and refund
// side effects, and the in-app Customer Notification on approve/reject/refund.

const suite = haveCreds ? describe : describe.skip;

suite('returns over request_order_return / review_order_return (T2-12)', () => {
    let customer: Client;
    let admin: Client;
    let product: { id: string; warehouseId: string; release: () => Promise<void> };
    let zone: { name: string; state: string | null; fee: number };
    let driverId: string;

    // Mirrors driver-flow.test.ts: the test customer account doubles as the driver so one
    // signed-in client can carry an order from new all the way to delivered.
    const advanceToDelivered = async (orderId: string) => {
        const confirm = await rpc(admin, 'admin_update_order_operation', { p_order_id: orderId, p_expected_status: 'new', p_status: 'confirmed', p_driver_id: driverId });
        if (confirm.error) throw confirm.error;
        const ship = await rpc(customer, 'update_driver_order_status', { p_order_id: orderId, p_status: 'shipped' });
        if (ship.error) throw ship.error;
        const delivered = await rpc(customer, 'update_driver_order_status', { p_order_id: orderId, p_status: 'delivered', p_note: `${TEST_TAG} delivered` });
        if (delivered.error) throw delivered.error;
    };

    beforeAll(async () => {
        customer = await signedInClient(creds.customer.email, creds.customer.password);
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        await cleanupTestOrders(admin);
        product = await provisionProduct(admin);
        zone = await pickZone(customer);
        await admin.from('drivers').delete().like('name', `${TEST_TAG}%`);
        const { data, error } = await admin.from('drivers').insert({ name: `${TEST_TAG} Returns`, phone: '0944444444', status: 'active', warehouse_id: product.warehouseId }).select('id').single();
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

    it('rejects a return request made more than 7 days after delivery', async () => {
        const order = await createTestOrder(customer, zone, product.id);
        await advanceToDelivered(order.order_id);
        const backdate = await rpc(admin, 'admin_backdate_test_order_status', {
            p_order_id: order.order_id, p_status: 'delivered', p_created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        });
        expect(backdate.error).toBeNull();

        const req = await rpc(customer, 'request_order_return', {
            p_order_id: order.order_id, p_items: [{ id: product.id, quantity: 1 }], p_reason: 'defective item', p_requested_resolution: 'refund',
        });
        expect(req.error).toBeTruthy();
        expect(String(req.error?.message)).toMatch(/window/i);
    });

    it('accepts a return inside the window, rejects store_credit, and refuses a duplicate active item', async () => {
        const order = await createTestOrder(customer, zone, product.id);
        await advanceToDelivered(order.order_id);

        const storeCredit = await rpc(customer, 'request_order_return', {
            p_order_id: order.order_id, p_items: [{ id: product.id, quantity: 1 }], p_reason: 'defective item', p_requested_resolution: 'store_credit',
        });
        expect(storeCredit.error).toBeTruthy();

        const first = await rpc(customer, 'request_order_return', {
            p_order_id: order.order_id, p_items: [{ id: product.id, quantity: 1 }], p_reason: 'defective item', p_requested_resolution: 'refund',
        });
        expect(first.error).toBeNull();
        expect(first.data).toBeTruthy();

        const duplicate = await rpc(customer, 'request_order_return', {
            p_order_id: order.order_id, p_items: [{ id: product.id, quantity: 1 }], p_reason: 'changed my mind', p_requested_resolution: 'refund',
        });
        expect(duplicate.error).toBeTruthy();
        expect(String(duplicate.error?.message)).toMatch(/active return/i);
    });

    it('restocks into the order\'s own warehouse exactly once, marks the Order refunded, and notifies the customer on approve + refund', async () => {
        const order = await createTestOrder(customer, zone, product.id);
        await advanceToDelivered(order.order_id);
        const req = await rpc(customer, 'request_order_return', {
            p_order_id: order.order_id, p_items: [{ id: product.id, quantity: 1 }], p_reason: 'defective item', p_requested_resolution: 'refund',
        });
        if (req.error) throw req.error;
        const returnId = req.data as unknown as string;

        const { data: stockBefore } = await admin.from('warehouse_inventory').select('quantity').eq('warehouse_id', product.warehouseId).eq('product_id', product.id).single();

        const approve = await rpc(admin, 'review_order_return', { p_return_id: returnId, p_status: 'approved' });
        expect(approve.error).toBeNull();
        const received = await rpc(admin, 'review_order_return', { p_return_id: returnId, p_status: 'received', p_restock: true });
        expect(received.error).toBeNull();

        const { data: stockAfter } = await admin.from('warehouse_inventory').select('quantity').eq('warehouse_id', product.warehouseId).eq('product_id', product.id).single();
        expect(stockAfter!.quantity).toBe((stockBefore?.quantity ?? 0) + 1);

        // restocked_at guards against double-counting on a second "received" call.
        const receivedAgain = await rpc(admin, 'review_order_return', { p_return_id: returnId, p_status: 'received', p_restock: true });
        expect(receivedAgain.error).toBeNull();
        const { data: stockStill } = await admin.from('warehouse_inventory').select('quantity').eq('warehouse_id', product.warehouseId).eq('product_id', product.id).single();
        expect(stockStill!.quantity).toBe(stockAfter!.quantity);

        const refund = await rpc(admin, 'review_order_return', { p_return_id: returnId, p_status: 'refunded' });
        expect(refund.error).toBeNull();
        const { data: orderRow } = await admin.from('orders').select('payment_status,financial_status').eq('id', order.order_id).single();
        expect(orderRow!.payment_status).toBe('refunded');
        expect(orderRow!.financial_status).toBe('refunded');

        const { data: notifications } = await admin.from('customer_notifications').select('type').eq('order_id', order.order_id).in('type', ['return_approved', 'return_refunded']);
        expect((notifications ?? []).map((n) => n.type).sort()).toEqual(['return_approved', 'return_refunded']);
    });

    it('notifies the customer with the admin note on rejection', async () => {
        const order = await createTestOrder(customer, zone, product.id);
        await advanceToDelivered(order.order_id);
        const req = await rpc(customer, 'request_order_return', {
            p_order_id: order.order_id, p_items: [{ id: product.id, quantity: 1 }], p_reason: 'defective item', p_requested_resolution: 'refund',
        });
        if (req.error) throw req.error;
        const returnId = req.data as unknown as string;

        const reject = await rpc(admin, 'review_order_return', { p_return_id: returnId, p_status: 'rejected', p_admin_note: `${TEST_TAG} no fault found` });
        expect(reject.error).toBeNull();

        const { data: notifications } = await admin.from('customer_notifications').select('type,body_ar').eq('order_id', order.order_id).eq('type', 'return_rejected');
        expect(notifications).toHaveLength(1);
        expect(notifications![0].body_ar).toContain(`${TEST_TAG} no fault found`);
    });
});

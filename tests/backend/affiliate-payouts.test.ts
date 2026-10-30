import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TEST_TAG, cleanupTestOrders, createTestOrder, creds, haveCreds, loose, pickZone, provisionProduct, rpc, signedInClient, type Client } from './helpers';

// Affiliate commission lifecycle: a delivered affiliate order opens a pending commission that is held for
// app_settings.affiliate_hold_days, is approved by admin_release_eligible_commissions, is paid out FIFO through
// admin_record_affiliate_payout, and is reduced or reversed when the order is refunded.

const suite = haveCreds ? describe : describe.skip;
const DAY_MS = 24 * 60 * 60 * 1000;
const round2 = (value: number) => Math.round(value * 100) / 100;

suite('affiliate commission lifecycle and payouts', () => {
    let admin: Client;
    let customer: Client;
    let product: { id: string; warehouseId: string; release: () => Promise<void> };
    let zone: { name: string; state: string | null; fee: number };
    let driverId: string;
    let affiliateId: string;
    let couponCode: string;
    let paidCommissionId = '';

    const saveAffiliate = async (minimumPayout: number) => {
        const { error } = await rpc(admin, 'admin_save_affiliate', {
            p_id: affiliateId,
            p_display_name: `${TEST_TAG} Payout Marketer`,
            p_phone: '0912345678',
            p_email: 'payouts-test@example.com',
            p_commission_rate: 10,
            p_minimum_payout: minimumPayout,
            p_payout_method: 'cash',
            p_payout_details: 'test',
            p_admin_note: 'Automated payout test marketer',
            p_status: 'active',
        });
        if (error) throw new Error(error.message);
    };
    const commissionFor = async (orderId: string) => {
        const { data, error } = await loose(admin).from('affiliate_commissions').select('*').eq('order_id', orderId).single();
        if (error) throw new Error(error.message);
        return data!;
    };
    const backdateEligibility = async (orderId: string, daysAgo: number) => {
        const { error } = await loose(admin).from('affiliate_commissions')
            .update({ eligible_at: new Date(Date.now() - daysAgo * DAY_MS).toISOString() })
            .eq('order_id', orderId);
        if (error) throw new Error(error.message);
    };
    const holdDays = async () => {
        const { data, error } = await loose(admin).from('app_settings').select('affiliate_hold_days').eq('id', true).single();
        if (error) throw new Error(error.message);
        return Number(data!.affiliate_hold_days);
    };
    const deliverAffiliateOrder = async (quantity: number) => {
        const created = await createTestOrder(customer, zone, product.id, {
            p_coupon_code: couponCode,
            p_items: [{ id: product.id, quantity }],
        });
        const orderId = created.order_id;
        const confirm = await rpc(admin, 'admin_update_order_operation', { p_order_id: orderId, p_expected_status: 'new', p_status: 'confirmed', p_driver_id: driverId });
        if (confirm.error) throw confirm.error;
        const ship = await rpc(customer, 'update_driver_order_status', { p_order_id: orderId, p_status: 'shipped' });
        if (ship.error) throw ship.error;
        const delivered = await rpc(customer, 'update_driver_order_status', { p_order_id: orderId, p_status: 'delivered', p_note: `${TEST_TAG} delivered` });
        if (delivered.error) throw delivered.error;
        return orderId;
    };

    beforeAll(async () => {
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        customer = await signedInClient(creds.customer.email, creds.customer.password);
        await cleanupTestOrders(admin);
        product = await provisionProduct(admin);
        zone = await pickZone(customer);

        const { data: affiliateNew, error: affErr } = await rpc(admin, 'admin_save_affiliate', {
            p_display_name: `${TEST_TAG} Payout Marketer`,
            p_phone: '0912345678',
            p_email: 'payouts-test@example.com',
            p_commission_rate: 10,
            p_minimum_payout: 0,
            p_payout_method: 'cash',
            p_payout_details: 'test',
            p_admin_note: 'Automated payout test marketer',
            p_status: 'active',
        });
        if (affErr) throw affErr;
        affiliateId = affiliateNew as unknown as string;

        couponCode = `PAY${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
        const { error: couponErr } = await rpc(admin, 'admin_save_coupon', {
            p_code: couponCode,
            p_name: `${TEST_TAG} payout coupon`,
            p_discount_type: 'percentage',
            p_discount_value: 5,
            p_per_user_limit: 50,
            p_starts_at: new Date(Date.now() - 60_000).toISOString(),
            p_is_active: true,
            p_affiliate_id: affiliateId,
        });
        if (couponErr) throw couponErr;

        await admin.from('drivers').delete().like('name', `${TEST_TAG}%`);
        const { data: driver, error: driverErr } = await admin.from('drivers').insert({
            name: `${TEST_TAG} Payout Driver`, phone: '0966666666', status: 'active', warehouse_id: product.warehouseId,
        }).select('id').single();
        if (driverErr) throw driverErr;
        driverId = driver.id;
        const link = await rpc(admin, 'admin_link_driver_user', { p_driver_id: driverId, p_email: creds.customer.email });
        if (link.error) throw link.error;
    });

    afterAll(async () => {
        if (!admin) return;
        await saveAffiliate(0);
        await cleanupTestOrders(admin);
        if (driverId) {
            await rpc(admin, 'admin_unlink_driver_user', { p_driver_id: driverId });
            await admin.from('drivers').delete().eq('id', driverId);
        }
        await product?.release();
    });

    it('a delivered affiliate order opens a pending commission held for the configured period', async () => {
        const orderId = await deliverAffiliateOrder(1);
        const commission = await commissionFor(orderId);
        expect(commission.status).toBe('pending');
        expect(Number(commission.commission_amount)).toBeGreaterThan(0);
        expect(Number(commission.paid_amount)).toBe(0);

        const eligibleAt = Date.parse(String(commission.eligible_at));
        const expected = Date.now() + (await holdDays()) * DAY_MS;
        expect(Math.abs(eligibleAt - expected)).toBeLessThan(5 * 60 * 1000);
    });

    it('release leaves a commission on hold untouched', async () => {
        const released = await rpc(admin, 'admin_release_eligible_commissions', { p_affiliate_id: affiliateId });
        expect(released.error).toBeNull();
        expect(released.data).toBe(0);
    });

    it('a partial payout is allocated first-in first-out and leaves later commissions approved', async () => {
        const first = await deliverAffiliateOrder(1);
        const second = await deliverAffiliateOrder(1);
        const third = await deliverAffiliateOrder(1);
        await backdateEligibility(first, 3);
        await backdateEligibility(second, 2);
        await backdateEligibility(third, 1);

        const released = await rpc(admin, 'admin_release_eligible_commissions', { p_affiliate_id: affiliateId });
        expect(released.error).toBeNull();
        expect(Number(released.data)).toBeGreaterThanOrEqual(3);

        const cFirst = Number((await commissionFor(first)).commission_amount);
        const cSecond = Number((await commissionFor(second)).commission_amount);
        const amount = round2(cFirst + cSecond / 2);

        const payout = await rpc(admin, 'admin_record_affiliate_payout', {
            p_affiliate_id: affiliateId,
            p_amount: amount,
            p_payout_method: 'cash',
            p_reference_number: `${TEST_TAG}-${Date.now()}`,
        });
        expect(payout.error).toBeNull();

        const paidFirst = await commissionFor(first);
        expect(paidFirst.status).toBe('paid');
        expect(Number(paidFirst.paid_amount)).toBe(cFirst);
        paidCommissionId = String(paidFirst.id);

        const paidSecond = await commissionFor(second);
        expect(paidSecond.status).toBe('approved');
        expect(Number(paidSecond.paid_amount)).toBeCloseTo(round2(amount - cFirst), 2);

        const laterThird = await commissionFor(third);
        expect(laterThird.status).toBe('approved');
        expect(Number(laterThird.paid_amount)).toBe(0);

        const { data: allocations, error: allocErr } = await loose(admin).from('affiliate_payout_allocations')
            .select('commission_id, amount').eq('payout_id', String(payout.data));
        expect(allocErr).toBeNull();
        expect(allocations).toHaveLength(2);
        expect(allocations!.map((a) => String(a.commission_id)).sort()).toEqual([String(paidFirst.id), String(paidSecond.id)].sort());
        expect(round2(allocations!.reduce((sum, a) => sum + Number(a.amount), 0))).toBe(amount);
    });

    it('a payout above the available balance is refused', async () => {
        const over = await rpc(admin, 'admin_record_affiliate_payout', {
            p_affiliate_id: affiliateId,
            p_amount: 1_000_000_000,
            p_payout_method: 'cash',
        });
        expect(over.error?.message).toMatch(/exceeds the available/);
    });

    it('a payout below the minimum is refused unless it clears the whole available balance', async () => {
        await saveAffiliate(1_000_000_000);
        try {
            const small = await rpc(admin, 'admin_record_affiliate_payout', { p_affiliate_id: affiliateId, p_amount: 1, p_payout_method: 'cash' });
            expect(small.error?.message).toMatch(/below the minimum/);
        } finally {
            await saveAffiliate(0);
        }
    });

    it('review cannot mark a commission paid, and approves a pending commission by hand with a note', async () => {
        const orderId = await deliverAffiliateOrder(1);
        const commission = await commissionFor(orderId);
        expect(commission.status).toBe('pending');

        const manualPaid = await rpc(admin, 'review_affiliate_commission', { p_commission_id: commission.id, p_status: 'paid' });
        expect(manualPaid.error?.message).toMatch(/Unsupported commission status/);

        const approved = await rpc(admin, 'review_affiliate_commission', { p_commission_id: commission.id, p_status: 'approved', p_note: `${TEST_TAG} approved by hand` });
        expect(approved.error).toBeNull();
        const afterApproval = await commissionFor(orderId);
        expect(afterApproval.status).toBe('approved');
        expect(afterApproval.review_note).toBe(`${TEST_TAG} approved by hand`);
    });

    it('a commission that already received a payout cannot be reversed', async () => {
        const reversed = await rpc(admin, 'review_affiliate_commission', { p_commission_id: paidCommissionId, p_status: 'reversed' });
        expect(reversed.error?.message).toMatch(/not allowed|cannot be reversed/);
    });

    it('refunding the order reduces its unpaid commission to zero and reverses it', async () => {
        const orderId = await deliverAffiliateOrder(1);
        const before = await commissionFor(orderId);
        expect(Number(before.commission_amount)).toBeGreaterThan(0);

        const req = await rpc(customer, 'request_order_return', {
            p_order_id: orderId, p_items: [{ id: product.id, quantity: 1 }], p_reason: 'defective item', p_requested_resolution: 'refund',
        });
        if (req.error) throw req.error;
        const returnId = req.data as unknown as string;
        for (const status of ['approved', 'received']) {
            const step = await rpc(admin, 'review_order_return', { p_return_id: returnId, p_status: status });
            if (step.error) throw step.error;
        }
        const refund = await rpc(admin, 'review_order_return', { p_return_id: returnId, p_status: 'refunded' });
        expect(refund.error).toBeNull();

        const after = await commissionFor(orderId);
        expect(after.status).toBe('reversed');
        expect(Number(after.commission_amount)).toBe(0);
    });
});

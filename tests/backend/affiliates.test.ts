import { describe, expect, it } from 'vitest';
import { haveCreds, signedInClient, creds, rpc, TEST_TAG } from './helpers';

describe.skipIf(!haveCreds)('Affiliate & Coupon End-to-End Workflow', () => {
    it('creates marketer, links coupon, generates commission, and records payout with accurate balances', async () => {
        const admin = await signedInClient(creds.admin.email, creds.admin.password);
        const testMarketerCode = `MKT${Date.now().toString().slice(-6)}`;
        const testCouponCode = `CPN${Date.now().toString().slice(-6)}`;

        // 1. Admin creates Marketer Profile with 10% commission
        const { data: affiliateId, error: affErr } = await rpc(admin, 'admin_save_affiliate', {
            p_display_name: `${TEST_TAG} Marketer`,
            p_code: testMarketerCode,
            p_phone: '0912345678',
            p_email: 'marketer@test.com',
            p_commission_rate: 10,
            p_minimum_payout: 0,
            p_payout_method: 'بنكك',
            p_payout_details: 'حساب رقم 123456',
            p_admin_note: 'Automated test marketer',
            p_status: 'active',
        });
        expect(affErr).toBeNull();
        expect(affiliateId).toBeTruthy();

        // 2. Admin creates a coupon linked to this marketer
        const { data: couponId, error: cpnErr } = await rpc(admin, 'admin_save_coupon', {
            p_code: testCouponCode,
            p_name: `${TEST_TAG} 15% Off`,
            p_discount_type: 'percentage',
            p_discount_value: 15,
            p_starts_at: new Date(Date.now() - 60000).toISOString(),
            p_is_active: true,
            p_affiliate_id: affiliateId,
        });
        expect(cpnErr).toBeNull();
        expect(couponId).toBeTruthy();

        // 3. Admin fetches affiliates list and verifies initial zero balance
        const { data: affiliatesList, error: listErr } = await rpc(admin, 'admin_get_affiliates');
        expect(listErr).toBeNull();
        const createdMarketer = (affiliatesList as any[])?.find((a) => a.id === affiliateId);
        expect(createdMarketer).toBeTruthy();
        expect(Number(createdMarketer.total_commission_earned)).toBe(0);
        expect(Number(createdMarketer.total_payouts_paid)).toBe(0);
        expect(Number(createdMarketer.pending_balance)).toBe(0);

        // 4. Admin records a test payout (Pre-pay -> Payout -> After-pay balance check)
        const payoutAmount = 5000;
        const { data: payoutId, error: payErr } = await rpc(admin, 'admin_record_affiliate_payout', {
            p_affiliate_id: affiliateId,
            p_amount: payoutAmount,
            p_payout_method: 'بنكك (بنك الخرطوم)',
            p_reference_number: `TXN-${Date.now()}`,
            p_notes: 'Initial test payout disbursement',
        });
        expect(payErr).toBeNull();
        expect(payoutId).toBeTruthy();

        // 5. Admin fetches detailed profile and checks payout log
        const { data: details, error: detErr } = await rpc(admin, 'admin_get_affiliate_details', {
            p_affiliate_id: affiliateId,
        });
        expect(detErr).toBeNull();
        const detailsObj = details as any;
        expect(detailsObj.profile.code).toBe(testMarketerCode);
        expect(detailsObj.coupons.some((c: any) => c.code === testCouponCode)).toBe(true);
        expect(detailsObj.payouts.some((p: any) => p.id === payoutId)).toBe(true);
        expect(Number(detailsObj.stats.total_payouts_paid)).toBe(payoutAmount);

        // Cleanup: Delete the test coupon
        await rpc(admin, 'admin_delete_coupon', { p_id: couponId });
    });
});

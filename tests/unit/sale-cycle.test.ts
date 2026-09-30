import { describe, expect, it } from 'vitest';

describe('Complete Sale, Profit & Marketer Commission Cycle', () => {
    it('executes full sale cycle: coupon discount, payment, profit calculation, pre-pay & after-pay balance', () => {
        // 1. Marketer Setup
        const marketer = {
            id: 'aff-001',
            displayName: 'Sara Fashion',
            code: 'SARA15',
            commissionRate: 8, // 8% commission
            payoutMethod: 'بنكك',
        };

        // 2. Coupon Setup
        const coupon = {
            code: 'SARA15',
            discountType: 'percentage' as const,
            discountValue: 15, // 15% discount for customer
            affiliateId: marketer.id,
        };

        // 3. Customer Cart
        const cartItems = [
            { name: 'Serum', qty: 2, retailPrice: 20000, costPrice: 12000 },
            { name: 'Cream', qty: 1, retailPrice: 15000, costPrice: 8000 },
        ];

        const baseSubtotal = cartItems.reduce((acc, i) => acc + i.qty * i.retailPrice, 0); // 55,000 SDG
        const totalProductCost = cartItems.reduce((acc, i) => acc + i.qty * i.costPrice, 0); // 32,000 SDG
        const discountAmount = Math.round((baseSubtotal * coupon.discountValue) / 100); // 8,250 SDG
        const netSubtotal = baseSubtotal - discountAmount; // 46,750 SDG
        const shippingFee = 1500;
        const customerTotalPaid = netSubtotal + shippingFee; // 48,250 SDG

        expect(baseSubtotal).toBe(55000);
        expect(discountAmount).toBe(8250);
        expect(netSubtotal).toBe(46750);
        expect(customerTotalPaid).toBe(48250);

        // 4. Order Lifecycle
        const order = {
            id: 'ord-001',
            status: 'delivered' as const,
            total: customerTotalPaid,
            shippingFee,
            discountAmount,
            netSubtotal,
            affiliateId: marketer.id,
            totalProductCost,
        };

        // 5. Profit & Commission Accounting
        const eligibleSalesVolume = order.netSubtotal; // 46,750 SDG
        const marketerCommissionEarned = (eligibleSalesVolume * marketer.commissionRate) / 100; // 3,740 SDG
        const grossMargin = eligibleSalesVolume - order.totalProductCost; // 46,750 - 32,000 = 14,750 SDG
        const companyNetProfit = grossMargin - marketerCommissionEarned; // 14,750 - 3,740 = 11,010 SDG

        expect(marketerCommissionEarned).toBe(3740);
        expect(grossMargin).toBe(14750);
        expect(companyNetProfit).toBe(11010);

        // 6. Pre-Pay Dual Balance Audit
        let totalPaidPayouts = 0;
        const marketerPrePayBalance = marketerCommissionEarned - totalPaidPayouts;
        const storeCashInBankPrePayout = eligibleSalesVolume - order.totalProductCost; // 14,750 SDG
        const storeNetProfitExpected = storeCashInBankPrePayout - marketerCommissionEarned; // 11,010 SDG

        expect(marketerPrePayBalance).toBe(3740);
        expect(storeCashInBankPrePayout).toBe(14750);
        expect(storeNetProfitExpected).toBe(11010);

        // 7. Payout Disbursement
        const payout = {
            id: 'pay-001',
            affiliateId: marketer.id,
            amount: 3740,
            payoutMethod: 'بنكك',
            referenceNumber: 'BOK-REF-9921',
        };
        totalPaidPayouts += payout.amount;
        const storeCashInBankAfterPayout = storeCashInBankPrePayout - payout.amount;

        // 8. After-Pay Dual Balance Reconciliation
        const marketerAfterPayBalance = marketerCommissionEarned - totalPaidPayouts;
        expect(totalPaidPayouts).toBe(3740);
        expect(marketerAfterPayBalance).toBe(0); // Marketer settled
        expect(storeCashInBankAfterPayout).toBe(11010); // Store retained net cash profit
    });
});

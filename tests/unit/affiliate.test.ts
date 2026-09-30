import { describe, expect, it } from 'vitest';

export interface MarketerProfile {
    id: string;
    display_name: string;
    code: string;
    commission_rate: number; // e.g. 5 means 5%
    status: 'active' | 'pending' | 'suspended';
}

export interface MockOrder {
    id: string;
    total: number;
    shipping_fee: number;
    discount_amount: number;
    coupon_code: string | null;
    affiliate_id: string | null;
    status: 'new' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
}

export interface MockPayout {
    id: string;
    affiliate_id: string;
    amount: number;
    payout_method: string;
    created_at: string;
}

// Business logic functions matching the SQL implementation
export function calculateEligibleSalesAmount(order: MockOrder): number {
    return Math.max(order.total - (order.shipping_fee || 0), 0);
}

export function calculateOrderCommission(order: MockOrder, commissionRate: number): number {
    if (order.status !== 'delivered') return 0;
    const base = calculateEligibleSalesAmount(order);
    return Math.round((base * commissionRate) / 100 * 100) / 100;
}

export function calculateAffiliateFinancials(
    affiliate: MarketerProfile,
    orders: MockOrder[],
    payouts: MockPayout[]
) {
    const affiliateOrders = orders.filter(
        (o) => o.affiliate_id === affiliate.id && o.status === 'delivered'
    );

    const totalOrdersCount = affiliateOrders.length;
    const totalSalesVolume = affiliateOrders.reduce(
        (sum, o) => sum + calculateEligibleSalesAmount(o),
        0
    );
    const totalDiscountGivenToCustomers = affiliateOrders.reduce(
        (sum, o) => sum + (o.discount_amount || 0),
        0
    );

    const totalCommissionEarned = affiliateOrders.reduce(
        (sum, o) => sum + calculateOrderCommission(o, affiliate.commission_rate),
        0
    );

    const totalPaidPayouts = payouts
        .filter((p) => p.affiliate_id === affiliate.id)
        .reduce((sum, p) => sum + p.amount, 0);

    const pendingBalance = Math.max(totalCommissionEarned - totalPaidPayouts, 0);

    return {
        totalOrdersCount,
        totalSalesVolume,
        totalDiscountGivenToCustomers,
        totalCommissionEarned,
        totalPaidPayouts,
        pendingBalance,
    };
}

describe('Marketer & Affiliate Commission and Payout Balance Workflow', () => {
    const marketer: MarketerProfile = {
        id: 'affiliate-123',
        display_name: 'Sara Fashion',
        code: 'SARA10',
        commission_rate: 10, // 10% commission
        status: 'active',
    };

    it('calculates eligible sales volume excluding shipping fee', () => {
        const order: MockOrder = {
            id: 'ord-1',
            total: 25000,
            shipping_fee: 1500,
            discount_amount: 2500,
            coupon_code: 'SARA10',
            affiliate_id: 'affiliate-123',
            status: 'delivered',
        };

        const sales = calculateEligibleSalesAmount(order);
        expect(sales).toBe(23500);
    });

    it('does not award commission if order is not delivered yet', () => {
        const pendingOrder: MockOrder = {
            id: 'ord-pending',
            total: 20000,
            shipping_fee: 1500,
            discount_amount: 2000,
            coupon_code: 'SARA10',
            affiliate_id: 'affiliate-123',
            status: 'shipped', // not yet delivered
        };

        const commission = calculateOrderCommission(pendingOrder, marketer.commission_rate);
        expect(commission).toBe(0);
    });

    it('calculates exact commission earned upon delivery', () => {
        const deliveredOrder: MockOrder = {
            id: 'ord-delivered',
            total: 51500,
            shipping_fee: 1500,
            discount_amount: 5000,
            coupon_code: 'SARA10',
            affiliate_id: 'affiliate-123',
            status: 'delivered',
        };

        // Base = 51500 - 1500 = 50,000 SDG
        // 10% commission = 5,000 SDG
        const commission = calculateOrderCommission(deliveredOrder, marketer.commission_rate);
        expect(commission).toBe(5000);
    });

    it('tracks full workflow: Pre-Pay Balance -> Payout Execution -> After-Pay Balance', () => {
        const orders: MockOrder[] = [
            {
                id: 'ord-101',
                total: 31500, // base 30,000 -> 10% = 3,000 SDG
                shipping_fee: 1500,
                discount_amount: 3000,
                coupon_code: 'SARA10',
                affiliate_id: 'affiliate-123',
                status: 'delivered',
            },
            {
                id: 'ord-102',
                total: 71500, // base 70,000 -> 10% = 7,000 SDG
                shipping_fee: 1500,
                discount_amount: 7000,
                coupon_code: 'SARA10',
                affiliate_id: 'affiliate-123',
                status: 'delivered',
            },
            {
                id: 'ord-103', // in-transit order: should not count yet
                total: 41500,
                shipping_fee: 1500,
                discount_amount: 4000,
                coupon_code: 'SARA10',
                affiliate_id: 'affiliate-123',
                status: 'shipped',
            },
        ];

        const payouts: MockPayout[] = [];

        // STEP 1: Check Pre-Pay Balance (before any payouts)
        const prePayStats = calculateAffiliateFinancials(marketer, orders, payouts);
        expect(prePayStats.totalOrdersCount).toBe(2);
        expect(prePayStats.totalSalesVolume).toBe(100000); // 30,000 + 70,000
        expect(prePayStats.totalDiscountGivenToCustomers).toBe(10000); // 3,000 + 7,000
        expect(prePayStats.totalCommissionEarned).toBe(10000); // 3,000 + 7,000
        expect(prePayStats.totalPaidPayouts).toBe(0);
        expect(prePayStats.pendingBalance).toBe(10000); // Pre-pay balance is 10,000 SDG

        // STEP 2: Record Partial Payout (e.g. 6,000 SDG transferred via Bank of Khartoum)
        payouts.push({
            id: 'pay-1',
            affiliate_id: 'affiliate-123',
            amount: 6000,
            payout_method: 'بنكك (بنك الخرطوم)',
            created_at: new Date().toISOString(),
        });

        // STEP 3: Check After-Pay Balance (after first payout)
        const afterPay1Stats = calculateAffiliateFinancials(marketer, orders, payouts);
        expect(afterPay1Stats.totalCommissionEarned).toBe(10000);
        expect(afterPay1Stats.totalPaidPayouts).toBe(6000);
        expect(afterPay1Stats.pendingBalance).toBe(4000); // Remaining balance is 4,000 SDG

        // STEP 4: Settle Remaining Balance (4,000 SDG payout)
        payouts.push({
            id: 'pay-2',
            affiliate_id: 'affiliate-123',
            amount: 4000,
            payout_method: 'بنكك (بنك الخرطوم)',
            created_at: new Date().toISOString(),
        });

        // STEP 5: Check Final Balance
        const finalStats = calculateAffiliateFinancials(marketer, orders, payouts);
        expect(finalStats.totalPaidPayouts).toBe(10000);
        expect(finalStats.pendingBalance).toBe(0); // Fully settled
    });
});

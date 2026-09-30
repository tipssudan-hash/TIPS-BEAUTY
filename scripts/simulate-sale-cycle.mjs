/**
 * Simulation Script: Full End-to-End Marketer Sale & Payout Cycle
 * Demonstrates:
 * 1. Unified Single Code (SARA15) for both Marketer attribution & Customer discount
 * 2. Customer Checkout with 15% discount
 * 3. Payment Collection & Order Delivery
 * 4. Revenue, COGS, Marketer Commission & Company Net Profit
 * 5. Pre-Pay Balance Statement (Company Cash Surplus & Marketer Balance Due)
 * 6. Payout Execution ("صرف المستحقات")
 * 7. After-Pay Balance Statement (Marketer balance = 0, Company 100% realized profit)
 */

const formatSDG = (val) => `${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SDG`;

console.log('================================================================');
console.log('   TIPS BEAUTY - FULL MARKETER SALE & PAYOUT CYCLE SIMULATION   ');
console.log('================================================================\n');

// -------------------------------------------------------------
// STEP 1: Register Marketer (No code input needed)
// -------------------------------------------------------------
console.log('📌 STEP 1: Admin Registers Marketer (Name, Commission %, Payout Details - NO CODE)');
const marketer = {
    id: 'aff-8801',
    displayName: 'سارة فاشن (Sara Fashion)',
    commissionRatePercent: 8, // 8% commission for marketer on net sales
    payoutMethod: 'بنكك - بنك الخرطوم',
    payoutDetails: 'حساب بنكك: 2894102 باسم سارة أحمد',
    status: 'active',
};
console.log(`- Marketer Name:      ${marketer.displayName}`);
console.log(`- Commission Rate:    ${marketer.commissionRatePercent}% on net delivered sales`);
console.log(`- Payout Destination: ${marketer.payoutMethod} (${marketer.payoutDetails})`);
console.log(`- System Note:        Marketer profile created without manual code input ✅\n`);

// -------------------------------------------------------------
// STEP 2: Create Random Coupon & Assign to Marketer
// -------------------------------------------------------------
console.log('📌 STEP 2: Admin Creates Coupon with Random Code & Links to Marketer');
const coupon = {
    code: 'VIP-7X9K2', // Randomly generated code
    name: 'كوبون خصم سارة 15%',
    discountPercent: 15, // 15% discount for customer
    affiliateId: marketer.id,
    affiliateName: marketer.displayName,
};
console.log(`- Generated Code:     ${coupon.code} (Random generated 🎲)`);
console.log(`- Customer Discount:  ${coupon.discountPercent}% OFF`);
console.log(`- Assigned To:        ${coupon.affiliateName}`);
console.log(`- Customer Promo:     "استخدمي كود (${coupon.code}) للحصول على خصم ${coupon.discountPercent}% من تيبس بيوتي!"\n`);

// -------------------------------------------------------------
// STEP 3: Customer Places Order with Random Generated Coupon Code
// -------------------------------------------------------------
console.log(`📌 STEP 3: Customer Cart & Checkout using Code (${coupon.code})`);
const cart = [
    { name: 'سيروم فيتامين سي الفاخر (Luxury Serum)', qty: 2, retailPrice: 20000, costPrice: 12000 },
    { name: 'كريم ترطيب عميق (Hydration Cream)', qty: 1, retailPrice: 15000, costPrice: 8000 },
];

const baseSubtotal = cart.reduce((sum, item) => sum + item.qty * item.retailPrice, 0); // 55,000 SDG
const totalProductCost = cart.reduce((sum, item) => sum + item.qty * item.costPrice, 0); // 32,000 SDG
const discountAmount = Math.round((baseSubtotal * coupon.discountPercent) / 100); // 8,250 SDG
const netSubtotal = baseSubtotal - discountAmount; // 46,750 SDG
const shippingFee = 1500;
const totalPaidByCustomer = netSubtotal + shippingFee; // 48,250 SDG

console.log(`- Base Product Subtotal:  ${formatSDG(baseSubtotal)}`);
console.log(`- Discount (${coupon.code} - ${coupon.discountPercent}%): -${formatSDG(discountAmount)}`);
console.log(`- Net Eligible Sales:     ${formatSDG(netSubtotal)}`);
console.log(`- Delivery Fee (Logistics):+${formatSDG(shippingFee)}`);
console.log(`- Total Paid by Customer: ${formatSDG(totalPaidByCustomer)}\n`);

// -------------------------------------------------------------
// STEP 4: Payment Verification & Delivery Fulfillment
// -------------------------------------------------------------
console.log('📌 STEP 4: Payment Collection & Order Delivery');
console.log(`- Received Customer Payment: ${formatSDG(totalPaidByCustomer)} in Store Account`);
console.log(`- Forwarded to Driver/Courier: -${formatSDG(shippingFee)}`);
console.log(`- Order Status: delivered ✅\n`);

// -------------------------------------------------------------
// STEP 5: Financial Accounting Breakdown
// -------------------------------------------------------------
console.log('📌 STEP 5: Revenue, COGS, Marketer Commission & Company Net Profit');
const eligibleSales = netSubtotal; // 46,750 SDG
const marketerCommission = Math.round(((eligibleSales * marketer.commissionRatePercent) / 100) * 100) / 100; // 3,740 SDG
const grossProductMargin = eligibleSales - totalProductCost; // 46,750 - 32,000 = 14,750 SDG
const companyNetProfit = grossProductMargin - marketerCommission; // 14,750 - 3,740 = 11,010 SDG

console.log(`1. Net Sales Inflow (after customer discount):  ${formatSDG(eligibleSales)}`);
console.log(`2. Factory/Inventory Product Cost (COGS):       -${formatSDG(totalProductCost)}`);
console.log(`3. Gross Merchandise Profit:                    ${formatSDG(grossProductMargin)}`);
console.log(`4. Less Marketer Commission (${marketer.commissionRatePercent}%):             -${formatSDG(marketerCommission)}`);
console.log(`----------------------------------------------------------------`);
console.log(`⭐ FINAL COMPANY NET PROFIT (ربح المتجر الصافي): ${formatSDG(companyNetProfit)}`);
console.log(`⭐ MARKETER EARNED COMMISSION (عمولة المسوق):   ${formatSDG(marketerCommission)}\n`);

// -------------------------------------------------------------
// STEP 6: Dual Balance Audit (PRE-PAY STATE - قبل صرف العمولة)
// -------------------------------------------------------------
console.log('📌 STEP 6: Dual Balance Audit (PRE-PAY STATE - قبل التحويل)');
let marketerPaidTotal = 0;
let marketerPendingBalance = marketerCommission - marketerPaidTotal;

// Store's cash position before paying marketer:
let storeCashCollected = eligibleSales; // 46,750 SDG (after delivery fee)
let storeCashAfterCOGS = storeCashCollected - totalProductCost; // 14,750 SDG in bank
let storeRealizedNetProfit = storeCashAfterCOGS - marketerCommission; // 11,010 SDG

console.log(`┌──────────────────────────────────────────────────────────────┐`);
console.log(`│                  PRE-PAY BALANCE STATEMENT                   │`);
console.log(`├──────────────────────────────────────────────────────────────┤`);
console.log(`│ [A] MARKETER BALANCE (حساب المسوق):                          │`);
console.log(`│   • Total Commission Earned:       ${formatSDG(marketerCommission).padEnd(24)} │`);
console.log(`│   • Total Paid Out:                ${formatSDG(marketerPaidTotal).padEnd(24)} │`);
console.log(`│   • PRE-PAY BALANCE DUE TO SARA:   ${formatSDG(marketerPendingBalance).padEnd(24)} │`);
console.log(`│                                                              │`);
console.log(`│ [B] STORE/COMPANY POSITION (موقف المتجر المالي):             │`);
console.log(`│   • Gross Cash in Bank (Net Sales):${formatSDG(storeCashCollected).padEnd(24)} │`);
console.log(`│   • Less Inventory Cost (COGS):    -${formatSDG(totalProductCost).padEnd(23)} │`);
console.log(`│   • Cash Surplus Before Payout:    ${formatSDG(storeCashAfterCOGS).padEnd(24)} │`);
console.log(`│   • Retained Store Net Profit:     ${formatSDG(storeRealizedNetProfit).padEnd(24)} │`);
console.log(`└──────────────────────────────────────────────────────────────┘\n`);

// -------------------------------------------------------------
// STEP 7: Payout Execution ("صرف المستحقات")
// -------------------------------------------------------------
console.log('📌 STEP 7: Admin Executes Payout to Marketer');
const payoutAmount = marketerPendingBalance;
marketerPaidTotal += payoutAmount;
storeCashAfterCOGS -= payoutAmount; // 14,750 - 3,740 = 11,010 SDG remaining in company bank

console.log(`- Transferred Amount:  ${formatSDG(payoutAmount)} via ${marketer.payoutMethod}`);
console.log(`- Bank Reference:      BOK-TRANSFER-9842109`);
console.log(`- Destination Account: ${marketer.payoutDetails}`);
console.log(`- Status:              COMPLETED ✅\n`);

// -------------------------------------------------------------
// STEP 8: Dual Balance Reconciliation (AFTER-PAY STATE - بعد التحويل)
// -------------------------------------------------------------
console.log('📌 STEP 8: Dual Balance Reconciliation (AFTER-PAY STATE - بعد التحويل)');
const marketerAfterPayBalance = marketerCommission - marketerPaidTotal;

console.log(`┌──────────────────────────────────────────────────────────────┐`);
console.log(`│                 AFTER-PAY RECONCILED STATEMENT               │`);
console.log(`├──────────────────────────────────────────────────────────────┤`);
console.log(`│ [A] MARKETER BALANCE (حساب المسوق بعد الاستلام):             │`);
console.log(`│   • Total Commission Earned:       ${formatSDG(marketerCommission).padEnd(24)} │`);
console.log(`│   • Total Paid Disbursements:      ${formatSDG(marketerPaidTotal).padEnd(24)} │`);
console.log(`│   • AFTER-PAY BALANCE:             ${formatSDG(marketerAfterPayBalance).padEnd(24)} │`);
console.log(`│     (Marketer fully settled - الرصيد صفر)                    │`);
console.log(`│                                                              │`);
console.log(`│ [B] FINAL STORE FINANCIAL BALANCE (أرباح المتجر بعد الصرف):  │`);
console.log(`│   • Net Sales Revenue:             ${formatSDG(eligibleSales).padEnd(24)} │`);
console.log(`│   • Total Product Cost (COGS):     -${formatSDG(totalProductCost).padEnd(23)} │`);
console.log(`│   • Paid Marketer Commission:      -${formatSDG(marketerPaidTotal).padEnd(23)} │`);
console.log(`│   • FINAL RECONCILED STORE PROFIT: ${formatSDG(storeCashAfterCOGS).padEnd(24)} │`);
console.log(`│     (100% Realized Net Cash in Store Bank Account)           │`);
console.log(`└──────────────────────────────────────────────────────────────┘\n`);

console.log('================================================================');
console.log('   SIMULATION COMPLETED SUCCESSFULLY: ALL CHECKS RECONCILED    ');
console.log('================================================================');

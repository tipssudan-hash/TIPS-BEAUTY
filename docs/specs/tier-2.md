# Tier 2 — post-audit features and pre-launch hardening

Vocabulary: `CONTEXT.md`. Decisions: `docs/adr/0001-variant-stock-per-product.md`. Origin: `docs/IMPLEMENTATION-PLAN.md` §10 and `docs/AUDIT-REPORT.md` §7–8.

## Problem Statement

Tier 1 made the Storefront and Admin Portal safe to launch, but the store still cannot run the campaigns and after-sales flows a cosmetics shop needs. Customers cannot use a Coupon, see a Promotion, pick a Variant (a shade or size) when buying, be told in-app when their Order moves, or ask for a Return. Staff cannot curate Collections on the home page, run a Promotion that actually changes prices, or process a Return. A few Tier 1 review findings also remain: UI copy that drifts from the glossary, a single staff New-Order Alert row that fails for every recipient when one address is bad, and gaps in the automated tests around Coupon/points reversal and the Order Expiry sweep.

## Solution

Ship the pre-launch hardening first (copy, staff alert rows, tests, code hygiene, the accessibility polish already on disk), then the customer- and staff-facing features in a fixed order, each as its own ticket and PR against `main`: Collections → Coupons → Variant-aware checkout → Promotions → Customer Notifications → Returns → Playwright smoke. Every feature reuses the backend objects that already exist and adds only the RPCs that are missing, following the Tier 1 rule: prices, stock and eligibility are decided in the database, never in the apps.

## User Stories

### Pre-launch hardening
1. As a customer, I want the Storefront to use one Arabic word for each concept (المحلية, إثبات الدفع, الرقم المرجعي), so that checkout and Order pages never contradict each other.
2. As a staff member, I want the Admin Portal to call an Unseen Order "لم يُطّلع عليه" everywhere, so that the badge and the list mean the same thing.
3. As a developer, I want a test that fails when an avoided Arabic term reappears in either app, so that the glossary stops drifting silently.
4. As a staff member, I want each New-Order Alert recipient to get their own email attempt, so that one wrong address in the settings does not block the others.
5. As a staff member, I want a failed alert to one recipient to be retried without re-emailing the recipients that succeeded.
6. As a developer, I want a test proving that cancelling an Order that used a Coupon or redeemed points reverses both exactly once.
7. As a developer, I want a test proving that the Order Expiry sweep touches only `new` Orders older than the cut-off and leaves every other Order and its Stock alone.
8. As a developer, I want the duplicated date/money/error helpers across the API modules collapsed into one shared module per app, so that a fix lands once.
9. As a developer, I want the untyped RPC shims removed from the admin catalogue API once the generated types cover every RPC it calls.
10. As a customer using reduced-motion settings, I want decorative animation removed while loading indicators remain, so that the app respects my preference without hiding feedback.
11. As a customer using a screen reader, I want every login and signup field labelled, so that forms are navigable.

### Collections
12. As a customer, I want to see named rows of Products (a Collection) on the home page, so that I can browse a themed set without filtering.
13. As a customer, I want Collections to disappear while I am searching or filtering, so that the rows never contradict my filter.
14. As a customer, I want a Collection to show only sellable Products, so that I never click into something I cannot buy.
15. As a staff member, I want to create a Collection with an Arabic name, description, icon and display order.
16. As a staff member, I want to hand-pick and reorder the Products in a Collection.
17. As a staff member, I want to choose a rule instead of hand-picking (newest, best sellers, on Discount, under a price, in a Category) with a limit, so that the row maintains itself.
18. As a staff member, I want to hide a Collection without deleting it.
19. As a staff member, I want saving a hand-picked Collection's members to be all-or-nothing, so that a failed save never leaves a half-updated row.

### Coupons
20. As a customer, I want to type a Coupon code on the Checkout page and see the reduction before I place the Order.
21. As a customer, I want a clear Arabic reason when a Coupon is refused (expired, not started, used up, my limit reached, Order below the minimum, unknown code).
22. As a customer, I want the Order total, confirmation page and Order Confirmation email to show the Coupon reduction as its own line.
23. As a customer, I want the largest single Pricing Rule (Discount, Promotion or Coupon) applied, and never more than one on the same amount, so that the total is predictable.
24. As a customer, I want a Coupon's per-customer limit enforced across all my Orders, including ones placed in another tab at the same time.
25. As a staff member, I want to create a Coupon with code, name, description, percentage or fixed value, maximum reduction, minimum Order amount, total and per-customer limits, and a validity window.
26. As a staff member, I want to activate, deactivate and edit a Coupon and see how many times it was redeemed.
27. As a staff member, I want a cancelled Order to give back the Coupon use it consumed.
28. As a staff member, I want the Order detail in the Admin Portal to show which Coupon was used and the reduction.

### Variant-aware checkout
29. As a customer, I want to choose a Variant (shade/size) on the Product page before adding to Cart, when the Product has Variants.
30. As a customer, I want the Cart, Checkout, Order detail and emails to show which Variant I chose.
31. As a customer, I want the Variant's own price used when it has one, and the Product's price otherwise.
32. As a customer, I want the same Product in two different Variants to be two Cart lines.
33. As a staff member, I want the Order's items to record the chosen Variant's name and price at the time of ordering, so that later edits to the Variant do not rewrite history.
34. As a staff member, I want Stock to keep being counted per Product per warehouse (ADR 0001), so that Stock screens and reservation do not change.
35. As a staff member, I want to see the chosen Variant on the Order detail and the picking list.

### Promotions
36. As a staff member, I want to create a Promotion with a title, percentage or fixed reduction, a schedule, and a target: all Products, a Category, a Brand, or chosen Products.
37. As a staff member, I want to see a Promotion's state (scheduled, active, expired) derived from its schedule, not set by hand.
38. As a staff member, I want to end a Promotion early.
39. As a customer, I want Product cards and pages to show the effective price with the Promotion applied and the original price struck through.
40. As a customer, I want the price I saw to be the price I am charged: the backend computes the same effective price at checkout.
41. As a customer, I want a Product's Discount and a Promotion never to stack; the larger wins.
42. As a staff member, I want the Order detail to show which Pricing Rule reduced each line.
43. As a staff member, I want Promotions and Banners to remain separate: a Banner never changes a price.

### Customer Notifications
44. As a customer, I want a bell in the Storefront header with an unread count.
45. As a customer, I want a page listing my Customer Notifications, newest first, with the Order or Product each one is about linked.
46. As a customer, I want a Customer Notification when my Order Status changes, when I am invited to Review a delivered Product, and when a Product I subscribed to is back in Stock.
47. As a customer, I want to mark one or all Customer Notifications read.
48. As a customer, I want the unread count refreshed when I open the app or return to its tab, without a constant connection.

### Returns
49. As a customer, I want a "request a Return" action on a delivered Order for 7 days after delivery (the Return Window), and not after.
50. As a customer, I want to pick which items and quantities to return, a reason, and whether I want a refund or an exchange.
51. As a customer, I want to see the status of my Return on the Order page.
52. As a customer, I want to be refused when an active Return already covers an item.
53. As a staff member, I want a Returns page listing requested Returns with the Order, customer, items and reason.
54. As a staff member, I want to approve or reject a Return with a note, mark items received, restock them into the Order's warehouse, and mark the refund settled once paid in cash or by Mycashi.
55. As a staff member, I want an exchange to be handled by me outside the system, with the Return only tracking status.
56. As a staff member, I want a refunded Return to mark the Order's Payment Status as refunded.
57. As a customer, I want a Customer Notification when my Return is approved, rejected or refunded.

### Playwright smoke
58. As a developer, I want a browser smoke test covering login → add to Cart → COD checkout → Order appears in My Orders, and admin login → Order visible → confirm, runnable locally against the live project with the test accounts.

## Implementation Decisions

- **Process**: PR #1 merges to `main` first. Each ticket is a branch off `main` with its own PR. The design polish already on disk is committed as the first pre-launch ticket; the Collections work already on disk is committed on the Collections branch only after its migration is applied and the rule-type selector is added.
- **Backend first, RPC only**: apps never read or write pricing, stock, eligibility or membership tables directly. New SQL objects ship as numbered migrations in the existing migrations folder, are applied by the owner through the SQL editor (the CLI login-role issue is unresolved), and follow the Tier 1 lockdown: SECURITY DEFINER, pinned search_path, revoke from PUBLIC and anon, explicit grants, admin RPCs guarded by the admin check.
- **Glossary copy**: a single Arabic term per concept as recorded in the glossary; the copy test lives at the copy seam and lists the avoided terms verbatim.
- **Staff alert rows**: the notification trigger queues one email row per configured staff recipient (audience `staff`, one recipient each); the customer row is unchanged. The Edge Function sends one message per row. Attempts and failures stay per row.
- **Reversal test**: a Coupon-bearing Order and a points-redeeming Order are cancelled and the release routine asserted idempotent (usage count, redemption row, points balance).
- **Sweep-isolation test**: the sweep function is service-role only, so the test cannot call it. The ticket adds a tiny admin-only test helper RPC that backdates a tagged test Order's creation time; the sweep is then triggered by its schedule window being asserted through a follow-up read. If the helper is judged too much surface during implementation, the sweep test stays as the current negative test and the ticket says so.
- **Code hygiene**: one formatting module and one error-mapping module per app; the admin catalogue API drops its shims and the generated database types are refreshed after each migration.
- **Collections**: the existing public collections RPC is the only read path and already evaluates rules; the admin form gains a rule selector with rule config (limit, price ceiling, category) and hides the product picker for rule-based Collections. Membership writes go through the atomic set-members RPC. The read path additionally hides deactivated Products.
- **Pricing Rule resolution**: one SQL function computes a Product's effective unit price given its Discount and the active Promotions that match it; a Coupon is evaluated at Order level against the subtotal. Rule: the largest single reduction wins per line; a Coupon competes against the best line reduction; nothing stacks. The public product RPCs expose the effective price and the winning rule's label; checkout uses the same function so the displayed and charged prices cannot diverge.
- **Coupons**: checkout keeps its existing coupon-code parameter; a new coupon preview RPC returns the reduction or a typed refusal reason. Redemption is recorded in the existing redemption table inside the checkout transaction with a row lock on the Coupon so limits hold under concurrency. The existing release routine decrements usage and removes the redemption exactly once on cancel.
- **Variants**: Cart lines carry an optional Variant id; checkout accepts a Variant id per item, validates it belongs to the Product, snapshots the Variant's name and price into the item, and reserves Stock at Product level per ADR 0001. A Variant's own price overrides the Product price before Pricing Rules apply.
- **Promotions**: the existing table gains target columns (target kind + target value or product list); status becomes derived from the schedule; "end now" sets the end date. The admin Marketing page gets create/edit/end; the Storefront reads only the effective price from the public RPCs.
- **Customer Notifications**: existing table and creation RPC; the Storefront reads through a list-my-notifications RPC and marks read through a mark-read RPC (ids or all). Triggers already exist for review requests and restocks; an Order Status trigger is added, and the Returns review RPC creates one on approve/reject/refund.
- **Returns**: existing request/review RPCs; the request RPC additionally enforces the Return Window (7 days from the delivered entry in status history) and rejects store credit. Storefront: request form on a delivered Order and a status block; Admin Portal: Returns page over the existing review RPC with restock and refund-settled actions. Refunds are recorded, never executed.
- **Playwright**: one spec file, two flows, local-only (not CI until the launch checklist is done), using the test accounts from the gitignored env file.

## Testing Decisions

- A good test drives a public RPC or a page the way the app does and asserts observable state (RPC result, table row visible to that role, public price); it never asserts SQL internals.
- Seam 1 — backend contract tests in the existing Vitest suite, one file per feature (coupons, promotions, variants, collections, returns, notifications, emails), reusing the existing helpers (provisioned product, zone, tagged orders, cleanup). Prior art: the current order-lifecycle and payment-proof suites.
- Seam 2 — copy test scanning both apps' source for avoided Arabic terms.
- Seam 3 — typecheck, lint, build on every ticket; Playwright smoke in the final ticket.
- Concurrency is tested where a limit exists (Coupon per-customer/total limits) with the same parallel-call pattern as the idempotency test.

## Out of Scope

Per-Variant per-warehouse Stock (ADR 0001); buy-X-get-Y or bundle Promotions; stacking Pricing Rules; store-credit balances; automated exchange Orders; refund execution through any gateway; Realtime for Customer Notifications; push, WhatsApp or SMS channels; loyalty/referral/affiliate UI; driver app; a second admin role; CI for Playwright; anything in Tier 3.

## Further Notes

- Order of merge is fixed: pre-launch group before launch; features after launch in the order Collections → Coupons → Variants → Promotions → Notifications → Returns → Playwright. Promotions depends on the Pricing Rule function, which is introduced by Coupons; Variants must land before Promotions so the pricing function receives the Variant-overridden base price.
- Every migration is applied by the owner via the SQL editor; each ticket lists its migration file and the regenerated types as an explicit step.

## Tickets

Spec issue: #2. Tickets (GitHub, label `ready-for-agent`; `pre-launch` merges before launch, `post-launch` after):

| # | Ticket | Blocked by |
|---|--------|-----------|
| #3 | T2-01 Merge PR #1 and land the accessibility polish | — |
| #4 | T2-02 Canonical Arabic terms + copy test | #3 |
| #5 | T2-03 One New-Order Alert row per staff recipient | #3 |
| #6 | T2-04 Reversal and sweep-isolation tests | #3 |
| #7 | T2-05 Shared formatting/error helpers per app | #3 |
| #8 | T2-06 Collections: hand-picked and rule-based | #3 |
| #9 | T2-07 Pricing Rule function and effective price | #3 |
| #10 | T2-08 Coupons | #9 |
| #11 | T2-09 Variant-aware checkout | #9 |
| #12 | T2-10 Promotions engine | #10, #11 |
| #13 | T2-11 Customer Notifications UI | #3 |
| #14 | T2-12 Returns | #13 |
| #15 | T2-13 Playwright smoke | #12, #14 |

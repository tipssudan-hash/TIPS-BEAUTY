# TIPS Beauty — Audit, Fix and Launch-Readiness Report

Date: 2026-09-20 · Branch: `audit/2026-09` (9 commits on top of `update-from-remote`) · Backend: Supabase project `eaomyiihsuikinkdhwzy`

---

## 1. Executive summary (for the business)

**Where we started.** The repository contained two apps generated before the backend was built. The customer Storefront could not place an order or post a review (the database correctly refused them), showed wholesale cost prices to any logged-in customer, and called Google Gemini from the browser with a key that would have been public. The Admin Portal was a visual mock-up: five of its eight pages showed hard-coded demo data, and the product form could not save a product at all. Meanwhile the Supabase backend already contained a complete, well-designed order system (35 tables, 51 server functions, row-level security) that neither app used.

**What we did.** Rather than rewrite, we rewired both apps onto the existing backend, closed the security gaps the backend itself had, added the pieces that were genuinely missing (stock release on cancellation, 48-hour auto-cancel, email notifications, multi-warehouse seeding, product soft-delete), and built the Admin screens staff need to run the store. Everything is version-controlled — including the database schema, which previously lived only in the dashboard.

**Where we are.** Both apps build cleanly, 12 automated tests pass against the live backend (including double-submit and cancellation race conditions), and the full order lifecycle was walked through in a browser: browse → cart → COD and Mycashi checkout with receipt upload → admin sees the order live → verifies payment → confirms → assigns driver → ships → delivers → customer posts a verified review.

**What remains before launch** is configuration, not code — listed in §6. The biggest items: a Gemini key, a Resend account plus DNS records for `tips-sd.com`, and deleting test data.

---

## 2. Findings and fixes

Severity: **S** security · **D** data integrity · **B** bug · **P** performance · **U** UX.

### 2.1 Backend (Supabase)

| # | Sev | Finding | Fix |
|---|---|---|---|
| 1 | S | Every new table/function was public by default (`ALTER DEFAULT PRIVILEGES … TO anon, authenticated`) | Revoked defaults; every new function carries explicit grants (`0001`) |
| 2 | S | Customers could edit their own `beauty_points`, `loyalty_tier`, `referred_by`, `email` and redeem the points for real discounts | Trigger blocks non-admin changes to protected profile columns (`0001`); test proves it |
| 3 | S | `cost_price` readable by any logged-in customer via the products table | Column-level grant excludes it; admins use `get_admin_products()` (`0001`); test proves it |
| 4 | D | Cancelling an order never returned stock, coupon usage or redeemed points | `release_order_resources()` reverses all three, idempotently, with checkout's lock order; wired into admin cancel (`0002`) |
| 5 | D | No customer cancellation path; no 48-hour auto-cancel; `pg_cron` not enabled | `customer_cancel_order()` (only while `new`), `cancel_stale_orders()` on pg_cron every 15 min with per-row error isolation (`0003`, `0004`) |
| 6 | D | Order lines stored only `{id, quantity}`; products were hard-deleted → history lost | Items now snapshot name, unit price, discount, line total; `products.is_active` soft-delete; hard delete blocked when referenced (`0007`) |
| 7 | D | First `warehouse_inventory` row silently switched every checkout to warehouse mode; products without rows became unorderable | Two warehouses seeded (Khartoum, Port Sudan), stock migrated, trigger guarantees an inventory row per product × warehouse (`0009`) |
| 8 | B | No email path: queue only allowed `whatsapp`/`sms`; no staff recipient setting | `email` channel, `app_settings.notification_emails`, trigger queues customer + staff rows, pg_cron dispatch (`0006`) |
| 9 | B | Both Edge Functions lacked CORS → browser calls failed preflight | Shared CORS helper; redeployed |
| 10 | B | Fawry / bank transfer listed as payment methods (not available in Sudan) | Only COD and Mycashi active; CHECK tightened (`0008`) |
| 11 | B | `is_admin()` not executable by `anon` → anonymous visitors could not read delivery zones/banners | Grant (`0010`) |
| 12 | B | `reviews` had an admin policy but no table privilege → admin moderation page empty | Grant (`0011`) |
| 13 | P | No indexes for order list filters or proof review queue | `orders(status, created_at)`, unseen partial index, `payment_proofs(status)` (`0005`) |
| 14 | U | No shared "seen" state for new orders | `orders.viewed_at` + `mark_order_viewed()` (`0005`) |

### 2.2 Storefront

| # | Sev | Finding | Fix |
|---|---|---|---|
| 15 | B | Checkout inserted into `orders` directly — always failed under RLS; trusted client total; hard-coded 1,500 shipping; 3 hard-coded cities | `checkout_order_safe` with idempotency key; state → locality selects from `delivery_zones`; payment methods from DB; server computes totals |
| 16 | B | Reviews read/wrote the table directly — always failed; anyone could post | Verified-purchase RPCs; form only shown when eligible |
| 17 | B | Catalogue read the table directly — failed when logged out | `get_public_products` / `get_public_product` |
| 18 | S | Gemini key injected into the browser bundle; chat always errored | `beauty-advice` Edge Function via `functions.invoke`; client SDK and injection removed |
| 19 | B | Tailwind CDN + esm.sh importmap alongside the Vite bundle (duplicate React, dead CSS, `fadeIn` undefined) | Real Tailwind/PostCSS build with the brand palette |
| 20 | B | Post-checkout landed on an empty cart (found in browser walkthrough) | Navigate before clearing the cart |
| 21 | B | Order tracking asked for a UUID and embedded a Google Map with `key=YOUR_API_KEY` | "My orders" list + order detail with timeline, self-cancel, late proof upload |
| 22 | B | Product page ignored discounts; `logo.png` vs `logo.PNG` broke on Linux hosts; `alert()` everywhere; `window.location` redirects | Fixed; toasts and inline errors; router navigation |
| 23 | U | Signup said "log in" when email confirmation was required; protected routes lost the return path | Verification panel; `state.from` redirect |
| 24 | — | No lint, no typecheck, no `strict`, no React types, dead mock data and types | ESLint, `typecheck`, `strict` on (0 errors), `@types/react`, dead code removed |
| 25 | U | No PWA/wrapper readiness | Manifest, theme colour, safe-area CSS, no full-page redirects |

### 2.3 Admin Portal

| # | Sev | Finding | Fix |
|---|---|---|---|
| 26 | B | Product form sent three non-existent columns → every save failed; edited `stock` directly (overwritten by trigger); sent computed columns | Fields removed; stock read-only (managed via Inventory); computed columns stripped; image upload to `products` bucket |
| 27 | B | Product list: broken template literals (edit link, stock dot), delete instead of deactivate | Fixed; activate/deactivate |
| 28 | B | Orders: no status changes, no driver assignment, no proof review, fake pagination/badge | Order list with filters, pagination, realtime; order detail with transitions, assignment, proof review, timeline |
| 29 | P | Dashboard summed every order client-side | `admin_business_report` |
| 30 | B | Categories, Logistics, Marketing, BI pages were hard-coded demo data | Removed; replaced by Inventory, Warehouses, Delivery zones, Drivers, Banners, Reviews, Settings |
| 31 | U | Login navigated before the role check; raw error text shown | Waits for role; Arabic messages |

---

## 3. What was built

**Migrations** (`supabase/migrations/`, baseline + 11): lockdown, `release_order_resources`, customer cancel, stale-order sweep, viewed/indexes, email queue + settings, soft-delete + item snapshot, payment methods, warehouses + zones, anon `is_admin`, reviews grant. Each carries a DOWN comment.

**Edge Functions** (`supabase/functions/`): `beauty-advice` and `order-status-push` (CORS added), new `send-order-emails` (Resend, Arabic customer confirmation + staff alert with admin link, retries up to 5, never blocks orders). All deployed.

**Storefront**: typed API layer (`src/lib/api.ts`), pricing helper, rewired catalogue/checkout/reviews/chat, My Orders + Order Detail, build toolchain, PWA manifest.

**Admin Portal**: order operations, dashboard, products with upload and soft-delete, Inventory (adjust/transfer/low-stock), Warehouses, Delivery zones, Drivers, Banners, Reviews moderation, Settings (staff emails), realtime unseen badge.

**Tests** (`tests/`): 2 unit, 10 backend contract/concurrency tests (`npm test`; needs `.env.test.local` with the two test accounts).

**Docs**: `CONTEXT.md` (glossary), `docs/IMPLEMENTATION-PLAN.md` (reviewed plan), this report.

---

## 4. Verification performed

- `npm run typecheck && npm run lint && npm run build` — both apps clean (strict TypeScript).
- `npm test` — 12/12 against the live project: anon/customer permission boundaries, idempotent + concurrent checkout, exactly-once stock release, concurrent cancel vs checkout, admin transition rules + optimistic locking, `mark_order_viewed`, email queue rows, proof-path validation, sweep protected from non-service callers.
- Browser walkthrough (Chrome, dev servers): full customer and admin lifecycle as described in §1, plus every admin page renders live data.
- Deployed functions probed: preflight returns 204 with the right origin; email function rejects calls without the cron key.

---

## 5. Known limitations (documented, not fixed)

- **Variants** are shown in admin but ignored at checkout (backend prices/reserves at product level). Hidden from the buy flow.
- **Warehouse routing** prefers a warehouse whose `city` equals the zone name; with zone names ≠ city names it falls back to creation order. Harmless with the current two warehouses; align names if routing matters later.
- **Idempotency** protects against retries/double-clicks within one checkout attempt, not a brand-new tab.
- **Logged-out order tracking** was removed (orders are private); customers use My Orders.
- **Timestamps** are UTC in the database; the UI and emails display `Africa/Khartoum`.
- **Admin font** is Inter (pre-existing); Storefront uses Cairo. Cosmetic.

---

## 6. Launch checklist (owner actions)

1. **Secrets** (Supabase → Edge Functions → Secrets): `GEMINI_API_KEY`; `RESEND_API_KEY`; `CRON_SECRET` (random string); optional `EMAIL_FROM`, `ADMIN_PORTAL_URL`, `ALLOWED_ORIGINS=https://beauty.tips-sd.com,https://admin.beauty.tips-sd.com`.
2. **Vault** (SQL editor): `select vault.create_secret('<same CRON_SECRET>', 'send_order_emails_key'); select vault.create_secret('https://eaomyiihsuikinkdhwzy.supabase.co/functions/v1/send-order-emails', 'send_order_emails_url');` — until these exist the email job is a silent no-op.
3. **Resend + DNS**: verify `tips-sd.com` in Resend (SPF/DKIM), sender `orders@tips-sd.com`; configure Supabase Auth SMTP with Resend so verification emails send.
4. **Auth settings**: keep email confirmation on; add redirect URLs `https://beauty.tips-sd.com/*`, `https://admin.beauty.tips-sd.com/*`, `tipsbeauty://*`.
5. **Admin settings page**: enter staff alert recipients.
6. **Test data**: delete the `QA E2E` warehouse/driver, the two `test-*@tips-sd.com` accounts, orders whose `customer_name` starts with `TEST-`, the test review, and the test driver "مندوب اختبار الخرطوم". Rotate the database password (it was shared in chat).
7. **Inventory**: review Khartoum quantities (migrated from the old stock column) and set Port Sudan quantities.
8. **Deploy** the two apps to their domains with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` only.
9. **Git**: PR #1 (`audit/2026-09` → `main`) is open; future DB changes go through `supabase/migrations/`.

An interactive walkthrough of steps 1–8 exists: `bash scripts/launch-wizard.sh` (opens each dashboard, sets Edge Function secrets through the CLI, prints the Vault and cleanup SQL, and lists anything left pending).

---

## 7. Code review outcome (post-implementation)

A two-axis review (Standards vs `CONTEXT.md`/conventions; Spec vs `docs/IMPLEMENTATION-PLAN.md`) ran on the final diff. Fixed on the branch: payment-proof uploads now use a unique object per attempt (the storage policy allows customers INSERT only, so a checkout retry previously failed at upload); `beauty-advice` excludes deactivated products; admin Banners/Reviews dates use Africa/Khartoum; stale untyped RPC shims removed from the storefront and admin order APIs; a storage-policy regression test added. Carried to Tier 2 as tickets: glossary drift in UI copy (`المنطقة`/`الإيصال`/`رقم العملية`/`غير مقروء` vs `CONTEXT.md`), per-recipient staff email rows, coupon/points reversal and sweep-isolation tests, Playwright smoke, duplicated formatting/error helpers across the api modules, the `catalogApi.ts` type shims.

## 8. Improve next

**Tier 2 (after launch stabilises)** — coupons UI (backend ready), promotions engine (table is decorative — needs a pricing function), storefront collections, in-app customer notifications UI, order returns UI, variant-aware checkout.

**Tier 3** — loyalty/referral/affiliate UI (backend ready), driver app with live location (`update_driver_order_status`, `share_driver_location` exist), Expo push (`order-status-push` exists but no mobile app), WhatsApp/SMS channel, service worker/offline, proper 192/512 PWA icons, a second admin role.

**Engineering** — Playwright smoke suite in CI, `supabase db push` once the CLI login-role issue on the project is resolved, dependency updates (React Router 7 / Vite 7 alignment between apps).

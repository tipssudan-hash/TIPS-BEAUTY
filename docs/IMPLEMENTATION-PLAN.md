# TIPS Beauty — Implementation Plan (reviewed, 2026-09-20)

Process followed: inspect (3 code/schema inspections) → delegated independent review (23 findings) → review pass (17 confirmed, 5 amended, 1 rejected) → adversarial debate (Sonnet 5) → this plan. Glossary: `CONTEXT.md`. Schema of record: `supabase/schema-current.sql`.

## 1. What is broken or missing

**Storefront (root app)** — written before the backend; bypasses it.
- Every Supabase call is a direct table read/write with `select('*')`; zero RPC use.
- Checkout inserts into `orders` directly → fails (no customer INSERT policy). `CheckoutPage.tsx:48`.
- Reviews read/insert `reviews` directly → both fail (no client grants). `ReviewSection.tsx:33,66`.
- Catalogue reads `products` directly → fails for logged-out users (no `anon` grant) and exposes `cost_price` to logged-in users. `StoreContext.tsx:24`, `ProductDetailsPage.tsx:25`.
- Gemini called from the browser with a key injected into the bundle (`gemini.ts:28`, `vite.config.ts:13`); key absent → chat always errors. A server-side Edge Function `beauty-advice` already exists.
- `index.html` loads Tailwind CDN + esm.sh importmap alongside the Vite bundle (duplicate React risk; `@tailwind` directives dead; `brand-*` palette only in CDN config).
- Order tracking asks for a UUID and embeds a Google Map with `key=YOUR_API_KEY`. Payment list includes Fawry; hardcoded 3 cities; no state/zone; no Mycashi reference/proof.
- Product type uses `name` (DB: `name_ar`/`name_en`); PDP ignores discounts; `logo.png` vs `logo.PNG`; no lint/typecheck/strict; dead mocks/types.

**Admin Portal** — a visual shell.
- 4 backend calls total; none of the ~15 admin RPCs used; 5 of 8 pages are hardcoded demo data (Categories, Logistics, Marketing, BI, most of Dashboard).
- Product form sends non-existent columns (`marketing_badge`, `meta_title`, `meta_description`) → every save fails (PGRST204); edits `stock` directly (overwritten by the warehouse-sync trigger when inventory rows exist); sends computed columns on update. `ProductFormPage.tsx:20-44,71-74`.
- Product list: broken template literals (`/ products / edit / ${id}`) → edit link and stock dot broken. `ProductListPage.tsx:187-214`.
- Orders: no status changes, no driver assignment, no detail view, no payment-proof review, hardcoded badge `'5'`, hardcoded pagination text.
- Dashboard fetches all orders client-side to sum revenue; dynamic Tailwind classes purged.

**Backend gaps (verified in dump)**
- G1 Cancellation never restores stock, coupon usage, or redeemed points (`admin_update_order_operation` L120-168 just flips status; `checkout_order` L210-214 does three side-effecting writes).
- G2 No stale-order cancel; `pg_cron` not enabled.
- G3 `notification_queue.channel` CHECK is `('whatsapp','sms')`; no email path; no settings table for staff recipients.
- G4 `profiles` self-UPDATE guards only `role` (L687-697) → customers can set `beauty_points` and redeem them for discounts. **Security blocker.**
- G5 `ALTER DEFAULT PRIVILEGES … GRANT ALL ON FUNCTIONS/TABLES TO anon, authenticated` (L3576-3596) → every new object is public unless explicitly revoked. **Must be fixed before any new function.**
- G6 `authenticated` has full SELECT on `products` (L2683, L3504) → `cost_price` readable by any customer.
- G7 `orders` has no `viewed_at`; no customer cancel path; `orders.status` has no CHECK.
- G8 `orders.items` stores only `[{id, quantity}]` (L237-246) — no price/name snapshot; products are hard-deleted → order history loses lines. No `products.is_active`.
- G9 Both Edge Functions lack CORS/OPTIONS handling → browser `functions.invoke` fails preflight.
- G10 Drivers default `status='offline'`; assignment requires `active|busy`; `shipped` requires a driver.
- G11 Warehouse mode is all-or-nothing: the first `warehouse_inventory` row switches every checkout to warehouse routing; products without rows become unorderable (L205-206).
- G12 `checkout_order` ignores product variants (price and stock).
- G13 Storage policies live in the `storage` schema and are not in the dump — unverified.
- G14 Missing indexes `orders(status, created_at)`, `payment_proofs(status)`; `payment_methods` CHECK still permits Fawry/BANK_TRANSFER.

## 2. What already exists and will be reused (no rebuild)

| Need | Existing backend object |
|---|---|
| Server-side checkout: pricing, discounts, zone fee, atomic stock reservation, coupons, points, idempotency | `checkout_order_safe(...)` → `checkout_order` |
| Public catalogue without `cost_price` | `get_public_products()`, `get_public_product(id)` |
| Mycashi proof | bucket `payment-proofs`, `submit_payment_proof`, `review_payment_proof`, `payment_methods.requires_proof` |
| Verified-purchase reviews | `get_reviewable_order_items`, `submit_purchased_product_review`, `get_public_product_reviews`, `moderate_product_review` |
| Admin order operations with optimistic locking and transition rules | `admin_update_order_operation`, `update_driver_order_status`, `order_status_history` |
| Dashboard numbers | `admin_business_report`, `get_admin_product_review_stats` |
| Realtime | `orders`, `order_status_history` already in `supabase_realtime` publication |
| Notifications | `notification_queue` + triggers (one row per order event), `customer_notifications` |
| Gemini chat | Edge Function `beauty-advice` (needs `GEMINI_API_KEY` secret + CORS) |
| Delivery zones, drivers, banners, payment methods | tables + admin RLS policies already present |
| Auth profile creation, role protection | `handle_new_user`, `prevent_profile_role_change`, `is_admin()` |

## 3. Resolved disagreements (delegate / review / debate)

| Topic | Resolution |
|---|---|
| Unseen badge via localStorage (delegate #16) | **Rejected.** Owner chose shared seen-state → `orders.viewed_at` + admin RPC `mark_order_viewed`, fired when an admin opens the order detail. |
| Staff recipients from a secret (delegate #15) | **Amended.** Customer email derived from `profiles.email`; staff list stays admin-editable in a 1-row `app_settings` table. |
| Email via in-transaction `pg_net` trigger (delegate #17) | **Rejected** per debate: fire-and-forget inside the order transaction can email for a rolled-back order. Use a pg_cron sweep (every minute) that reads pending `email` rows and calls the Edge Function; retries come free. |
| Cancel reversal = "restore stock" (draft) | **Amended** per debate: one `release_order_resources(order_id)` reversing stock (products.stock or warehouse_inventory), coupon usage/redemption, points (`refund_reversal`), with the same lock order as `checkout_order`; per-row exception isolation in the cron sweep. Built and concurrency-tested **first**. |
| Zone name vs warehouse city (delegate #13) | Downgraded: only affects warehouse preference ordering; irrelevant with one warehouse; noted in report for when a second warehouse exists. |
| Proof upload after order creation (debate §2) | **Changed**: upload to `payment-proofs/<uid>/<idempotencyKey>.<ext>` **before** calling checkout, then `submit_payment_proof` — no orders without a proof except on a failed submit call (retried). |
| Cut Drivers CRUD (debate §5) | **Kept**: `shipped` requires a driver; a minimal Drivers screen with `status` is mandatory. |
| Cut PWA/Capacitor readiness (debate §5) | **Trimmed**: manifest, theme-color, safe-area CSS, no full-page redirects — yes; **no service worker** at launch. |
| Idempotency "guarantee" (debate §1) | Stated honestly: key is per checkout attempt (`crypto.randomUUID()` in sessionStorage, cleared on success); protects against retries/double-clicks, not against a fresh tab. |
| 48h auto-cancel scope (review OD2 vs debate §4) | **Owner's rule stands**: all orders still `new` after 48h are cancelled with resources released and history written. Noted that staff must confirm COD orders within 48h. |
| Fawry in CHECK constraint (debate §1) | Tighten `payment_methods` CHECK to `('COD','Mychashi')` after deleting unreferenced inactive rows. |

## 4. Owner decisions (settled 2026-09-20)

1. **Multi-warehouse at launch: Khartoum + Port Sudan.** Consequences: seed two `warehouses` rows; migrate existing `products.stock` into `warehouse_inventory` for the Khartoum warehouse (Port Sudan starts at 0); add a trigger that auto-creates a zero-quantity `warehouse_inventory` row in every active warehouse for each new product and each new warehouse (closes the G11 trap); `products.stock` becomes read-only in admin (derived by the sync trigger) and stock is managed via `adjust_warehouse_inventory` / `transfer_warehouse_stock`; Warehouses + Inventory screens move into Tier 1; `delivery_zones.warehouse_id` is set for each zone (Port Sudan zones → Port Sudan warehouse) and `warehouses.city` values are aligned with zone names so `checkout_order`'s routing preference works; checkout must show a clear "not available for your area" message when no single warehouse can fulfil the cart (existing RPC behaviour).
2. **Variants: hidden at checkout** for launch; still editable in admin; documented limitation.
3. **Order item snapshot + product soft delete: launch** (migration 0007).
4. **`cost_price` protected via admin RPC: launch** (migration 0001).

## 5. Exact changes

### 5.1 Repo hygiene (step 0)
- `git init`; `.gitignore` adds `.env`, `admin-portal/.env`, `supabase/.temp/`, `dist/`, `node_modules/`; baseline commit; branch `audit/2026-09`; HTTPS remote.
- `supabase/migrations/0000_baseline.sql` ← `schema-current.sql` (unchanged); `supabase/config.toml`; keep `supabase/functions/*`.
- Verify storage policies: `npx supabase db dump --linked --schema storage -f supabase/storage-current.sql` (owner runs; password). Required: `products` admin-write/public-read; `payment-proofs` owner-write under `<uid>/`, owner+admin read; `review-images` unused.
- Confirm both `.env` files point at `eaomyiihsuikinkdhwzy`.

### 5.2 Migrations (numbered, each with a down script in the PR)
- `0001_lockdown.sql`: revoke anon/authenticated default privileges (G5); extend `prevent_profile_role_change` to block non-admin changes to `beauty_points`, `loyalty_lifetime_points`, `loyalty_tier`, `referred_by`, `referral_code`, `email` (G4); column-level SELECT on `products` for `authenticated` excluding `cost_price` + `get_admin_products()` (G6, per OD4).
- `0002_release_order_resources.sql`: `release_order_resources(order_id)` (SECURITY DEFINER, revoked from all roles, callable only from other definer functions); widen `inventory_movements.movement_type` CHECK with `'order_release'`; call it from `admin_update_order_operation` on `→ cancelled`; add CHECK on `orders.status` (G1, G7).
- `0003_customer_cancel.sql`: `customer_cancel_order(order_id)` — owner only, only while `new`, writes history, releases resources.
- `0004_stale_orders.sql`: enable `pg_cron`; `cancel_stale_orders()` (loop, per-row `EXCEPTION` isolation, `new` + `created_at < now() - interval '48 hours'`); schedule every 15 min (G2).
- `0005_viewed_at.sql`: `orders.viewed_at`; `mark_order_viewed(order_id)` admin RPC; indexes `orders(status, created_at desc)`, `payment_proofs(status)` (G7, G14).
- `0006_email.sql`: `app_settings` (1 row, `notification_emails text[]`, admin-only RLS); widen `notification_queue.channel` CHECK with `'email'`; extend `queue_order_notification` to also queue an `email` row for the customer (from `profiles.email`) and one per staff recipient on `order created`; enable `pg_cron` sweep every minute calling Edge Function `send-order-emails` via `pg_net` with a Vault-stored secret header (G3).
- `0007_items_snapshot.sql` (per OD3): `products.is_active`; `checkout_order` stores item snapshot; `get_public_products`/`get_public_product` filter `is_active`; trigger blocks hard delete of products referenced by orders.
- `0008_payment_methods.sql`: delete unreferenced inactive Fawry/BANK_TRANSFER rows; tighten CHECK; ensure `COD` (`requires_proof=false`) and `Mychashi` (`requires_proof=true`) active.
- `0009_warehouses.sql`: seed `warehouses` (Khartoum `KRT`, Port Sudan `PZU`); copy `products.stock` into Khartoum `warehouse_inventory`; trigger `ensure_warehouse_inventory_rows` on `products` INSERT and `warehouses` INSERT; `delivery_zones.warehouse_id` set per zone.
- Seed: `delivery_zones` — Khartoum localities (الخرطوم، أم درمان، بحري، كرري، جبل أولياء، شرق النيل، أمبدة) with fee → Khartoum warehouse; Port Sudan localities → Port Sudan warehouse; one default zone per remaining state (`state` column set; `name = "<state> — افتراضي"`) → Khartoum warehouse. Drivers are not seeded (staff add).

### 5.3 Edge Functions
- `beauty-advice`, `order-status-push`: add CORS/OPTIONS handling; redeploy (G9). Set `GEMINI_API_KEY` secret (owner supplies key).
- New `send-order-emails`: reads pending `email` rows (batch), renders Arabic templates (customer confirmation; staff alert with admin link `https://admin.beauty.tips-sd.com/orders/<id>`), sends via Resend (`RESEND_API_KEY` secret, from `orders@tips-sd.com`), marks `sent`/`failed` with error, never throws into order flow. Sudan time (`Africa/Khartoum`) in email bodies.

### 5.4 Storefront files
- `src/context/StoreContext.tsx`: `rpc('get_public_products')`; drop `costPrice`; error handling; remove debug log.
- `src/pages/customer/ProductDetailsPage.tsx`: `rpc('get_public_product')`; discount display; hide variants at checkout (OD2).
- `src/pages/customer/CheckoutPage.tsx`: state → zone select from `delivery_zones` (fallback to state default); payment methods from `payment_methods` (active); Mycashi reference (required) + image proof (≤5 MB, required) uploaded before checkout; `rpc('checkout_order_safe')` with sessionStorage idempotency key; `submit_payment_proof`; `navigate()` not `window.location`; no `alert()`.
- `src/components/ui/ReviewSection.tsx`: three review RPCs; verified-purchase gating in UI.
- `src/pages/customer/OrderTrackingPage.tsx` → "My orders" (RLS-scoped `orders` + `order_status_history`), self-cancel while `new`, proof status; remove Maps iframe. Logged-out tracking removed (documented).
- `src/pages/customer/AIChatPage.tsx`: `functions.invoke('beauty-advice')`; route requires auth. Delete `src/gemini.ts`, `@google/genai`, API_KEY injection in `vite.config.ts`.
- `index.html`, new `tailwind.config.js`, `postcss.config.js`, `index.css`: remove CDN + importmap; move `brand` palette; fix body background conflict; add manifest + `theme-color` + safe-area; fix logo filename.
- `src/pages/auth/*`, `App.tsx`: verification-email messaging; `ProtectedRoute` passes `state.from`; remove stale comments. `SettingsPage`: remove dead toggles; hide points. `types.ts`: align with DB (`name_ar`…), remove dead types; delete `data.ts` mocks, `metadata.json`.
- Tooling: ESLint config (copy admin), `typecheck` script, `strict` if fixable; generated `src/lib/database.types.ts` via `supabase gen types` (both apps).

### 5.5 Admin Portal files
- `src/pages/orders/OrderListPage.tsx`: real filters + pagination; Realtime subscription on `orders`; unseen count = `status='new' and viewed_at is null`; remove Fawry/hardcoded text.
- New `src/pages/orders/OrderDetailPage.tsx`: items, history, `admin_update_order_operation` transitions, driver/warehouse assign, payment proof (signed URL) + `review_payment_proof`, `mark_order_viewed` on open; renders `payment_status='proof_submitted'`; Sudan time display.
- `src/pages/products/ProductFormPage.tsx`: remove non-existent fields; strip computed columns on update; image upload to `products` bucket; category datalist from existing values; `get_admin_products`. `ProductListPage.tsx`: fix template literals; soft-delete.
- New simple CRUD pages: `DeliveryZonesPage` (with warehouse select), `DriversPage` (with `status`, warehouse), `WarehousesPage` + `InventoryPage` (adjust via `adjust_warehouse_inventory`, transfer via `transfer_warehouse_stock`, low-stock list), `BannersPage`, `SettingsPage` (`notification_emails`), `ReviewsPage` (moderation).
- `AdminDashboard.tsx`: `admin_business_report`; remove fake trends/Gemini text; fix dynamic classes. Remove `CategoriesPage`, `MarketingPage`, `BIPage` from nav (Tier 2). `AdminLayout.tsx`: live badge. `index.html`: title/lang/dir.

## 6. Dependencies and configuration (owner-side)
- Supabase Auth: email confirmation ON; Resend SMTP for auth mails; redirect URLs `https://beauty.tips-sd.com/*`, `https://admin.beauty.tips-sd.com/*`, `tipsbeauty://*`.
- Secrets: `GEMINI_API_KEY`, `RESEND_API_KEY`, Vault secret for cron→Edge Function auth. Never in `.env`.
- DNS for `tips-sd.com` (SPF/DKIM) before production; until then sends fail gracefully and stay `failed` in the queue.

## 7. Security considerations
- All new functions: SECURITY DEFINER + `set search_path` + explicit REVOKE/GRANT (0001 first).
- Customers never write `orders`, `reviews`, `profiles` loyalty columns, or storage outside `<uid>/`.
- Signed URLs for payment proofs in admin; `products` bucket public read only.
- Client admin gate remains UX only; RLS/`is_admin()` is the enforcement.
- No secrets in the browser bundle; remove `process.env.API_KEY` injection.

## 8. Testing and verification
1. **First**: `release_order_resources` concurrency tests — concurrent checkout vs cancel on the same product; double-submit `checkout_order_safe` with the same key (single order, single decrement); cancel restores stock, coupon count, points; stale-cancel loop continues past a failing row.
2. Storage policy smoke test (upload as customer to own prefix, to another prefix → denied; admin read).
3. RPC contract tests (Vitest + supabase-js, test customer + test admin, tagged rows, cleanup).
4. `typecheck`, `lint`, `build` in both apps.
5. Browser walkthrough matrix: signup → verify → browse (logged-out and in) → cart → COD checkout → Mycashi checkout with proof → admin sees order live → confirm → assign driver → ship → deliver → review → cancel path → 48h job run manually → emails (once Resend configured).
6. Playwright smoke for the checkout and admin order flows.

## 9. Risks and rollback
- Live pre-launch DB: `pg_dump` before each `db push`; every migration ships with a down script; rows treated as real.
- Tailwind rebuild may shift styling; page-by-page visual check.
- Reviews RPC hides legacy unverified rows — count before migrating.
- Timestamps are UTC; UI/emails convert to `Africa/Khartoum`.
- Warehouse routing by city and variants remain known limitations (report).

## 10. Tiering
- **Tier 1 (this plan)**: §5.1–5.5, migrations 0001–0009, seeds, Edge Functions, tests, report.
- **Tier 2 (after Tier 1 is tested)**: coupons UI, promotions (needs a real pricing function — table is decorative), collections, in-app notifications UI, returns UI, variant-aware checkout.
- **Tier 3 (report only)**: loyalty/referral/affiliate UI, driver app + live location, Expo push, WhatsApp/SMS channel, service worker/offline.

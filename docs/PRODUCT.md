# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Customers**: Sudanese cosmetics shoppers using the Storefront, a mobile-first web app (also shipped inside a native wrapper built and maintained separately by others). They browse the catalogue, order via Cash on Delivery or Mycashi, track delivery, and review products they've received.

**Staff**: A single admin role at launch, using the separately hosted Admin Portal to manage products, orders, drivers, Warehouses and Stock, States and Localities, and banners. No role-based access tiers yet.

## Product Purpose

An online cosmetics store for the Sudanese market: customers browse products, place orders with locally relevant payment methods, track delivery through the Order lifecycle, and leave verified-purchase reviews. Staff run the operation — catalogue, fulfilment, drivers, warehousing — from a separate Admin Portal over the same backend. Current goal: get the existing (pre-launch) system to commercially ready state.

## Positioning

Brand tagline (bilingual, user-confirmed): **اكتشفي جمالك الطبيعي / "Discover Your Natural Beauty."**

## Operating Context

- Two separate apps sharing one Supabase backend (project `eaomyiihsuikinkdhwzy`): the **Storefront** (customer-facing, `beauty.tips-sd.com`) and the **Admin Portal** (staff-only, `admin.tips-sd.com`).
- The backend is mature and authoritative: ~35 tables, ~50 SECURITY DEFINER RPCs, RLS everywhere, 2 deployed Edge Functions (`beauty-advice` — server-side Gemini chat; `order-status-push` — Expo push). The app code must be rewired to call these RPCs rather than reading/writing tables directly.
- Pre-launch: existing database rows are treated as real, not test data.
- Delivery is fulfilled only by Tips Beauty's own employed Drivers, never a third-party courier.
- Orders ship from one of multiple warehouses (Khartoum + Port Sudan at launch), routed by the Order's State and Locality.
- Notifications (order confirmation, new-order alerts) are sent by email via Resend, Arabic only.
- Full glossary of product terminology lives in the repo at `CONTEXT.md` — Product/Variant/Order/Cart/Driver/Locality/State/Shipping Fee/etc. Use those terms and their "avoid" lists consistently.

## Capabilities and Constraints

- **Payment**: Cash on Delivery, or Mycashi (Sudanese mobile-money transfer requiring a reference number plus an uploaded payment-proof image, ≤5MB, verified by staff). No payment gateway integration; no Fawry.
- **Stock**: reserved atomically at order creation, restored on cancellation; orders left `new` for 48 hours auto-cancel.
- **Accounts**: login and email verification required before ordering.
- **Delivery coverage**: all Sudanese States are served; Localities within a State carry their own shipping fee, falling back to a State default.
- **Reviews**: one per Product, only from a customer with a delivered Order containing that Product, no photos.
- **Variants**: exist per Product (shade/size, own price/stock) but are hidden at checkout for launch — documented limitation, not a bug.
- **Discounts**: a staff-set percentage on a single Product is the only pricing rule at launch.
- Scope is explicitly tiered:
  - **Tier 1 (launch)**: catalogue, checkout, Localities/Warehouses, Mycashi + COD, verified reviews, order tracking/history, admin order operations, product image upload, drivers, banners, order emails.
  - **Tier 2 (post-launch, after Tier 1 is tested)**: coupons, promotions, collections, in-app notifications, returns.
  - **Tier 3 (report only, not built)**: loyalty, referrals, affiliates, driver app/live location, push beyond the existing Edge Function.

## Brand Commitments

- Name: **Tips Beauty** (تيبس بيوتي); parent company TIPS INTEGRATED SOLUTIONS.
- Tagline: اكتشفي جمالك الطبيعي / "Discover Your Natural Beauty."
- Arabic-first interface. Currency is always SDG, displayed as ج.س.
- Domains: `beauty.tips-sd.com` (Storefront), `admin.tips-sd.com` (Admin Portal).
- A native wrapper (iOS + Android, scheme `tipsbeauty://`, name "TIPS Beauty" / "تيبس بيوتي") is built and maintained by others; this project's job is to keep the web app wrapper-ready and PWA-capable, not to design native-only UI.

## Evidence on Hand

- Backend schema and RPC surface documented in `docs/IMPLEMENTATION-PLAN.md` and the baseline migration under `supabase/migrations/`.
- Terminology glossary: repo `CONTEXT.md`.
- No testimonials, press, case studies, or marketing copy exist yet — do not fabricate any.

## Product Principles

1. The backend is the source of truth: RPCs and RLS decide pricing, stock, and permissions — the UI must never compute or trust these client-side.
2. Sudan-specific by default: States/Localities, SDG, Mycashi, and own-driver delivery are product facts, not generic e-commerce patterns — don't substitute couriers, foreign gateways, or currencies.
3. Two audiences, two apps, one backend: Storefront and Admin Portal have sharply different scopes and permissions (single admin role vs. self-service customers).
4. Pre-launch discipline: real data, tiered scope (Tier 1 ships now; Tier 2 waits for Tier 1 to be tested; Tier 3 is reported, not built).
5. Mobile-first responsive web is the actual design surface; the native wrapper is someone else's concern.

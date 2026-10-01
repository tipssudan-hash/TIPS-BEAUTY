# GPS Delivery & Dynamic Pricing — Phase 1 (slim)

Vocabulary: `CONTEXT.md`. Origin: product owner's `GPS_DELIVERY_PRICING_PLAN.md` (repo root), narrowed in a debate session between Claude Sonnet and Claude Opus on 2026-10-01 (see that session's transcript for the full back-and-forth). Decisions below are the outcome of that debate, not a straight implementation of the original plan — several of its items are deliberately deferred, with reasons, in Out of Scope.

## Problem Statement

Today's delivery fee is a flat, staff-set number per Locality (falling back to a State default) — it does not vary with how far a specific customer actually is from the warehouse shipping their order. The product owner's GPS plan proposes fixing this with mandatory customer GPS, a full open-source routing engine (OSRM/GraphHopper/Valhalla-style), intelligent multi-warehouse split-shipment fulfillment, and a new `warehouse_supervisor` staff role — all as one feature.

That plan is right that distance-sensitive pricing is worth building and that pricing formula coefficients belong in the database, not hardcoded (Product Principle #1). But most of its ambition doesn't match where this product actually is: there is no routing-engine infrastructure anywhere in this stack (Vite static apps + Supabase RPCs only); mandatory, hard-blocking GPS at checkout is a real conversion/trust risk in a market where customers are not used to it; split-shipment logic is real operational complexity (coordinating two drivers, two delivery windows) for only 2 warehouses; and a new staff role is a standalone access-control decision, not a pricing sub-task. There is also a concurrent, already-settled, multi-workstream initiative in flight (multi-provider auth + Capacitor mobile apps) — a second large initiative landing at the same time risks neither one shipping.

## Solution

Ship a slim Phase 1 that captures the real value (distance-sensitive pricing, zero hardcoded coefficients) with near-zero conflict against the in-flight auth/mobile branches: a straight-line (haversine) distance formula calibrated per (Warehouse, Locality) pair — not a real routing engine — computed by one new RPC, configured from one new Admin Portal page, shipped dark behind a server-side flag and wired into Checkout only once validated. GPS capture, the new staff role, and split-shipment handling are explicitly deferred (see Out of Scope) to their own future specs, each requiring its own sequencing decision.

Build order: schema → quote RPC → admin config page (ship dark, test via the simulator) → checkout wiring (flag-gated).

## User Stories

### Schema
1. As a developer, I want `warehouses` to carry `latitude`/`longitude` and a `base_dispatch_minutes`, so that a quote can be computed from a specific warehouse's real location.
2. As staff, I want a `delivery_pricing_config` table holding base fee, per-km rate, weight-multiplier coefficient, min/max fee caps, and a per-(Warehouse, Locality) road multiplier, so that every coefficient is data, never a literal in code.
3. As a developer, I want every write to `delivery_pricing_config` recorded in an audit log (who, when, old value, new value), so that a mistyped coefficient (e.g. a 10x surge multiplier) is traceable and reversible.

### Quote calculation
4. As a customer, I want my delivery fee computed from the actual distance between the fulfilling Warehouse and my Locality, so that a short delivery doesn't cost the same as a cross-state one.
5. As a developer, I want `calculate_delivery_quote(warehouse_id, locality_id, order_weight)` to compute haversine distance × per-km rate × the (Warehouse, Locality) road multiplier, add the base fee and weight multiplier, then clamp to the configured min/max caps, so that the formula can never return an unreasonable number regardless of config error.
6. As a customer, I want to see only the resulting fee and an estimated delivery window — never a raw distance or km figure — so that the quote reads as a price, not a negotiable measurement.
7. As a developer, I want the RPC to fall back to today's flat Locality fee when no `delivery_pricing_config` row exists for a given Warehouse/Locality pair, so that a missing config row degrades gracefully instead of breaking checkout.
8. As a developer, I want the quote recomputed and frozen server-side at order placement by the existing checkout RPC (the same pattern already used for `total`), never trusted from whatever the checkout page last displayed, so that the charged fee can't diverge from the authoritative one.

### Admin configuration
9. As an admin, I want a Delivery Pricing page to set the base fee, per-km rate, weight multiplier, and min/max caps globally and per State, so that I can tune pricing without a deploy.
10. As an admin, I want a quote simulator on that page — pick a Warehouse, a Locality, a weight, see the resulting fee — so that I can sanity-check a config change before it reaches a real customer.
11. As an admin, I want the simulator to flag when a config change would move a given route's fee by more than a configured percentage, so that a typo is caught before it ships.

### Checkout (flag-gated)
12. As a customer, I want Checkout to show the dynamic quote in place of the flat Locality fee once the feature is enabled for my State, so that I see an accurate fee before confirming.
13. As staff, I want the dynamic-pricing feature gated per State in `app_settings` (server-side, no build-time flag — matching the existing mobile/auth workstream convention), so that it can be rolled out State by State and rolled back instantly without a deploy.

## Implementation Decisions

- **Haversine, not a routing engine.** OSRM/GraphHopper/Valhalla all require a self-hosted tile-server-style process with loaded Sudan road-network data; nothing in this stack hosts that today, and OSM's Sudan coverage is uneven outside major cities. A straight-line distance × a per-(Warehouse, Locality) road multiplier approximates real road distance well enough for a launch-grade formula, and the multiplier is recalibratable from the admin page without touching code.
- **Multiplier is per (Warehouse, Locality), not per Locality alone.** Khartoum's Niles mean two points 2km apart as the crow flies can be a 15km drive depending which bridge is nearest — and which bridge is nearest depends on which Warehouse is fulfilling, not just which Locality the customer is in. A per-Locality-only multiplier cannot express this.
- **Never surface the raw distance.** Only the fee and the delivery window are customer-facing; an unpublished number can't be argued with, and it keeps the door open to swap the formula later without a UX change.
- **Fallback is mandatory, not optional.** `calculate_delivery_quote` must return today's flat Locality fee whenever no pricing-config row exists for that Warehouse/Locality pair — "zero hardcoded prices" must never mean "checkout breaks when config is incomplete."
- **Caps are enforced inside the RPC, not just displayed as a suggestion on the admin page.** The database function itself clamps to min/max regardless of what the config table contains, so a bad config value is contained no matter how it got there.
- **Backend first, RPC only** (Tier 1 lockdown pattern, unchanged): SECURITY DEFINER, pinned `search_path`, revoked from `PUBLIC`/`anon`, explicit grants; admin-only RPCs guarded by the existing admin check.
- **Feature flag lives in `app_settings`, server-side**, consistent with the auth/mobile workstream's standing instruction against build-time flags.
- **No GPS dependency in Phase 1.** The quote is computed from the customer's selected Locality (centroid or a staff-configured reference point per Locality), not a device GPS pin — Phase 1 ships without touching the checkout GPS-permission flow at all.

## Testing Decisions

- Backend contract tests (Vitest, matching existing `tests/backend/*` pattern): the quote RPC against known Warehouse/Locality pairs with and without a config row (fallback path), cap enforcement at both ends, and a concurrency test on config writes (matching the existing idempotency-test pattern used for Coupons).
- A unit test asserting the haversine + multiplier math against hand-computed expected values for at least one Khartoum-internal pair and one cross-state pair.
- Admin simulator is exercised by a Vitest test calling the same RPC the UI calls, not a UI-only check.
- Typecheck, lint, and the existing guard scripts (`check-primitives-parity.mjs`, `check-no-local-style-constants.mjs`) on every ticket, consistent with how every ticket in this repo already ships.

## Out of Scope

Deferred, each requiring its own future spec and sequencing decision — not built in this Phase 1:

- **Mandatory or optional GPS capture at checkout.** Judged in the debate session to be real product value (Sudan has no reliable street addressing; a dropped pin is a driver-efficiency win independent of pricing) — but it should ship **with** the Capacitor mobile work, not before it, since native location permissions are far more reliable than browser geolocation. Make it optional at checkout, re-prompted at order confirmation, plus a driver-side "request pin" link — never a hard block on placing an order.
- **`warehouse_supervisor` role and warehouse-scoped RLS.** `profiles.role` already constrains to `customer`/`admin`/`driver` (`supabase/migrations/20260920000000_baseline.sql:1590`) — PRODUCT.md's "single admin role" line is stale, confirmed against the schema directly. The real unpriced cost is **warehouse-scoping**: whether a supervisor should see only their own warehouse's orders/inventory, which means rewriting several existing RLS policies. That's its own decision and its own ticket, not a line item under pricing.
- **Multi-warehouse split-shipment with combined rates.** With 2 warehouses ~800km apart serving largely disjoint regions, a split is a stock-planning failure, not a routing-optimization problem — and the `orders` table has one `shipping_fee`, one status, one ETA, so it cannot represent two shipments without schema changes the original plan never specified. Phase 1's `calculate_delivery_quote` picks the single best Warehouse; if none can fill the cart, the order is flagged for admin review (transfer stock or split manually) rather than auto-splitting.
- **Per-product weight and dimensions.** Volumetric-weight pricing needs weight/dimension data that doesn't exist on any current Product — populating it is a catalog data-entry project across the whole catalog, not a coding task, and the formula must not silently compute on zeros in the meantime (Phase 1's formula omits the weight multiplier until this data exists, or treats missing weight as a configured default, not zero).
- **ETA estimation with staff override and customer notification.** The original plan's ETA/override feature has no customer-notification path specified; deferred alongside GPS until that gap is designed.
- **Full open-source routing engine (OSRM/GraphHopper/Valhalla).** No infrastructure to host it exists in this stack; revisit only if the haversine approximation proves materially wrong in practice (i.e. real complaint volume about delivery fee accuracy, not a hypothetical).

## Further Notes

- This workstream touches `supabase/migrations/`, one new admin page, and the checkout fee-display code path only — it does not touch any file the auth/phone-OTP/Capacitor/push workstreams are touching, so it can run as an independent parallel branch without merge conflict, consistent with the existing "six workstreams, each its own branch" pattern.
- PRODUCT.md should be corrected in the same pass that lands this: it currently claims "single admin role" and lists affiliates/loyalty as "Tier 3, report only, not built," both already false (role CHECK already includes `admin`/`driver`/`customer`; `AffiliatesPage.tsx` and a coupons/affiliate-hub migration are already on `main`). Not part of this spec's tickets, but worth its own quick housekeeping ticket so the doc stops contradicting the codebase.

## Tickets

Spec issue: #34. Tickets (GitHub, label `ready-for-agent`):

| # | Ticket | Blocked by |
|---|--------|-----------|
| #35 | GPS-01 Schema: `warehouses` lat/long + `delivery_pricing_config` table + audit log | — |
| #36 | GPS-02 `calculate_delivery_quote` RPC (haversine + multiplier + caps + fallback) | #35 |
| #37 | GPS-03 Admin Portal: Delivery Pricing config page + quote simulator | #36 |
| #38 | GPS-04 Checkout wiring behind an `app_settings` per-State flag | #36 |

Deferred (tracked as GitHub issues for visibility, not labeled `ready-for-agent` — each needs its own future spec before anyone picks it up):

| # | Item | Depends on / ships with |
|---|--------|-----------|
| #39 | GPS-05 Optional GPS capture (checkout + order confirmation + driver "request pin") | Capacitor mobile workstream |
| #40 | GPS-06 `warehouse_supervisor` role + warehouse-scoped RLS | Own decision |
| #41 | GPS-07 Split-fulfillment "flag for admin" handling | #36, if ever built |
| #42 | GPS-08 Per-product weight/dimensions data entry (not a dev ticket) | Catalog team |

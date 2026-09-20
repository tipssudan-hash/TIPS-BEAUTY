---
status: accepted
date: 2026-09-20
---

# Variant stock is counted per Product, not per Variant

`product_variants` carries its own `stock` column, but warehouse inventory, reservation at checkout, release on cancel, transfers and adjustments are all keyed by Product. When Variants became purchasable (Tier 2), we chose to keep Stock per Product per warehouse: the chosen Variant is recorded on the Order item and can override the price, but it never has its own count. `product_variants.stock` is therefore ignored and must not be read as availability.

## Considered options

- **Per-Variant per-warehouse inventory**: `warehouse_inventory.variant_id`, every stock RPC and admin inventory screen variant-aware. Correct if shades are counted separately, but a Tier-3-sized change across reservation/release/transfer/adjust and the admin portal.
- **Per-Product (chosen)**: no schema shift; matches how the two warehouses are counted today.

## Consequences

- A Product can be sold out of one shade while still showing Stock. Acceptable at current volumes; revisit (supersede this ADR) if staff start counting per shade.
- Any future "variant stock" UI must first migrate the inventory model rather than surfacing `product_variants.stock`.

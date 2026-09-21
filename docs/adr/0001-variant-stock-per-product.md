---
status: accepted
date: 2026-09-20
---

# Variant stock is counted per Product, not per Variant

Variants live on `products.variants` (jsonb; shape `{id, name_ar, name_en?, price?}` since T2-09) and older rows carried a per-Variant `stock` value, but Stock per Warehouse, reservation at checkout, release on cancel, transfers and adjustments are all keyed by Product. When Variants became purchasable (Tier 2), we chose to keep Stock per Product per warehouse: the chosen Variant is recorded on the Order item and can override the price, but it never has its own count. Any per-Variant stock value is therefore ignored and must not be read as availability; the T2-09 shape does not carry one.

## Considered options

- **Per-Variant per-Warehouse Stock**: a `product_variants` table plus `warehouse_inventory.variant_id`, every stock RPC and admin Stock screen variant-aware. Correct if shades are counted separately, but a Tier-3-sized change across reservation/release/transfer/adjust and the admin portal.
- **Per-Product (chosen)**: no schema shift; matches how the two warehouses are counted today.

## Consequences

- A Product can be sold out of one shade while still showing Stock. Acceptable at current volumes; revisit (supersede this ADR) if staff start counting per shade.
- Any future "variant stock" UI must first migrate the Stock model rather than storing a count on the Variant.

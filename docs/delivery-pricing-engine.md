# Delivery Pricing Engine

Migration: `supabase/migrations/20261001001100_delivery_pricing_engine.sql`

## Formula
```
road_distance_km = straight_line_km × road_multiplier
fee = base_fee
      + road_distance_km × per_km_rate
      + total_weight_kg × per_kg_rate
      + extra_warehouse_count × per_extra_warehouse_fee
      + handling_fee
fee = CLAMP(fee, min_fee, max_fee)
```
`road_multiplier` approximates road distance from straight-line distance, so it scales the distance
only (and the ETA), never the fixed fees.

## Variables
| Variable | Source | Description |
|----------|--------|-------------|
| base_fee | delivery_pricing_config | Fixed fee per order |
| straight_line_km | haversine(warehouses, customer_GPS) | See multi-warehouse strategy |
| road_multiplier | delivery_pricing_config | Straight→road approximation |
| per_km_rate | delivery_pricing_config | SDG per (road) km |
| total_weight_kg | Σ products.weight_grams × quantity / 1000 | From product catalog; NULL weight counts as 0 |
| per_kg_rate | delivery_pricing_config | SDG per kg |
| extra_warehouse_count | warehouses_needed − 1 (`resolve_fulfillment_warehouses`) | 0 for single WH |
| per_extra_warehouse_fee | delivery_pricing_config | SDG per extra WH |
| handling_fee | delivery_pricing_config | Fixed packing/handling |
| min_fee / max_fee | delivery_pricing_config | Clamp bounds (max_fee NULL = unbounded) |
| avg_speed_kmh, base_dispatch_minutes | config / warehouse | ETA = dispatch + road_km / speed |

The config row used is the single active global row (no warehouse, zone or state). Missing config raises
an error: there is no hard-coded fallback fee.

## Multi-Warehouse Strategy (Consolidation)
1. Try a single active, GPS-equipped warehouse covering the entire cart (nearest to the customer wins).
2. If none: greedy selection of the warehouse covering the most remaining products. A product's
   quantity is never split across warehouses. If a product cannot be covered, checkout fails with
   `No active warehouse can fulfill this order`.
3. Distance = Σ haversine(wh_i → central_wh) + haversine(central_wh → customer)
4. central_wh = selected warehouse closest to the customer; it is stored as `orders.fulfillment_warehouse_id`.
5. Multi-warehouse orders set `orders.needs_fulfillment_review = true`.

Stock is debited from the warehouse assigned to each product and each reservation row records that
warehouse, so cancellation (`release_order_resources`) restores stock where it was taken.

## GPS Requirement
Customer GPS is MANDATORY. `checkout_order_safe` and `preview_delivery_quote` reject missing or
out-of-range lat/lng, and the checkout UI blocks submission until `gps.status === 'granted'`.
`delivery_zones.latitude/longitude` and `app_settings.dynamic_pricing_states` are deprecated and ignored.
The legacy pin-less `checkout_order_safe` signature raises a clear error.

## RPCs
| Function | Purpose |
|----------|---------|
| `calculate_delivery_quote(uuid[], lat, lng, weight_grams)` | Fee, ETA, source (`dynamic_single`/`dynamic_multi`), warehouse count, road distance |
| `resolve_fulfillment_warehouses(items, lat?, lng?)` | Warehouse set + strategy (`single`/`multi`/`partial_unfulfillable`) |
| `preview_delivery_quote(items, lat, lng)` | Customer-facing preview, same math as checkout |
| `checkout_order_safe(..., lat, lng, ...)` | Creates the order; returns `warehouses_count`, `distance_km` |
| `haversine_km(lat1, lng1, lat2, lng2)` | Great-circle distance |

## Extensibility
- Replace haversine with road distance API: modify `haversine_km` / `calculate_delivery_quote` only
- Add surge pricing: add surge_multiplier column to delivery_pricing_config
- Add zone-based overrides: add warehouse_id matching in config lookup
- Add time-of-day pricing: add time_factor to config

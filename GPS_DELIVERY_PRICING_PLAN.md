# Implementation Plan & Master Prompt: GPS Delivery & Dynamic Pricing Engine

## System Overview

This specification provides an end-to-end implementation guide and master prompt for integrating mandatory customer GPS detection, Sudan administrative cascading selectors, intelligent multi-warehouse fulfillment logic, dynamic delivery pricing driven by portal indicators, and estimated time of arrival (ETA) calculations with staff overrides.

---

## Architecture & Requirements

### 1. User Roles (3 Staff Roles + Customer)

- **`admin` (المدير العام):** Oversees platform operations, manages warehouse configurations, and sets dynamic pricing parameters.
- **`warehouse_supervisor` (مشرف المستودع):** Manages local warehouse inventory, updates dispatch lead times, and adjusts active order ETAs.
- **`driver` (المندوب):** Navigates to customer GPS coordinates and updates delivery milestones.
- **`customer` (العميل):** Grants mandatory GPS access, selects administrative regions, and reviews dynamic shipping quotes.

### 2. Mandatory Geolocation & Location Hierarchy (Checkout)

- **Mandatory Device GPS:** Order placement requires confirmed device coordinates. If location access is denied, clear Arabic guidance prompts the user to enable permissions in browser/device settings.
- **Administrative Cascade:** Dropdown selection for State (**الولاية**) and Locality (**المحلية**), complemented by a free-text field for building numbers and street landmarks.

### 3. Intelligent Multi-Warehouse Fulfillment & Combined Rates

- **Optimal Warehouse Selection:** Evaluate active warehouses holding requested stock against the customer's coordinates.
- **Single-Source Fulfillment:** If the closest warehouse lacks the full requested quantity for an item (e.g., Warehouse A has 3 units, Warehouse B has 4 units, and the order requests 4), prioritize the warehouse capable of fulfilling the entire quantity to minimize split shipments.
- **Multi-Product Consolidation:** When an order spans multiple products, prioritize the warehouse capable of fulfilling all items together.
- **Split-Shipment Combined Rates:** If no single facility can fulfill the entire cart, split fulfillment across the minimum necessary warehouses. Compute distance, weight, and package dimensions per facility, aggregating the individual legs into a unified delivery fee for the customer.

### 4. Dynamic Pricing Engine & Open-Source Mobility Models

- Reference and enhance dynamic routing and pricing mechanisms from open-source ride-hailing and delivery frameworks (e.g., OSRM, GraphHopper, Valhalla, and Uber-style costing models).
- Calculate delivery fees and transit durations using base rates, distance coefficients, transit durations, volumetric weight, and surge/road condition multipliers.
- **Zero Hardcoded Prices:** All formula coefficients and thresholds must be dynamically retrieved from the database (`delivery_pricing_config`).

### 5. ETA Estimation & Disclaimers

- Compute transit durations based on road network distances and average speed profiles.
- Display a clear customer-facing Arabic disclaimer:
  > `"تنبيه: وقت التوصيل المعروض تقديري وقد يختلف حسب حالة الطريق والظروف الجوية"`
  >
- Allow Storage Supervisors and Admins to manually override delivery ETAs on individual orders when operational delays occur.

### 6. Admin Portal Configuration

- Dedicated management interface to configure global and state-specific delivery parameters (Base Fees, Per-KM Rates, Weight Multipliers, Minimum/Maximum Caps, Road Multipliers).
- Real-time simulation tool to test formula outputs against hypothetical delivery scenarios.

---

## Task Checklist

- [ ] Extend `profiles` schema with `warehouse_supervisor` role and `assigned_warehouse_id`
- [ ] Add GPS coordinates (`latitude`, `longitude`) and `base_dispatch_minutes` to `warehouses`
- [ ] Create `delivery_pricing_config` table for dynamic formula parameters
- [ ] Develop fulfillment matching and distance/pricing calculation RPC (`calculate_delivery_quote`)
- [ ] Build Admin Portal page for Delivery Pricing Indicators with quote simulation widget
- [ ] Implement Storefront checkout GPS permission modal and Sudan State/Locality cascading dropdowns
- [ ] Display real-time delivery quote, estimated arrival window, and Arabic disclaimer on checkout
- [ ] Create Storage Supervisor order management dialog for manual ETA adjustments

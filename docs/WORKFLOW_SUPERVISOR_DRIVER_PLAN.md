# Supervisor and Driver Operational Workflow Plan

> **Status:** `/supervisor` is retired in favour of the Admin Portal (`admin-portal/`). The supervisor capabilities below are now provided there to warehouse managers (`profiles.role = 'warehouse_supervisor'`, see [ADMIN_SETUP.md](ADMIN_SETUP.md)). Removing the `src/` code (`SupervisorHomePage.tsx`, `SupervisorLayout.tsx`, `supervisorRepository.ts`, and the `/supervisor` route) is still pending; see §8 of [ADMIN_WAREHOUSES_PURCHASES_CATALOG_PLAN.md](ADMIN_WAREHOUSES_PURCHASES_CATALOG_PLAN.md).

## Supervisor Capabilities
- Full customer details (name, phone, address, map links, direct WhatsApp / Call actions).
- Order processing: Status workflow transitions (New -> Confirmed -> Preparing -> Shipped -> Delivered).
- Delivery notes & timing modification.
- Fleet management: Driver assignment with driver status indicators.
- Real-time product checklist: Large product photos, names, variants, unit prices, line totals, and interactive packing checkboxes.
- Cash collection reconciliation: COD remittance confirmations.
- Warehouse inventory tracking: Reorder alerts, live stock counts, and high-resolution product thumbnails.

## Driver Capabilities
- View assigned deliveries with customer phone & address.
- QR / Barcode scanner for instant delivery verification.
- Mark delivered & confirm COD cash collection.
- End-of-shift COD remittance submission to supervisor.

## Completed Tasks
- [x] Supervisor RPC functions (status updates, delivery notes, driver assignment)
- [x] Supervisor drivers list RPC
- [x] Driver delivery confirmation RPC + automatic COD paid status
- [x] Driver cash remittance and supervisor confirmation RPC
- [x] Admin Portal supervisor delegation table & assignment modal
- [x] Supervisor UI revamp: Clear Sky Counter design theme, max-w-7xl wide layout, large product cards, and packing checklist
- [x] Driver UI: COD collection popup and cash drawer interface


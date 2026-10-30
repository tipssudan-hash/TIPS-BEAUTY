# Admin Portal - Setup Guide

## Status

The Admin Portal is built in `admin-portal/` (Vite + React) and deployed separately (`admin.tips-sd.com`). It uses the same Supabase backend as the Storefront. Staff roles are enforced by RLS and RPCs, and the UI only reflects them.

## Staff Roles

Roles are stored in `public.profiles.role`. The check constraint allows:

| `profiles.role` | Who | Access |
| --- | --- | --- |
| `admin` | Tips Beauty administrators | Everything |
| `warehouse_supervisor` | Warehouse managers (UI label: مدير مستودع) | Only the Warehouses they are granted |
| `driver` | Drivers | Own deliveries and cash remittance |
| `customer` | Default | Storefront only |

A warehouse manager can cover several Warehouses. The grants live in `public.warehouse_manager_access` (`user_id`, `warehouse_id`, `is_primary`). `profiles.assigned_warehouse_id` keeps the primary Warehouse for backward compatibility.

### RPCs

- `get_my_staff_context() RETURNS jsonb` returns `{role, is_admin, is_warehouse_manager, warehouses: [{id, name, code, is_primary}]}`. The Admin Portal calls it at sign-in (`admin-portal/src/lib/adminApi.ts`). Admins receive all active Warehouses.
- `admin_set_warehouse_manager_access(p_user_id uuid, p_warehouse_ids uuid[], p_primary_warehouse_id uuid DEFAULT NULL)` sets the Warehouses a manager covers. Admin only. It is used from the Warehouses and Customers pages.

## Test Accounts

- `scripts/assign-test-roles.sql`: run in the Supabase SQL Editor (runs as `postgres`). It confirms the test emails, sets `profiles.role`, and inserts the matching `warehouse_manager_access` row.
- `scripts/create-test-users.mjs`: creates the test users. Without `SUPABASE_SERVICE_ROLE_KEY` it skips the `warehouse_manager_access` rows; run `scripts/assign-test-roles.sql` to add them.

## Local Development

1. Copy `admin-portal/.env.example` to `admin-portal/.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. Install dependencies with `npm --prefix admin-portal install`.
3. Run `npm --prefix admin-portal run dev`.
4. Checks: `npm --prefix admin-portal run typecheck`, `npm --prefix admin-portal run lint`, `npm --prefix admin-portal run build`.

Schema and migrations are in `supabase/migrations/`. The project plan is `docs/ADMIN_WAREHOUSES_PURCHASES_CATALOG_PLAN.md`.

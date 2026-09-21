-- 0020 Admin writes on storefront_banners (launch step 2).
-- The Tier 1 lockdown (0001) left authenticated with SELECT only on storefront_banners, so the Admin
-- Portal's Banners page — which writes the table directly under the "Admins manage storefront
-- banners" policy, like drivers, warehouses and delivery_zones — failed every save with
-- "permission denied". The policy already restricts writes to is_admin(); the grant was missing.
-- Anonymous readers keep the schedule-filtered SELECT policy; nothing else changes.

GRANT INSERT, UPDATE, DELETE ON TABLE public.storefront_banners TO authenticated;

-- DOWN:
--   REVOKE INSERT, UPDATE, DELETE ON TABLE public.storefront_banners FROM authenticated;

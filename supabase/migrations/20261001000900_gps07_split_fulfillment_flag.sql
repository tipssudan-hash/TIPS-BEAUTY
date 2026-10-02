-- GPS-07: flag orders that no single warehouse can fully fulfil for admin review.
-- Phase 1 sets the flag manually from the admin portal; checkout_order is intentionally unchanged.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS needs_fulfillment_review boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.needs_fulfillment_review IS 'True when no single warehouse holds all requested quantities. Admin must manually arrange transfer or split fulfilment.';

CREATE INDEX IF NOT EXISTS orders_needs_fulfillment_review_idx
  ON public.orders (needs_fulfillment_review, created_at DESC)
  WHERE needs_fulfillment_review;

CREATE OR REPLACE FUNCTION public.admin_get_fulfillment_review_orders()
RETURNS SETOF public.orders
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.orders
  WHERE needs_fulfillment_review = true
    AND public.is_admin()
  ORDER BY created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_get_fulfillment_review_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_fulfillment_review_orders() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_resolve_fulfillment_review(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  UPDATE public.orders SET needs_fulfillment_review = false WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_fulfillment_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_fulfillment_review(uuid) TO authenticated, service_role;

-- DOWN:
--   DROP FUNCTION public.admin_resolve_fulfillment_review(uuid);
--   DROP FUNCTION public.admin_get_fulfillment_review_orders();
--   DROP INDEX public.orders_needs_fulfillment_review_idx;
--   ALTER TABLE public.orders DROP COLUMN needs_fulfillment_review;

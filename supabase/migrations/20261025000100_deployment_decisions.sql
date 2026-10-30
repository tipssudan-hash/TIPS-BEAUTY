-- Decisions from docs/DEPLOYMENT_CHECKLIST_AR.md §11 (see docs/DEPLOYMENT_DECISIONS.md):
--   1. Restocked returns reverse their cost of goods sold in the profit report.
--   2. Orders placed before order_line_costs existed are backfilled with the current cost, flagged as estimated.
--   3. get_public_product_reviews returns 50 reviews when p_limit is NULL and never more than 100.
--   4. Legacy ETA tags are stripped from orders.notes; the original text is kept in orders_notes_eta_backup.
--   5. admin_update_order_operation enforces the packing check and the failed-delivery return before cancelling.

-- 1 + 2 ---------------------------------------------------------------------------------------

ALTER TABLE public.order_line_costs
  ADD COLUMN IF NOT EXISTS is_estimated boolean NOT NULL DEFAULT false;

INSERT INTO public.order_line_costs (order_id, line_no, product_id, variant_id, quantity, unit_cost, is_estimated)
SELECT o.id,
       line.ord::integer,
       (line.item->>'id')::uuid,
       NULLIF(line.item->>'variant_id', ''),
       COALESCE((line.item->>'quantity')::integer, 0),
       COALESCE(p.average_cost, p.cost_price),
       true
FROM public.orders o
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END)
  WITH ORDINALITY AS line(item, ord)
LEFT JOIN public.products p
  ON p.id = CASE WHEN line.item->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 THEN (line.item->>'id')::uuid END
WHERE line.item->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND NOT EXISTS (SELECT 1 FROM public.order_line_costs c WHERE c.order_id = o.id)
ON CONFLICT (order_id, line_no) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_profit_report(p_start date, p_end date, p_warehouse_id uuid DEFAULT NULL)
RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_report jsonb;
BEGIN
  IF p_warehouse_id IS NULL THEN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  ELSIF NOT public.can_manage_warehouse(p_warehouse_id) THEN
    RAISE EXCEPTION 'Warehouse is outside your warehouse scope';
  END IF;

  WITH scoped AS (
    SELECT o.id, o.total, o.items
    FROM public.orders o
    WHERE o.created_at::date BETWEEN p_start AND p_end
      AND o.status NOT IN ('cancelled', 'delivery_failed')
      AND (p_warehouse_id IS NULL OR o.fulfillment_warehouse_id = p_warehouse_id)
  ),
  lines AS (
    SELECT s.id AS order_id,
           (line.item->>'id')::uuid AS product_id,
           COALESCE((line.item->>'quantity')::integer, 0) AS quantity,
           COALESCE((line.item->>'line_total')::numeric, 0) AS line_revenue,
           olc.unit_cost,
           COALESCE(olc.is_estimated, false) AS is_estimated
    FROM scoped s
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.items, '[]'::jsonb)) WITH ORDINALITY AS line(item, ord)
    LEFT JOIN public.order_line_costs olc ON olc.order_id = s.id AND olc.line_no = line.ord::integer
  ),
  restocked AS (
    SELECT (ri.value->>'id')::uuid AS product_id,
           COALESCE((ri.value->>'quantity')::integer, 0) * COALESCE((
             SELECT olc.unit_cost
             FROM public.order_line_costs olc
             WHERE olc.order_id = r.order_id AND olc.product_id = (ri.value->>'id')::uuid
             ORDER BY olc.line_no
             LIMIT 1
           ), 0) AS cost
    FROM public.order_returns r
    JOIN scoped s ON s.id = r.order_id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.items, '[]'::jsonb)) ri
    WHERE r.restocked_at IS NOT NULL
  ),
  refunds AS (
    SELECT COALESCE(SUM(r.refund_amount), 0) AS amount
    FROM public.order_returns r
    JOIN scoped s ON s.id = r.order_id
    WHERE r.status = 'refunded'
  ),
  by_product AS (
    SELECT l.product_id,
           SUM(l.quantity) AS quantity,
           SUM(l.line_revenue) AS revenue,
           COALESCE(SUM(l.quantity * l.unit_cost), 0)
             - COALESCE((SELECT SUM(rs.cost) FROM restocked rs WHERE rs.product_id = l.product_id), 0) AS cogs
    FROM lines l
    GROUP BY l.product_id
  ),
  totals AS (
    SELECT
      COALESCE((SELECT SUM(s.total) FROM scoped s), 0) AS gross_revenue,
      COALESCE((SELECT SUM(l.quantity * l.unit_cost) FROM lines l WHERE l.unit_cost IS NOT NULL), 0) AS gross_cogs,
      COALESCE((SELECT SUM(rs.cost) FROM restocked rs), 0) AS cogs_reversed,
      (SELECT COUNT(*) FROM lines l WHERE l.unit_cost IS NULL)::integer AS missing_cost_lines,
      (SELECT COUNT(*) FROM lines l WHERE l.is_estimated)::integer AS estimated_cost_lines
  )
  SELECT jsonb_build_object(
    'revenue', round(t.gross_revenue - r.amount, 2),
    'refunds', round(r.amount, 2),
    'cogs', round(t.gross_cogs - t.cogs_reversed, 2),
    'cogs_reversed', round(t.cogs_reversed, 2),
    'gross_profit', round(t.gross_revenue - r.amount - (t.gross_cogs - t.cogs_reversed), 2),
    'margin_pct', CASE WHEN t.gross_revenue - r.amount > 0
      THEN round((t.gross_revenue - r.amount - (t.gross_cogs - t.cogs_reversed)) / (t.gross_revenue - r.amount) * 100, 2)
      ELSE NULL END,
    'missing_cost_lines', t.missing_cost_lines,
    'estimated_cost_lines', t.estimated_cost_lines,
    'by_product', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'product_id', b.product_id,
        'product_name', p.name_ar,
        'quantity', b.quantity,
        'revenue', round(b.revenue, 2),
        'cogs', round(b.cogs, 2),
        'gross_profit', round(b.revenue - b.cogs, 2)
      ) ORDER BY b.revenue DESC)
      FROM by_product b
      LEFT JOIN public.products p ON p.id = b.product_id
    ), '[]'::jsonb)
  ) INTO v_report
  FROM totals t, refunds r;

  RETURN COALESCE(v_report, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_profit_report(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_profit_report(date, date, uuid) TO authenticated, service_role;

-- 3 -------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_product_reviews(
  p_product_id uuid,
  p_limit integer DEFAULT NULL,
  p_offset integer DEFAULT 0
) RETURNS TABLE(
  id uuid,
  rating integer,
  comment text,
  image_paths text[],
  reviewer_label text,
  created_at timestamptz,
  verified_purchase boolean,
  total_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT r.id,
         r.rating,
         COALESCE(r.comment, ''),
         COALESCE(r.image_paths, '{}'::text[]),
         COALESCE(NULLIF(r.user_name, ''), 'عميلة تيبس'),
         r.created_at,
         r.is_verified_purchase,
         count(*) OVER ()
  FROM public.reviews r
  WHERE r.product_id = p_product_id
    AND r.status = 'published'
    AND r.is_verified_purchase
  ORDER BY r.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- 4 -------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.orders_notes_eta_backup (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  notes text,
  backed_up_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.orders_notes_eta_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orders_notes_eta_backup FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.orders_notes_eta_backup TO service_role;

INSERT INTO public.orders_notes_eta_backup (order_id, notes)
SELECT o.id, o.notes FROM public.orders o
WHERE o.notes ~ '\[(الموعد المتوقع|تحديث):'
ON CONFLICT (order_id) DO NOTHING;

UPDATE public.orders
SET notes = NULLIF(btrim(regexp_replace(notes, '\[(الموعد المتوقع|تحديث):[^\]]*\]\s*', '', 'g')), '')
WHERE notes ~ '\[(الموعد المتوقع|تحديث):';

-- 5 -------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.internal_admin_update_order_operation(
  p_order_id uuid,
  p_expected_status text,
  p_status text DEFAULT NULL::text,
  p_driver_id uuid DEFAULT NULL::uuid,
  p_warehouse_id uuid DEFAULT NULL::uuid,
  p_note text DEFAULT NULL::text
) RETURNS TABLE(id uuid, status text, driver_id uuid, fulfillment_warehouse_id uuid, updated_at timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_next_status text;
  v_next_driver uuid;
  v_next_warehouse uuid;
  v_driver_warehouse uuid;
  v_driver_status text;
  v_changed boolean := false;
  v_is_credit boolean := false;
BEGIN
  SELECT o.* INTO v_order FROM public.orders AS o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  IF p_expected_status IS NOT NULL AND p_expected_status <> v_order.status THEN
    RAISE EXCEPTION 'This order was updated by another user; reload and try again';
  END IF;

  v_next_status := COALESCE(NULLIF(trim(p_status), ''), v_order.status);
  v_next_driver := COALESCE(p_driver_id, v_order.driver_id);
  v_next_warehouse := COALESCE(p_warehouse_id, v_order.fulfillment_warehouse_id);

  IF p_status IS NOT NULL AND p_status <> v_order.status THEN
    IF NOT (
      (v_order.status = 'new' AND v_next_status IN ('confirmed', 'cancelled')) OR
      (v_order.status = 'confirmed' AND v_next_status IN ('preparing', 'cancelled', 'shipped')) OR
      (v_order.status = 'preparing' AND v_next_status IN ('shipped', 'cancelled')) OR
      (v_order.status = 'shipped' AND v_next_status IN ('delivered', 'delivery_failed')) OR
      (v_order.status = 'delivery_failed' AND v_next_status IN ('confirmed', 'cancelled'))
    ) THEN RAISE EXCEPTION 'This status transition is not allowed'; END IF;

    IF v_next_status = 'shipped' AND v_order.packed_at IS NULL
       AND COALESCE((SELECT s.require_packing_check FROM public.app_settings s WHERE s.id = true), false) THEN
      RAISE EXCEPTION 'Pack the order before it leaves the warehouse';
    END IF;

    IF v_next_status = 'cancelled' AND v_order.status = 'delivery_failed' AND v_order.returned_to_warehouse_at IS NULL THEN
      RAISE EXCEPTION 'Confirm that the failed delivery has returned to the warehouse before cancelling';
    END IF;

    IF v_next_status = 'delivered' AND v_order.payment_status <> 'paid' THEN
      IF v_order.customer_id IS NOT NULL THEN
        SELECT p.is_credit_customer INTO v_is_credit
        FROM public.profiles AS p
        WHERE p.id = v_order.customer_id;
      END IF;

      IF NOT COALESCE(v_is_credit, false) THEN
        RAISE EXCEPTION 'لا يمكن تسليم الطلب قبل تأكيد الدفع. يرجى تأكيد استلام المبلغ (نقداً أو تحويل) أولاً.';
      END IF;
    END IF;
  END IF;

  IF (p_driver_id IS NOT NULL AND p_driver_id IS DISTINCT FROM v_order.driver_id)
     OR (p_warehouse_id IS NOT NULL AND p_warehouse_id IS DISTINCT FROM v_order.fulfillment_warehouse_id) THEN
    IF v_order.status NOT IN ('new', 'confirmed', 'preparing', 'delivery_failed') THEN
      RAISE EXCEPTION 'Assignments cannot change after delivery has started';
    END IF;
  END IF;

  IF p_warehouse_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.warehouses AS w WHERE w.id = p_warehouse_id AND w.is_active) THEN
    RAISE EXCEPTION 'Selected warehouse is not active';
  END IF;

  IF p_driver_id IS NOT NULL THEN
    SELECT d.warehouse_id, d.status INTO v_driver_warehouse, v_driver_status
    FROM public.drivers AS d WHERE d.id = p_driver_id FOR UPDATE;
    IF NOT FOUND OR v_driver_status NOT IN ('active', 'busy') THEN
      RAISE EXCEPTION 'Selected driver is not available';
    END IF;
    IF v_driver_warehouse IS NOT NULL AND v_next_warehouse IS NOT NULL AND v_driver_warehouse <> v_next_warehouse THEN
      RAISE EXCEPTION 'Selected driver is assigned to another warehouse';
    END IF;
  END IF;

  IF v_next_status = 'shipped' AND v_next_driver IS NULL THEN
    RAISE EXCEPTION 'Assign a driver before starting delivery';
  END IF;

  UPDATE public.orders AS o
  SET status = v_next_status,
      driver_id = v_next_driver,
      fulfillment_warehouse_id = v_next_warehouse
  WHERE o.id = v_order.id
  RETURNING
    o.status <> v_order.status
      OR o.driver_id IS DISTINCT FROM v_order.driver_id
      OR o.fulfillment_warehouse_id IS DISTINCT FROM v_order.fulfillment_warehouse_id,
    o.id, o.status, o.driver_id, o.fulfillment_warehouse_id, timezone('utc', now())
  INTO v_changed, id, status, driver_id, fulfillment_warehouse_id, updated_at;

  IF v_changed THEN
    INSERT INTO public.order_status_history(order_id, status, note, changed_by)
    VALUES (
      v_order.id, v_next_status,
      COALESCE(
        NULLIF(trim(p_note), ''),
        CASE WHEN v_next_status <> v_order.status
          THEN 'تم التحديث من لوحة الإدارة'
          ELSE 'تم تحديث تعيين التجهيز أو المندوب من لوحة الإدارة'
        END
      ),
      auth.uid()
    );
  END IF;

  IF v_next_status = 'cancelled' AND v_order.status <> 'cancelled' THEN
    PERFORM public.release_order_resources(v_order.id);
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.internal_admin_update_order_operation(uuid, text, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_admin_update_order_operation(uuid, text, text, uuid, uuid, text) TO service_role;

-- DOWN (manual):
--   Restore internal_admin_update_order_operation() from 20261018000800_admin_verify_payment_atomic.sql.
--   UPDATE public.orders o SET notes = b.notes FROM public.orders_notes_eta_backup b WHERE b.order_id = o.id;
--   DROP TABLE public.orders_notes_eta_backup;
--   Restore get_public_product_reviews() from 20261023000200_paginated_product_reviews.sql.
--   Restore admin_profit_report() from 20261020000400_order_line_costs_profit_report.sql.
--   DELETE FROM public.order_line_costs WHERE is_estimated; ALTER TABLE public.order_line_costs DROP COLUMN is_estimated;

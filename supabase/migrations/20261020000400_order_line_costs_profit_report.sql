-- Phase 3: cost of goods sold per order line, captured when the order is created, and the admin profit report.

CREATE TABLE public.order_line_costs (
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  product_id uuid NOT NULL,
  variant_id text,
  quantity integer NOT NULL,
  unit_cost numeric(14,4),
  PRIMARY KEY (order_id, line_no)
);

ALTER TABLE public.order_line_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and scoped managers view order line costs" ON public.order_line_costs
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_line_costs.order_id
        AND o.fulfillment_warehouse_id = ANY ((SELECT public.my_warehouse_ids())::uuid[])
    )
  );

REVOKE ALL ON public.order_line_costs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.order_line_costs TO authenticated;
GRANT ALL ON public.order_line_costs TO service_role;

CREATE OR REPLACE FUNCTION public.record_order_line_costs() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF jsonb_typeof(NEW.items) = 'array' THEN
    INSERT INTO public.order_line_costs (order_id, line_no, product_id, variant_id, quantity, unit_cost)
    SELECT NEW.id,
           line.ord::integer,
           (line.item->>'id')::uuid,
           NULLIF(line.item->>'variant_id', ''),
           COALESCE((line.item->>'quantity')::integer, 0),
           COALESCE(p.average_cost, p.cost_price)
    FROM jsonb_array_elements(NEW.items) WITH ORDINALITY AS line(item, ord)
    LEFT JOIN public.products p ON p.id = (line.item->>'id')::uuid
    ON CONFLICT (order_id, line_no) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_record_line_costs
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.record_order_line_costs();

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
           olc.unit_cost
    FROM scoped s
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.items, '[]'::jsonb)) WITH ORDINALITY AS line(item, ord)
    LEFT JOIN public.order_line_costs olc ON olc.order_id = s.id AND olc.line_no = line.ord::integer
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
           COALESCE(SUM(l.quantity * l.unit_cost), 0) AS cogs
    FROM lines l
    GROUP BY l.product_id
  ),
  totals AS (
    SELECT
      COALESCE((SELECT SUM(s.total) FROM scoped s), 0) AS gross_revenue,
      COALESCE((SELECT SUM(l.quantity * l.unit_cost) FROM lines l WHERE l.unit_cost IS NOT NULL), 0) AS cogs,
      (SELECT COUNT(*) FROM lines l WHERE l.unit_cost IS NULL)::integer AS missing_cost_lines
  )
  SELECT jsonb_build_object(
    'revenue', round(t.gross_revenue - r.amount, 2),
    'refunds', round(r.amount, 2),
    'cogs', round(t.cogs, 2),
    'gross_profit', round(t.gross_revenue - r.amount - t.cogs, 2),
    'margin_pct', CASE WHEN t.gross_revenue - r.amount > 0
      THEN round((t.gross_revenue - r.amount - t.cogs) / (t.gross_revenue - r.amount) * 100, 2)
      ELSE NULL END,
    'missing_cost_lines', t.missing_cost_lines,
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

REVOKE ALL ON FUNCTION public.record_order_line_costs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_profit_report(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_profit_report(date, date, uuid) TO authenticated, service_role;

-- DOWN (manual):
--   DROP FUNCTION public.admin_profit_report(date, date, uuid);
--   DROP TRIGGER orders_record_line_costs ON public.orders; DROP FUNCTION public.record_order_line_costs();
--   DROP TABLE public.order_line_costs;

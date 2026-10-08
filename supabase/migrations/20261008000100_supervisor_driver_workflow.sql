-- 20261008000100_supervisor_driver_workflow.sql
-- Supervisor & Driver Operational Workflow & Cash Accounting

CREATE OR REPLACE FUNCTION public.get_my_deliveries(p_order_id uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid, order_number text, status text, created_at timestamp with time zone, status_changed_at timestamp with time zone,
  customer_name text, phone text, shipping_address text, city text, state text, notes text,
  items jsonb, item_count integer, payment_method text, cod_amount numeric, warehouse_name text
)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH me AS (
    SELECT d.id FROM public.drivers d WHERE d.user_id = (SELECT auth.uid()) AND public.is_driver()
  )
  SELECT o.id, o.order_number, o.status, o.created_at,
         (SELECT max(h.created_at) FROM public.order_status_history h WHERE h.order_id = o.id),
         o.customer_name, o.phone, o.shipping_address, o.city, o.state, o.notes,
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'product_id', i->>'id',
              'name_ar', i->>'name_ar',
              'variant_name', i->>'variant_name',
              'quantity', (i->>'quantity')::integer,
              'unit_price', (i->>'effective_unit_price')::numeric,
              'line_total', (i->>'line_total')::numeric
           ) ORDER BY ord)
           FROM jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) WITH ORDINALITY t(i, ord)), '[]'::jsonb),
         (SELECT COALESCE(sum((i->>'quantity')::integer), 0)::integer FROM jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) i),
         o.payment_method,
         CASE WHEN o.payment_method = 'COD' AND o.payment_status = 'pending' THEN o.total END,
         w.name
  FROM public.orders o
  JOIN me ON o.driver_id = me.id
  LEFT JOIN public.warehouses w ON w.id = o.fulfillment_warehouse_id
  WHERE (p_order_id IS NULL OR o.id = p_order_id)
    AND (
      o.status IN ('confirmed', 'preparing', 'shipped')
      OR (o.status IN ('delivered', 'delivery_failed') AND o.id IN (
            SELECT h.order_id FROM public.order_status_history h WHERE h.order_id = o.id AND h.status = o.status AND h.created_at > now() - interval '24 hours'))
      OR p_order_id IS NOT NULL
    )
  ORDER BY CASE o.status WHEN 'shipped' THEN 0 WHEN 'preparing' THEN 1 WHEN 'confirmed' THEN 2 ELSE 3 END, o.created_at;
$$;

REVOKE ALL ON FUNCTION public.get_my_deliveries(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_deliveries(uuid) TO authenticated, service_role;

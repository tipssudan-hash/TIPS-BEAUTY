-- GPS-04: preview_delivery_quote — a side-effect-free preview of checkout_order's shipping fee,
-- so Checkout can show the live quote before the customer places the order.
-- Spec: docs/specs/gps-delivery-pricing.md. Ticket: GitHub #38. Depends on #35, #36.

-- Mirrors checkout_order's warehouse-selection + delivery_zones lookup (see
-- 20261001000200_gps_delivery_quote_rpc.sql), then defers to the same calculate_delivery_quote
-- RPC checkout_order calls, so a preview can never show a number the real order wouldn't also
-- charge. Deliberately duplicates that one block rather than extracting a shared helper —
-- checkout_order is the most load-bearing function in this schema and already rewritten once
-- this round (GPS-02); a second structural change to it is not worth the risk for a read-only
-- preview. Keep both in sync if the warehouse-selection logic ever changes.
--
-- Differs from checkout_order on purpose: never raises when no warehouse can fulfil the cart or
-- no zone matches p_city. A preview should degrade to the flat fee and let the real submission
-- surface that problem properly, not block the customer from seeing any estimate at all.
CREATE OR REPLACE FUNCTION public.preview_delivery_quote(
  p_city text,
  p_state text,
  p_items jsonb
) RETURNS TABLE(fee numeric, eta_minutes integer, source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_warehouse_id uuid;
  v_has_warehouse_inventory boolean;
  v_zone_id uuid;
  v_zone_fee numeric;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.warehouse_inventory) INTO v_has_warehouse_inventory;

  IF v_has_warehouse_inventory THEN
    SELECT w.id INTO v_warehouse_id FROM public.warehouses w WHERE w.is_active AND NOT EXISTS (
      SELECT 1 FROM (
        SELECT (ci->>'id')::uuid AS product_id, SUM((ci->>'quantity')::integer) AS quantity
        FROM jsonb_array_elements(p_items) ci GROUP BY 1
      ) need
      WHERE NOT EXISTS (
        SELECT 1 FROM public.warehouse_inventory wi
        WHERE wi.warehouse_id = w.id AND wi.product_id = need.product_id AND wi.quantity >= need.quantity
      )
    )
    ORDER BY CASE WHEN lower(w.city) = lower(coalesce(p_city, '')) THEN 0 ELSE 1 END,
             CASE WHEN lower(w.state) = lower(coalesce(p_state, '')) THEN 0 ELSE 1 END,
             w.created_at LIMIT 1;
    -- No exception here if v_warehouse_id is null, unlike checkout_order — fall through to the
    -- flat-fee branch below instead of blocking the preview.
  END IF;

  SELECT dz.id, dz.fee INTO v_zone_id, v_zone_fee FROM public.delivery_zones dz WHERE dz.name = p_city AND dz.is_active = true LIMIT 1;

  IF v_zone_id IS NOT NULL AND v_warehouse_id IS NOT NULL THEN
    RETURN QUERY SELECT * FROM public.calculate_delivery_quote(v_warehouse_id, v_zone_id, 0);
    RETURN;
  END IF;

  RETURN QUERY SELECT COALESCE(v_zone_fee, 1500), NULL::integer, 'flat_fee'::text;
END;
$$;

ALTER FUNCTION public.preview_delivery_quote(text, text, jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.preview_delivery_quote(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_delivery_quote(text, text, jsonb) TO authenticated, service_role;

-- DOWN (manual):
--   DROP FUNCTION public.preview_delivery_quote(text, text, jsonb);

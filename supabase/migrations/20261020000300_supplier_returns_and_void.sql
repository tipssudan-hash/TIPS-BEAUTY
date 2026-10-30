-- Phase 3: supplier returns (stock out at weighted average cost) and voiding purchase invoices.

CREATE SEQUENCE public.supplier_return_number_seq;
CREATE TABLE public.supplier_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number text NOT NULL UNIQUE DEFAULT ('SR-' || to_char(timezone('utc', now()), 'YYYY') || '-' || lpad(nextval('public.supplier_return_number_seq')::text, 6, '0')),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  purchase_invoice_id uuid REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','cancelled')),
  reason text NOT NULL,
  is_void_reversal boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  approved_by uuid REFERENCES auth.users(id), approved_at timestamptz
);

CREATE TABLE public.supplier_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.supplier_returns(id) ON DELETE CASCADE,
  purchase_invoice_item_id uuid REFERENCES public.purchase_invoice_items(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  variant_id text,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost numeric(14,4) NOT NULL CHECK (unit_cost >= 0)
);
CREATE INDEX supplier_return_items_invoice_item_idx ON public.supplier_return_items (purchase_invoice_item_id);

CREATE TRIGGER supplier_returns_guard
  BEFORE UPDATE OR DELETE ON public.supplier_returns
  FOR EACH ROW EXECUTE FUNCTION public.purchase_documents_guard();

CREATE TRIGGER supplier_return_items_guard
  BEFORE UPDATE OR DELETE ON public.supplier_return_items
  FOR EACH ROW EXECUTE FUNCTION public.purchase_documents_guard();

ALTER TABLE public.supplier_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and scoped managers view supplier returns" ON public.supplier_returns
  FOR SELECT TO authenticated
  USING (public.is_admin() OR warehouse_id = ANY ((SELECT public.my_warehouse_ids())::uuid[]));

CREATE POLICY "View items of visible supplier returns" ON public.supplier_return_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supplier_returns r WHERE r.id = supplier_return_items.return_id));

REVOKE ALL ON public.supplier_returns, public.supplier_return_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.supplier_returns, public.supplier_return_items TO authenticated;
GRANT ALL ON public.supplier_returns, public.supplier_return_items TO service_role;
REVOKE ALL ON SEQUENCE public.supplier_return_number_seq FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.purchase_apply_supplier_return(p_return_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_return public.supplier_returns%ROWTYPE;
  v_invoice_status text;
  v_product record;
  v_line record;
  v_stock integer;
  v_average numeric;
  v_cost_price numeric;
  v_quantity_before integer;
  v_unit_cost numeric;
  v_new_average numeric;
BEGIN
  PERFORM set_config('app.purchase_rpc', 'on', true);

  SELECT * INTO v_return FROM public.supplier_returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier return not found'; END IF;
  IF v_return.status <> 'draft' THEN RAISE EXCEPTION 'Only draft returns can be approved'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supplier_return_items r WHERE r.return_id = p_return_id) THEN
    RAISE EXCEPTION 'Return has no items';
  END IF;

  IF v_return.purchase_invoice_id IS NOT NULL THEN
    SELECT i.status INTO v_invoice_status FROM public.purchase_invoices i WHERE i.id = v_return.purchase_invoice_id;
    IF v_invoice_status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'The linked purchase invoice is no longer approved';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT ri.purchase_invoice_item_id, SUM(ri.quantity) AS current_quantity
      FROM public.supplier_return_items ri
      WHERE ri.return_id = p_return_id AND ri.purchase_invoice_item_id IS NOT NULL
      GROUP BY ri.purchase_invoice_item_id
    ) c
    JOIN public.purchase_invoice_items pii ON pii.id = c.purchase_invoice_item_id
    WHERE c.current_quantity + COALESCE((
      SELECT SUM(prev.quantity)
      FROM public.supplier_return_items prev
      JOIN public.supplier_returns sr ON sr.id = prev.return_id
      WHERE prev.purchase_invoice_item_id = pii.id AND sr.status = 'approved'
    ), 0) > pii.quantity
  ) THEN
    RAISE EXCEPTION 'Returned quantity exceeds the quantity received on the purchase invoice';
  END IF;

  FOR v_product IN
    SELECT ri.product_id, SUM(ri.quantity)::integer AS quantity, SUM(ri.quantity * ri.unit_cost) AS cost_sum
    FROM public.supplier_return_items ri
    WHERE ri.return_id = p_return_id
    GROUP BY ri.product_id
    ORDER BY ri.product_id
  LOOP
    SELECT COALESCE(p.stock, 0), p.average_cost, p.cost_price
    INTO v_stock, v_average, v_cost_price
    FROM public.products p
    WHERE p.id = v_product.product_id
    FOR UPDATE;

    v_quantity_before := GREATEST(v_stock, 0);
    v_unit_cost := v_product.cost_sum / v_product.quantity;

    IF v_quantity_before - v_product.quantity > 0 THEN
      v_new_average := round(
        (v_quantity_before * COALESCE(v_average, v_cost_price, v_unit_cost) - v_product.cost_sum)
        / (v_quantity_before - v_product.quantity), 4);
    ELSE
      v_new_average := round(COALESCE(v_average, v_cost_price, v_unit_cost), 4);
    END IF;

    UPDATE public.warehouse_inventory
    SET quantity = quantity - v_product.quantity,
        updated_at = timezone('utc', now())
    WHERE warehouse_id = v_return.warehouse_id
      AND product_id = v_product.product_id
      AND quantity >= v_product.quantity;
    IF NOT FOUND THEN RAISE EXCEPTION 'المخزون غير كافٍ'; END IF;

    INSERT INTO public.product_cost_history (
      product_id, source_type, source_id, quantity_on_hand_before, quantity_delta,
      unit_cost, previous_average_cost, new_average_cost, created_by
    ) VALUES (
      v_product.product_id, 'supplier_return', p_return_id, v_quantity_before, -v_product.quantity,
      round(v_unit_cost, 4), v_average, v_new_average, auth.uid()
    );

    UPDATE public.products
    SET average_cost = v_new_average,
        average_cost_updated_at = timezone('utc', now())
    WHERE id = v_product.product_id;
  END LOOP;

  FOR v_line IN
    SELECT ri.product_id, ri.quantity, ri.unit_cost
    FROM public.supplier_return_items ri
    WHERE ri.return_id = p_return_id
    ORDER BY ri.product_id
  LOOP
    INSERT INTO public.inventory_movements (warehouse_id, product_id, quantity_delta, movement_type, note, reference_id, created_by, unit_cost)
    VALUES (v_return.warehouse_id, v_line.product_id, -v_line.quantity, 'supplier_return',
            'مرتجع للمورد ' || v_return.return_number, p_return_id, auth.uid(), v_line.unit_cost);
  END LOOP;

  UPDATE public.supplier_returns
  SET status = 'approved',
      approved_by = auth.uid(),
      approved_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  WHERE id = p_return_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_supplier_return_draft(
  p_supplier_id uuid,
  p_warehouse_id uuid,
  p_reason text,
  p_items jsonb,
  p_id uuid DEFAULT NULL,
  p_purchase_invoice_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_current public.supplier_returns%ROWTYPE;
  v_item jsonb;
  v_line integer;
  v_invoice_item public.purchase_invoice_items%ROWTYPE;
  v_has_invoice_item boolean;
  v_product public.products%ROWTYPE;
  v_product_id uuid;
  v_variant_id text;
  v_quantity integer;
  v_unit_cost numeric;
  v_id uuid := p_id;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.can_manage_warehouse(p_warehouse_id) THEN RAISE EXCEPTION 'Warehouse is outside your warehouse scope'; END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'A return reason is required'; END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_current FROM public.supplier_returns WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Supplier return not found'; END IF;
    IF v_current.status <> 'draft' THEN RAISE EXCEPTION 'Only draft returns can be edited'; END IF;
    IF NOT public.can_manage_warehouse(v_current.warehouse_id) THEN RAISE EXCEPTION 'Return is outside your warehouse scope'; END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = p_supplier_id) THEN RAISE EXCEPTION 'Supplier not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = p_warehouse_id) THEN RAISE EXCEPTION 'Warehouse not found'; END IF;
  IF p_purchase_invoice_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.purchase_invoices i
    WHERE i.id = p_purchase_invoice_id
      AND i.status = 'approved'
      AND i.supplier_id = p_supplier_id
      AND i.warehouse_id = p_warehouse_id
  ) THEN
    RAISE EXCEPTION 'Purchase invoice must be approved and match the supplier and warehouse';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Return items must be an array'; END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'A return needs between 1 and 200 items'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.supplier_returns (supplier_id, warehouse_id, purchase_invoice_id, reason, notes, created_by)
    VALUES (p_supplier_id, p_warehouse_id, p_purchase_invoice_id, btrim(p_reason),
            NULLIF(btrim(COALESCE(p_notes, '')), ''), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.supplier_returns SET
      supplier_id = p_supplier_id,
      warehouse_id = p_warehouse_id,
      purchase_invoice_id = p_purchase_invoice_id,
      reason = btrim(p_reason),
      notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
      updated_at = timezone('utc', now())
    WHERE id = v_id;
    DELETE FROM public.supplier_return_items WHERE return_id = v_id;
  END IF;

  v_line := 0;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_line := v_line + 1;
    v_has_invoice_item := NULLIF(v_item->>'purchase_invoice_item_id', '') IS NOT NULL;
    v_invoice_item := NULL;
    IF v_has_invoice_item THEN
      SELECT * INTO v_invoice_item FROM public.purchase_invoice_items i WHERE i.id = (v_item->>'purchase_invoice_item_id')::uuid;
      IF NOT FOUND OR v_invoice_item.invoice_id IS DISTINCT FROM p_purchase_invoice_id THEN
        RAISE EXCEPTION 'Line % does not belong to the linked purchase invoice', v_line;
      END IF;
    END IF;

    v_product_id := COALESCE(NULLIF(v_item->>'product_id', '')::uuid, v_invoice_item.product_id);
    IF v_has_invoice_item AND v_product_id IS DISTINCT FROM v_invoice_item.product_id THEN
      RAISE EXCEPTION 'Line % product does not match the purchase invoice line', v_line;
    END IF;
    SELECT * INTO v_product FROM public.products p WHERE p.id = v_product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Line % product not found', v_line; END IF;

    v_quantity := COALESCE((v_item->>'quantity')::integer, 0);
    IF v_quantity <= 0 THEN RAISE EXCEPTION 'Line % quantity must be a positive whole number', v_line; END IF;

    v_variant_id := COALESCE(NULLIF(btrim(COALESCE(v_item->>'variant_id', '')), ''), v_invoice_item.variant_id);
    IF v_variant_id IS NULL AND jsonb_array_length(COALESCE(v_product.variants, '[]'::jsonb)) > 0 THEN
      RAISE EXCEPTION 'Line % requires a variant', v_line;
    END IF;
    IF v_variant_id IS NOT NULL AND public.product_variant(v_product.variants, v_variant_id) IS NULL THEN
      RAISE EXCEPTION 'Line % variant is not valid for this product', v_line;
    END IF;

    v_unit_cost := COALESCE(
      NULLIF(v_item->>'unit_cost', '')::numeric,
      v_invoice_item.landed_unit_cost,
      v_product.average_cost,
      v_product.cost_price,
      0
    );
    IF v_unit_cost < 0 THEN RAISE EXCEPTION 'Line % unit cost must be zero or more', v_line; END IF;

    INSERT INTO public.supplier_return_items (return_id, purchase_invoice_item_id, product_id, variant_id, quantity, unit_cost)
    VALUES (v_id, CASE WHEN v_has_invoice_item THEN v_invoice_item.id END, v_product.id, v_variant_id, v_quantity, v_unit_cost);
  END LOOP;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_supplier_return(p_return_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_warehouse_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT r.warehouse_id INTO v_warehouse_id FROM public.supplier_returns r WHERE r.id = p_return_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier return not found'; END IF;
  IF NOT public.can_manage_warehouse(v_warehouse_id) THEN RAISE EXCEPTION 'Return is outside your warehouse scope'; END IF;

  PERFORM public.purchase_apply_supplier_return(p_return_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_supplier_return(p_return_id uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_return public.supplier_returns%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'A cancellation reason is required'; END IF;

  SELECT * INTO v_return FROM public.supplier_returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier return not found'; END IF;
  IF NOT public.can_manage_warehouse(v_return.warehouse_id) THEN RAISE EXCEPTION 'Return is outside your warehouse scope'; END IF;
  IF v_return.status <> 'draft' THEN RAISE EXCEPTION 'Only draft returns can be cancelled'; END IF;

  PERFORM set_config('app.purchase_rpc', 'on', true);

  UPDATE public.supplier_returns
  SET status = 'cancelled',
      notes = concat_ws(E'\n', notes, 'إلغاء: ' || btrim(p_reason)),
      updated_at = timezone('utc', now())
  WHERE id = p_return_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_purchase_invoice(p_invoice_id uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_invoice public.purchase_invoices%ROWTYPE;
  v_return_id uuid;
  v_item record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'A void reason is required'; END IF;

  SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase invoice not found'; END IF;
  IF v_invoice.status = 'voided' THEN RAISE EXCEPTION 'Purchase invoice is already voided'; END IF;

  IF v_invoice.status = 'draft' THEN
    IF NOT public.can_manage_warehouse(v_invoice.warehouse_id) THEN RAISE EXCEPTION 'Invoice is outside your warehouse scope'; END IF;
  ELSE
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only administrators can void an approved invoice'; END IF;
  END IF;

  PERFORM set_config('app.purchase_rpc', 'on', true);

  IF v_invoice.status = 'approved' AND EXISTS (
    SELECT 1
    FROM public.purchase_invoice_items i
    WHERE i.invoice_id = p_invoice_id
      AND i.quantity > COALESCE((
        SELECT SUM(ri.quantity)
        FROM public.supplier_return_items ri
        JOIN public.supplier_returns sr ON sr.id = ri.return_id
        WHERE ri.purchase_invoice_item_id = i.id AND sr.status = 'approved'
      ), 0)
  ) THEN
    INSERT INTO public.supplier_returns (supplier_id, warehouse_id, purchase_invoice_id, status, reason, is_void_reversal, created_by)
    VALUES (v_invoice.supplier_id, v_invoice.warehouse_id, p_invoice_id, 'draft',
            'إلغاء فاتورة ' || v_invoice.invoice_number || ': ' || btrim(p_reason), true, auth.uid())
    RETURNING id INTO v_return_id;

    FOR v_item IN
      SELECT i.id, i.product_id, i.variant_id,
             i.quantity - COALESCE((
               SELECT SUM(ri.quantity)
               FROM public.supplier_return_items ri
               JOIN public.supplier_returns sr ON sr.id = ri.return_id
               WHERE ri.purchase_invoice_item_id = i.id AND sr.status = 'approved'
             ), 0) AS remaining,
             COALESCE(i.landed_unit_cost, i.unit_cost) AS unit_cost
      FROM public.purchase_invoice_items i
      WHERE i.invoice_id = p_invoice_id
      ORDER BY i.line_no
    LOOP
      IF v_item.remaining > 0 THEN
        INSERT INTO public.supplier_return_items (return_id, purchase_invoice_item_id, product_id, variant_id, quantity, unit_cost)
        VALUES (v_return_id, v_item.id, v_item.product_id, v_item.variant_id, v_item.remaining, v_item.unit_cost);
      END IF;
    END LOOP;

    PERFORM public.purchase_apply_supplier_return(v_return_id);
  END IF;

  UPDATE public.purchase_invoices
  SET status = 'voided',
      voided_by = auth.uid(),
      voided_at = timezone('utc', now()),
      void_reason = btrim(p_reason),
      updated_at = timezone('utc', now())
  WHERE id = p_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_apply_supplier_return(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_apply_supplier_return(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.save_supplier_return_draft(uuid, uuid, text, jsonb, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_supplier_return_draft(uuid, uuid, text, jsonb, uuid, uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_supplier_return(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_supplier_return(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_supplier_return(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_supplier_return(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.void_purchase_invoice(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_purchase_invoice(uuid, text) TO authenticated, service_role;

-- DOWN (manual):
--   DROP FUNCTION public.void_purchase_invoice(uuid, text); DROP FUNCTION public.cancel_supplier_return(uuid, text);
--   DROP FUNCTION public.approve_supplier_return(uuid); DROP FUNCTION public.save_supplier_return_draft(uuid, uuid, text, jsonb, uuid, uuid, text);
--   DROP FUNCTION public.purchase_apply_supplier_return(uuid);
--   DROP TABLE public.supplier_return_items, public.supplier_returns; DROP SEQUENCE public.supplier_return_number_seq;

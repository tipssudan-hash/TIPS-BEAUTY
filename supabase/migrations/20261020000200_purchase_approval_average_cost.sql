-- Phase 3: approving a purchase invoice receives stock at landed cost and updates each product's weighted average cost.

CREATE OR REPLACE FUNCTION public.approve_purchase_invoice(p_invoice_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_invoice public.purchase_invoices%ROWTYPE;
  v_product record;
  v_line record;
  v_stock integer;
  v_average numeric;
  v_cost_price numeric;
  v_quantity_before integer;
  v_unit_cost numeric;
  v_new_average numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase invoice not found'; END IF;

  IF NOT (public.is_warehouse_manager() AND v_invoice.warehouse_id = ANY ((SELECT public.my_warehouse_ids())::uuid[])) THEN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Invoice is outside your warehouse scope'; END IF;
    IF EXISTS (SELECT 1 FROM public.warehouse_manager_access a WHERE a.warehouse_id = v_invoice.warehouse_id) THEN
      RAISE EXCEPTION 'This warehouse has a manager, who must approve the invoice';
    END IF;
  END IF;

  IF v_invoice.status <> 'draft' THEN RAISE EXCEPTION 'Only draft invoices can be approved'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.purchase_invoice_items i WHERE i.invoice_id = p_invoice_id) THEN
    RAISE EXCEPTION 'Invoice has no items';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.purchase_invoice_attachments a WHERE a.invoice_id = p_invoice_id) THEN
    RAISE EXCEPTION 'Attach the supplier invoice file before approval';
  END IF;

  PERFORM set_config('app.purchase_rpc', 'on', true);

  UPDATE public.purchase_invoice_items i
  SET landed_unit_cost = round(
    i.unit_cost + CASE
      WHEN v_invoice.subtotal = 0 THEN 0
      ELSE ((v_invoice.extra_costs - v_invoice.discount_amount) * i.line_total / v_invoice.subtotal) / i.quantity
    END, 4)
  WHERE i.invoice_id = p_invoice_id;

  FOR v_product IN
    SELECT l.product_id, SUM(l.quantity)::integer AS quantity, SUM(l.quantity * l.landed_unit_cost) AS cost_sum
    FROM public.purchase_invoice_items l
    WHERE l.invoice_id = p_invoice_id
    GROUP BY l.product_id
    ORDER BY l.product_id
  LOOP
    SELECT COALESCE(p.stock, 0), p.average_cost, p.cost_price
    INTO v_stock, v_average, v_cost_price
    FROM public.products p
    WHERE p.id = v_product.product_id
    FOR UPDATE;

    v_quantity_before := GREATEST(v_stock, 0);
    v_unit_cost := v_product.cost_sum / v_product.quantity;
    v_new_average := round(
      (v_quantity_before * COALESCE(v_average, v_cost_price, v_unit_cost) + v_product.cost_sum)
      / (v_quantity_before + v_product.quantity), 4);

    INSERT INTO public.product_cost_history (
      product_id, source_type, source_id, quantity_on_hand_before, quantity_delta,
      unit_cost, previous_average_cost, new_average_cost, created_by
    ) VALUES (
      v_product.product_id, 'purchase_invoice', p_invoice_id, v_quantity_before, v_product.quantity,
      round(v_unit_cost, 4), v_average, v_new_average, auth.uid()
    );

    INSERT INTO public.warehouse_inventory (warehouse_id, product_id, quantity, updated_at)
    VALUES (v_invoice.warehouse_id, v_product.product_id, v_product.quantity, timezone('utc', now()))
    ON CONFLICT (warehouse_id, product_id) DO UPDATE
      SET quantity = public.warehouse_inventory.quantity + EXCLUDED.quantity,
          updated_at = timezone('utc', now());

    UPDATE public.products
    SET average_cost = v_new_average,
        average_cost_updated_at = timezone('utc', now())
    WHERE id = v_product.product_id;
  END LOOP;

  FOR v_line IN
    SELECT l.product_id, l.quantity, l.landed_unit_cost
    FROM public.purchase_invoice_items l
    WHERE l.invoice_id = p_invoice_id
    ORDER BY l.line_no
  LOOP
    INSERT INTO public.inventory_movements (warehouse_id, product_id, quantity_delta, movement_type, note, reference_id, created_by, unit_cost)
    VALUES (v_invoice.warehouse_id, v_line.product_id, v_line.quantity, 'purchase_receipt',
            'استلام فاتورة ' || v_invoice.invoice_number, p_invoice_id, auth.uid(), v_line.landed_unit_cost);
  END LOOP;

  UPDATE public.purchase_invoices
  SET status = 'approved',
      approved_by = auth.uid(),
      approved_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  WHERE id = p_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_purchase_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_purchase_invoice(uuid) TO authenticated, service_role;

-- DOWN (manual):
--   DROP FUNCTION public.approve_purchase_invoice(uuid);
--   Approved receipts cannot be reverted by hand: use void_purchase_invoice (20261020000300).

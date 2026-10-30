-- Phase 3: suppliers, purchase invoices, cost history, the posted-document guard, RLS, storage and staff RPCs.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS average_cost numeric(14,4),
  ADD COLUMN IF NOT EXISTS average_cost_updated_at timestamptz;

ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (movement_type IN ('adjustment', 'transfer_in', 'transfer_out', 'order_reservation', 'order_release', 'purchase_receipt', 'supplier_return'));
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS unit_cost numeric(14,4);

CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  phone text,
  email text,
  address text,
  tax_number text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE UNIQUE INDEX suppliers_name_unique ON public.suppliers (lower(btrim(name)));

CREATE SEQUENCE public.purchase_invoice_number_seq;
CREATE TABLE public.purchase_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE DEFAULT ('PI-' || to_char(timezone('utc', now()), 'YYYY') || '-' || lpad(nextval('public.purchase_invoice_number_seq')::text, 6, '0')),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  supplier_invoice_ref text,
  invoice_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','voided')),
  subtotal numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  extra_costs numeric(14,2) NOT NULL DEFAULT 0 CHECK (extra_costs >= 0),
  total numeric(14,2) GENERATED ALWAYS AS (subtotal - discount_amount + extra_costs) STORED,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  approved_by uuid REFERENCES auth.users(id), approved_at timestamptz,
  voided_by uuid REFERENCES auth.users(id), voided_at timestamptz, void_reason text,
  CONSTRAINT purchase_invoices_discount_le_subtotal CHECK (discount_amount <= subtotal + extra_costs),
  CONSTRAINT purchase_invoices_approved_shape CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CONSTRAINT purchase_invoices_voided_shape CHECK (status <> 'voided' OR (voided_at IS NOT NULL AND void_reason IS NOT NULL))
);
CREATE UNIQUE INDEX purchase_invoices_supplier_ref_unique ON public.purchase_invoices (supplier_id, lower(supplier_invoice_ref)) WHERE supplier_invoice_ref IS NOT NULL AND status <> 'voided';
CREATE INDEX purchase_invoices_warehouse_status_idx ON public.purchase_invoices (warehouse_id, status, invoice_date DESC);
CREATE INDEX purchase_invoices_supplier_idx ON public.purchase_invoices (supplier_id, invoice_date DESC);

CREATE TABLE public.purchase_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  variant_id text,
  variant_name text,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost numeric(14,4) NOT NULL CHECK (unit_cost >= 0),
  line_total numeric(14,2) GENERATED ALWAYS AS (round(quantity * unit_cost, 2)) STORED,
  landed_unit_cost numeric(14,4),
  expiry_date date,
  batch_number text,
  UNIQUE (invoice_id, line_no)
);
CREATE INDEX purchase_invoice_items_product_idx ON public.purchase_invoice_items (product_id);

CREATE TABLE public.purchase_invoice_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE public.product_cost_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('purchase_invoice','supplier_return')),
  source_id uuid NOT NULL,
  quantity_on_hand_before integer NOT NULL,
  quantity_delta integer NOT NULL,
  unit_cost numeric(14,4) NOT NULL,
  previous_average_cost numeric(14,4),
  new_average_cost numeric(14,4) NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX product_cost_history_product_idx ON public.product_cost_history (product_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.purchase_documents_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_status text;
BEGIN
  IF current_setting('app.purchase_rpc', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME IN ('purchase_invoices', 'supplier_returns') THEN
    v_status := OLD.status;
  ELSIF TG_TABLE_NAME = 'purchase_invoice_items' THEN
    SELECT i.status INTO v_status FROM public.purchase_invoices i WHERE i.id = OLD.invoice_id;
  ELSE
    SELECT r.status INTO v_status FROM public.supplier_returns r WHERE r.id = OLD.return_id;
  END IF;

  IF v_status IS NOT NULL AND v_status <> 'draft' THEN
    RAISE EXCEPTION 'Approved or voided purchase documents are read-only';
  END IF;

  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME IN ('purchase_invoices', 'supplier_returns') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Document status changes must go through the purchase RPCs';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER purchase_invoices_guard
  BEFORE UPDATE OR DELETE ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.purchase_documents_guard();

CREATE TRIGGER purchase_invoice_items_guard
  BEFORE UPDATE OR DELETE ON public.purchase_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.purchase_documents_guard();

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoice_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_cost_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view suppliers" ON public.suppliers
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_warehouse_manager());

CREATE POLICY "Admins and scoped managers view purchase invoices" ON public.purchase_invoices
  FOR SELECT TO authenticated
  USING (public.is_admin() OR warehouse_id = ANY ((SELECT public.my_warehouse_ids())::uuid[]));

CREATE POLICY "View items of visible purchase invoices" ON public.purchase_invoice_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_invoices i WHERE i.id = purchase_invoice_items.invoice_id));

CREATE POLICY "View attachments of visible purchase invoices" ON public.purchase_invoice_attachments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_invoices i WHERE i.id = purchase_invoice_attachments.invoice_id));

CREATE POLICY "Admins view product cost history" ON public.product_cost_history
  FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE ALL ON public.suppliers, public.purchase_invoices, public.purchase_invoice_items,
  public.purchase_invoice_attachments, public.product_cost_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.suppliers, public.purchase_invoices, public.purchase_invoice_items,
  public.purchase_invoice_attachments, public.product_cost_history TO authenticated;
GRANT ALL ON public.suppliers, public.purchase_invoices, public.purchase_invoice_items,
  public.purchase_invoice_attachments, public.product_cost_history TO service_role;
REVOKE ALL ON SEQUENCE public.purchase_invoice_number_seq FROM PUBLIC, anon, authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('purchase-invoices', 'purchase-invoices', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.purchase_attachment_warehouse_id(p_object_name text) RETURNS uuid
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    WHEN split_part(p_object_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN split_part(p_object_name, '/', 1)::uuid
  END;
$$;

DROP POLICY IF EXISTS "Managers upload purchase invoice files" ON storage.objects;
CREATE POLICY "Managers upload purchase invoice files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'purchase-invoices' AND public.can_manage_warehouse(public.purchase_attachment_warehouse_id(name)));

DROP POLICY IF EXISTS "Managers read purchase invoice files" ON storage.objects;
CREATE POLICY "Managers read purchase invoice files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'purchase-invoices' AND public.can_manage_warehouse(public.purchase_attachment_warehouse_id(name)));

DROP POLICY IF EXISTS "Admins delete purchase invoice files" ON storage.objects;
CREATE POLICY "Admins delete purchase invoice files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'purchase-invoices' AND public.is_admin());

CREATE OR REPLACE FUNCTION public.staff_save_supplier(
  p_name text,
  p_id uuid DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_tax_number text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_is_active boolean DEFAULT true
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_name text := btrim(COALESCE(p_name, ''));
  v_current public.suppliers%ROWTYPE;
  v_active boolean;
  v_id uuid;
BEGIN
  IF NOT (public.is_admin() OR public.is_warehouse_manager()) THEN RAISE EXCEPTION 'Staff access required'; END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'Supplier name is required'; END IF;
  IF NOT public.is_admin() AND COALESCE(p_is_active, true) = false THEN
    RAISE EXCEPTION 'Only administrators can deactivate suppliers';
  END IF;
  IF EXISTS (SELECT 1 FROM public.suppliers s WHERE lower(btrim(s.name)) = lower(v_name) AND s.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'Supplier name already exists';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.suppliers (name, phone, email, address, tax_number, notes, is_active, created_by)
    VALUES (v_name, NULLIF(btrim(COALESCE(p_phone, '')), ''), NULLIF(btrim(COALESCE(p_email, '')), ''),
            NULLIF(btrim(COALESCE(p_address, '')), ''), NULLIF(btrim(COALESCE(p_tax_number, '')), ''),
            NULLIF(btrim(COALESCE(p_notes, '')), ''), COALESCE(p_is_active, true), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    SELECT * INTO v_current FROM public.suppliers WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Supplier not found'; END IF;
    v_active := CASE WHEN public.is_admin() THEN COALESCE(p_is_active, true) ELSE v_current.is_active END;
    UPDATE public.suppliers SET
      name = v_name,
      phone = NULLIF(btrim(COALESCE(p_phone, '')), ''),
      email = NULLIF(btrim(COALESCE(p_email, '')), ''),
      address = NULLIF(btrim(COALESCE(p_address, '')), ''),
      tax_number = NULLIF(btrim(COALESCE(p_tax_number, '')), ''),
      notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
      is_active = v_active,
      updated_at = timezone('utc', now())
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_search_products(p_query text DEFAULT NULL, p_limit integer DEFAULT 30)
RETURNS TABLE(id uuid, name_ar text, brand text, image text, variants jsonb, is_active boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_query text := btrim(COALESCE(p_query, ''));
BEGIN
  IF NOT (public.is_admin() OR public.is_warehouse_manager()) THEN RAISE EXCEPTION 'Staff access required'; END IF;

  RETURN QUERY
  SELECT p.id, p.name_ar, p.brand, p.image, p.variants, p.is_active
  FROM public.products p
  WHERE v_query = ''
     OR p.name_ar ILIKE '%' || v_query || '%'
     OR p.name_en ILIKE '%' || v_query || '%'
     OR p.brand ILIKE '%' || v_query || '%'
  ORDER BY p.name_ar NULLS LAST, p.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_purchase_invoice_draft(
  p_supplier_id uuid,
  p_warehouse_id uuid,
  p_invoice_date date,
  p_items jsonb,
  p_id uuid DEFAULT NULL,
  p_supplier_invoice_ref text DEFAULT NULL,
  p_discount_amount numeric DEFAULT 0,
  p_extra_costs numeric DEFAULT 0,
  p_notes text DEFAULT NULL
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ref text := NULLIF(btrim(COALESCE(p_supplier_invoice_ref, '')), '');
  v_discount numeric := COALESCE(p_discount_amount, 0);
  v_extra numeric := COALESCE(p_extra_costs, 0);
  v_current public.purchase_invoices%ROWTYPE;
  v_item jsonb;
  v_line integer;
  v_product public.products%ROWTYPE;
  v_variant_id text;
  v_variant_name text;
  v_quantity integer;
  v_unit_cost numeric;
  v_subtotal numeric := 0;
  v_id uuid := p_id;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.can_manage_warehouse(p_warehouse_id) THEN RAISE EXCEPTION 'Warehouse is outside your warehouse scope'; END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_current FROM public.purchase_invoices WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Purchase invoice not found'; END IF;
    IF v_current.status <> 'draft' THEN RAISE EXCEPTION 'Only draft invoices can be edited'; END IF;
    IF NOT public.can_manage_warehouse(v_current.warehouse_id) THEN RAISE EXCEPTION 'Invoice is outside your warehouse scope'; END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = p_supplier_id AND s.is_active) THEN
    RAISE EXCEPTION 'Supplier not found or inactive';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = p_warehouse_id AND w.is_active) THEN
    RAISE EXCEPTION 'Warehouse not found or inactive';
  END IF;
  IF p_invoice_date IS NULL OR p_invoice_date > CURRENT_DATE THEN RAISE EXCEPTION 'Invoice date cannot be in the future'; END IF;
  IF v_discount < 0 OR v_extra < 0 THEN RAISE EXCEPTION 'Discount and extra costs cannot be negative'; END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invoice items must be an array'; END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'An invoice needs between 1 and 200 items'; END IF;

  IF v_ref IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.purchase_invoices i
    WHERE i.supplier_id = p_supplier_id
      AND lower(i.supplier_invoice_ref) = lower(v_ref)
      AND i.status <> 'voided'
      AND i.id IS DISTINCT FROM p_id
  ) THEN
    RAISE EXCEPTION 'Supplier invoice reference is already used for this supplier';
  END IF;

  v_line := 0;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_line := v_line + 1;
    v_quantity := COALESCE((v_item->>'quantity')::integer, 0);
    IF v_quantity <= 0 THEN RAISE EXCEPTION 'Line % quantity must be a positive whole number', v_line; END IF;
    v_unit_cost := (v_item->>'unit_cost')::numeric;
    IF v_unit_cost IS NULL OR v_unit_cost < 0 THEN RAISE EXCEPTION 'Line % unit cost must be zero or more', v_line; END IF;

    SELECT * INTO v_product FROM public.products p WHERE p.id = (v_item->>'product_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Line % product not found', v_line; END IF;

    v_variant_id := NULLIF(btrim(COALESCE(v_item->>'variant_id', '')), '');
    IF v_variant_id IS NULL AND jsonb_array_length(COALESCE(v_product.variants, '[]'::jsonb)) > 0 THEN
      RAISE EXCEPTION 'Line % requires a variant', v_line;
    END IF;
    IF v_variant_id IS NOT NULL AND public.product_variant(v_product.variants, v_variant_id) IS NULL THEN
      RAISE EXCEPTION 'Line % variant is not valid for this product', v_line;
    END IF;

    v_subtotal := v_subtotal + round(v_quantity * v_unit_cost, 2);
  END LOOP;

  IF p_id IS NULL THEN
    INSERT INTO public.purchase_invoices (supplier_id, warehouse_id, supplier_invoice_ref, invoice_date, subtotal, discount_amount, extra_costs, notes, created_by)
    VALUES (p_supplier_id, p_warehouse_id, v_ref, p_invoice_date, v_subtotal, v_discount, v_extra,
            NULLIF(btrim(COALESCE(p_notes, '')), ''), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.purchase_invoices SET
      supplier_id = p_supplier_id,
      warehouse_id = p_warehouse_id,
      supplier_invoice_ref = v_ref,
      invoice_date = p_invoice_date,
      subtotal = v_subtotal,
      discount_amount = v_discount,
      extra_costs = v_extra,
      notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
      updated_at = timezone('utc', now())
    WHERE id = v_id;
    DELETE FROM public.purchase_invoice_items WHERE invoice_id = v_id;
  END IF;

  FOR v_item, v_line IN SELECT value, ord::integer FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ord) LOOP
    SELECT * INTO v_product FROM public.products p WHERE p.id = (v_item->>'product_id')::uuid;
    v_variant_id := NULLIF(btrim(COALESCE(v_item->>'variant_id', '')), '');
    v_variant_name := NULL;
    IF v_variant_id IS NOT NULL THEN
      v_variant_name := public.product_variant(v_product.variants, v_variant_id)->>'name_ar';
    END IF;

    INSERT INTO public.purchase_invoice_items (invoice_id, line_no, product_id, variant_id, variant_name, quantity, unit_cost, expiry_date, batch_number)
    VALUES (v_id, v_line, v_product.id, v_variant_id, v_variant_name,
            (v_item->>'quantity')::integer, (v_item->>'unit_cost')::numeric,
            NULLIF(v_item->>'expiry_date', '')::date, NULLIF(btrim(COALESCE(v_item->>'batch_number', '')), ''));
  END LOOP;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_purchase_invoice_attachment(p_invoice_id uuid, p_storage_path text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_invoice public.purchase_invoices%ROWTYPE;
  v_prefix text;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase invoice not found'; END IF;
  IF NOT public.can_manage_warehouse(v_invoice.warehouse_id) THEN RAISE EXCEPTION 'Invoice is outside your warehouse scope'; END IF;
  IF v_invoice.status <> 'draft' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators can attach files to approved or voided invoices';
  END IF;

  v_prefix := v_invoice.warehouse_id::text || '/' || v_invoice.id::text || '/';
  IF left(COALESCE(p_storage_path, ''), length(v_prefix)) IS DISTINCT FROM v_prefix
     OR length(COALESCE(p_storage_path, '')) <= length(v_prefix)
     OR position('..' IN p_storage_path) > 0 THEN
    RAISE EXCEPTION 'Attachment path must be inside the invoice folder';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'purchase-invoices' AND o.name = p_storage_path) THEN
    RAISE EXCEPTION 'Attachment file has not been uploaded';
  END IF;

  INSERT INTO public.purchase_invoice_attachments (invoice_id, storage_path, uploaded_by)
  VALUES (p_invoice_id, p_storage_path, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_documents_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purchase_attachment_warehouse_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_attachment_warehouse_id(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.staff_save_supplier(text, uuid, text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_save_supplier(text, uuid, text, text, text, text, text, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.staff_search_products(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_search_products(text, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_purchase_invoice_draft(uuid, uuid, date, jsonb, uuid, text, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_purchase_invoice_draft(uuid, uuid, date, jsonb, uuid, text, numeric, numeric, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.add_purchase_invoice_attachment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_purchase_invoice_attachment(uuid, text) TO authenticated, service_role;

-- DOWN (manual):
--   DROP FUNCTION public.add_purchase_invoice_attachment(uuid, text);
--   DROP FUNCTION public.save_purchase_invoice_draft(uuid, uuid, date, jsonb, uuid, text, numeric, numeric, text);
--   DROP FUNCTION public.staff_search_products(text, integer);
--   DROP FUNCTION public.staff_save_supplier(text, uuid, text, text, text, text, text, boolean);
--   DROP POLICY IF EXISTS on storage.objects: "Managers upload purchase invoice files", "Managers read purchase invoice files", "Admins delete purchase invoice files";
--   DROP FUNCTION public.purchase_attachment_warehouse_id(text);
--   DELETE FROM storage.buckets WHERE id = 'purchase-invoices' (only when empty);
--   DROP TABLE public.product_cost_history, public.purchase_invoice_attachments, public.purchase_invoice_items, public.purchase_invoices, public.suppliers;
--   DROP SEQUENCE public.purchase_invoice_number_seq;
--   DROP FUNCTION public.purchase_documents_guard();
--   ALTER TABLE public.inventory_movements DROP COLUMN unit_cost; restore the five-value movement_type constraint (after deleting purchase_receipt/supplier_return rows);
--   ALTER TABLE public.products DROP COLUMN average_cost, DROP COLUMN average_cost_updated_at;

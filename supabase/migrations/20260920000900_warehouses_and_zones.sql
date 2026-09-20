-- 0009 Two warehouses (Khartoum, Port Sudan), stock moved into warehouse inventory,
-- inventory rows guaranteed for every product/warehouse, and delivery zones seeded.

-- Warehouses -------------------------------------------------------------------
INSERT INTO public.warehouses (name, code, state, city, is_active)
VALUES
  ('مخزن الخرطوم', 'KRT', 'الخرطوم', 'الخرطوم', true),
  ('مخزن بورتسودان', 'PZU', 'البحر الأحمر', 'بورتسودان', true)
ON CONFLICT (code) DO NOTHING;

-- Every product has a row in every active warehouse (0 by default) so checkout's
-- warehouse mode can never hit a product without inventory.
CREATE OR REPLACE FUNCTION public.ensure_warehouse_inventory_rows() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_TABLE_NAME = 'products' THEN
    INSERT INTO public.warehouse_inventory (warehouse_id, product_id, quantity)
    SELECT w.id, NEW.id, 0 FROM public.warehouses w WHERE w.is_active
    ON CONFLICT (warehouse_id, product_id) DO NOTHING;
  ELSIF TG_TABLE_NAME = 'warehouses' THEN
    INSERT INTO public.warehouse_inventory (warehouse_id, product_id, quantity)
    SELECT NEW.id, p.id, 0 FROM public.products p
    ON CONFLICT (warehouse_id, product_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_ensure_warehouse_inventory ON public.products;
CREATE TRIGGER products_ensure_warehouse_inventory
  AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.ensure_warehouse_inventory_rows();

DROP TRIGGER IF EXISTS warehouses_ensure_inventory ON public.warehouses;
CREATE TRIGGER warehouses_ensure_inventory
  AFTER INSERT ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.ensure_warehouse_inventory_rows();

-- Move existing products.stock into the Khartoum warehouse (only when inventory is empty,
-- so re-running never double counts). The sync trigger then recomputes products.stock.
DO $$
DECLARE v_krt uuid; v_pzu uuid;
BEGIN
  SELECT id INTO v_krt FROM public.warehouses WHERE code = 'KRT';
  SELECT id INTO v_pzu FROM public.warehouses WHERE code = 'PZU';
  IF NOT EXISTS (SELECT 1 FROM public.warehouse_inventory) THEN
    INSERT INTO public.warehouse_inventory (warehouse_id, product_id, quantity)
    SELECT v_krt, p.id, GREATEST(COALESCE(p.stock, 0), 0) FROM public.products p;
    INSERT INTO public.inventory_movements (warehouse_id, product_id, quantity_delta, movement_type, note)
    SELECT v_krt, p.id, GREATEST(COALESCE(p.stock, 0), 0), 'adjustment', 'رصيد افتتاحي منقول من مخزون المنتج'
    FROM public.products p WHERE COALESCE(p.stock, 0) > 0;
  END IF;
  INSERT INTO public.warehouse_inventory (warehouse_id, product_id, quantity)
  SELECT w.id, p.id, 0 FROM public.warehouses w CROSS JOIN public.products p
  ON CONFLICT (warehouse_id, product_id) DO NOTHING;
END $$;

-- Delivery zones -----------------------------------------------------------------
-- name = locality shown to the customer (checkout matches fee by exact name);
-- state = parent; the "افتراضي" zone of each state is the fallback fee.
DO $$
DECLARE v_krt uuid; v_pzu uuid; v_state text;
BEGIN
  SELECT id INTO v_krt FROM public.warehouses WHERE code = 'KRT';
  SELECT id INTO v_pzu FROM public.warehouses WHERE code = 'PZU';

  INSERT INTO public.delivery_zones (name, fee, is_active, state, warehouse_id) VALUES
    ('الخرطوم', 1500, true, 'الخرطوم', v_krt),
    ('أم درمان', 1500, true, 'الخرطوم', v_krt),
    ('بحري', 1500, true, 'الخرطوم', v_krt),
    ('كرري', 2000, true, 'الخرطوم', v_krt),
    ('جبل أولياء', 2000, true, 'الخرطوم', v_krt),
    ('شرق النيل', 2000, true, 'الخرطوم', v_krt),
    ('أمبدة', 2000, true, 'الخرطوم', v_krt),
    ('بورتسودان', 1500, true, 'البحر الأحمر', v_pzu),
    ('سواكن', 3000, true, 'البحر الأحمر', v_pzu)
  ON CONFLICT (name) DO NOTHING;

  FOREACH v_state IN ARRAY ARRAY[
    'الخرطوم', 'الجزيرة', 'البحر الأحمر', 'نهر النيل', 'الشمالية',
    'شمال دارفور', 'غرب دارفور', 'جنوب دارفور', 'وسط دارفور', 'شرق دارفور',
    'شمال كردفان', 'جنوب كردفان', 'غرب كردفان', 'سنار', 'النيل الأبيض',
    'النيل الأزرق', 'القضارف', 'كسلا'
  ] LOOP
    INSERT INTO public.delivery_zones (name, fee, is_active, state, warehouse_id)
    VALUES (v_state || ' — افتراضي', CASE WHEN v_state = 'الخرطوم' THEN 2500 ELSE 5000 END, true, v_state,
            CASE WHEN v_state = 'البحر الأحمر' THEN v_pzu ELSE v_krt END)
    ON CONFLICT (name) DO NOTHING;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS delivery_zones_state_idx ON public.delivery_zones (state) WHERE is_active;

-- DOWN: DROP the two triggers + function; DELETE seeded zones/warehouses (inventory rows cascade
-- per FK); products.stock is recomputed by the sync trigger.

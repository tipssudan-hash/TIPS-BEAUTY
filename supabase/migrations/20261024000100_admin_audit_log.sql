-- Admin audit trail (§7d.1). Every change to the administrative tables is recorded with its old and new row.
-- Columns passed to the trigger are left out of the snapshot and do not count as a change (drivers.status
-- flips with availability, and updated_at moves on every write).

CREATE TABLE public.admin_audit_log (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name      text NOT NULL,
  row_id          text NOT NULL,
  action          text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data        jsonb,
  new_data        jsonb,
  changed_columns text[],
  changed_by      uuid,
  changed_at      timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX admin_audit_log_table_row_idx ON public.admin_audit_log (table_name, row_id, changed_at DESC);
CREATE INDEX admin_audit_log_changed_by_idx ON public.admin_audit_log (changed_by, changed_at DESC);
CREATE INDEX admin_audit_log_changed_at_idx ON public.admin_audit_log (changed_at DESC);

CREATE OR REPLACE FUNCTION public.log_admin_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_excluded text[] := COALESCE(TG_ARGV, ARRAY[]::text[]);
  v_row      jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_old      jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) - v_excluded END;
  v_new      jsonb := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) - v_excluded END;
  v_changed  text[];
  v_row_id   text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(n.key ORDER BY n.key) INTO v_changed
    FROM jsonb_each(v_new) AS n(key, value)
    WHERE (v_old -> n.key) IS DISTINCT FROM (v_new -> n.key);

    IF v_changed IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT string_agg(COALESCE(v_row ->> a.attname, ''), '|' ORDER BY a.attnum) INTO v_row_id
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = TG_RELID AND i.indisprimary;

  INSERT INTO public.admin_audit_log (table_name, row_id, action, old_data, new_data, changed_columns, changed_by)
  VALUES (TG_TABLE_NAME, COALESCE(v_row_id, ''), TG_OP, v_old, v_new, v_changed, (SELECT auth.uid()));

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.log_admin_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS coupons_admin_audit ON public.coupons;
CREATE TRIGGER coupons_admin_audit AFTER INSERT OR UPDATE OR DELETE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_change('updated_at');

DROP TRIGGER IF EXISTS promotions_admin_audit ON public.promotions;
CREATE TRIGGER promotions_admin_audit AFTER INSERT OR UPDATE OR DELETE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_change('updated_at');

DROP TRIGGER IF EXISTS affiliate_profiles_admin_audit ON public.affiliate_profiles;
CREATE TRIGGER affiliate_profiles_admin_audit AFTER INSERT OR UPDATE OR DELETE ON public.affiliate_profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_change('updated_at');

DROP TRIGGER IF EXISTS storefront_banners_admin_audit ON public.storefront_banners;
CREATE TRIGGER storefront_banners_admin_audit AFTER INSERT OR UPDATE OR DELETE ON public.storefront_banners
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_change('updated_at');

DROP TRIGGER IF EXISTS app_settings_admin_audit ON public.app_settings;
CREATE TRIGGER app_settings_admin_audit AFTER INSERT OR UPDATE OR DELETE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_change('updated_at');

DROP TRIGGER IF EXISTS drivers_admin_audit ON public.drivers;
CREATE TRIGGER drivers_admin_audit AFTER INSERT OR UPDATE OR DELETE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_change('status', 'updated_at');

DROP TRIGGER IF EXISTS warehouses_admin_audit ON public.warehouses;
CREATE TRIGGER warehouses_admin_audit AFTER INSERT OR UPDATE OR DELETE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_change('updated_at');

DROP TRIGGER IF EXISTS delivery_zones_admin_audit ON public.delivery_zones;
CREATE TRIGGER delivery_zones_admin_audit AFTER INSERT OR UPDATE OR DELETE ON public.delivery_zones
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_change('updated_at');

DROP TRIGGER IF EXISTS categories_admin_audit ON public.categories;
CREATE TRIGGER categories_admin_audit AFTER INSERT OR UPDATE OR DELETE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_change('updated_at');

DROP TRIGGER IF EXISTS brands_admin_audit ON public.brands;
CREATE TRIGGER brands_admin_audit AFTER INSERT OR UPDATE OR DELETE ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_change('updated_at');

DROP TRIGGER IF EXISTS warehouse_manager_access_admin_audit ON public.warehouse_manager_access;
CREATE TRIGGER warehouse_manager_access_admin_audit AFTER INSERT OR UPDATE OR DELETE ON public.warehouse_manager_access
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_change('updated_at');

DROP TRIGGER IF EXISTS suppliers_admin_audit ON public.suppliers;
CREATE TRIGGER suppliers_admin_audit AFTER INSERT OR UPDATE OR DELETE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_change('updated_at');

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Administrators read audit log" ON public.admin_audit_log;
CREATE POLICY "Administrators read audit log" ON public.admin_audit_log
  FOR SELECT TO authenticated USING (public.is_admin());

REVOKE ALL ON TABLE public.admin_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_audit_log TO authenticated;
GRANT ALL ON TABLE public.admin_audit_log TO service_role;

CREATE OR REPLACE FUNCTION public.admin_get_audit_log(
  p_table   text DEFAULT NULL,
  p_row_id  text DEFAULT NULL,
  p_user    uuid DEFAULT NULL,
  p_from    timestamptz DEFAULT NULL,
  p_to      timestamptz DEFAULT NULL,
  p_limit   integer DEFAULT 50,
  p_offset  integer DEFAULT 0
) RETURNS TABLE(
  id bigint,
  table_name text,
  row_id text,
  action text,
  old_data jsonb,
  new_data jsonb,
  changed_columns text[],
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;

  RETURN QUERY
  SELECT a.id, a.table_name, a.row_id, a.action, a.old_data, a.new_data, a.changed_columns,
         a.changed_by, COALESCE(NULLIF(pr.full_name, ''), pr.email) AS changed_by_name,
         a.changed_at, count(*) OVER () AS total_count
  FROM public.admin_audit_log a
  LEFT JOIN public.profiles pr ON pr.id = a.changed_by
  WHERE (p_table IS NULL OR a.table_name = p_table)
    AND (p_row_id IS NULL OR a.row_id = p_row_id)
    AND (p_user IS NULL OR a.changed_by = p_user)
    AND (p_from IS NULL OR a.changed_at >= p_from)
    AND (p_to IS NULL OR a.changed_at <= p_to)
  ORDER BY a.changed_at DESC, a.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

ALTER FUNCTION public.admin_get_audit_log(text, text, uuid, timestamptz, timestamptz, integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_get_audit_log(text, text, uuid, timestamptz, timestamptz, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_audit_log(text, text, uuid, timestamptz, timestamptz, integer, integer) TO authenticated, service_role;

-- DOWN (manual):
--   DROP FUNCTION public.admin_get_audit_log(text, text, uuid, timestamptz, timestamptz, integer, integer);
--   Drop the twelve *_admin_audit triggers (coupons, promotions, affiliate_profiles, storefront_banners,
--   app_settings, drivers, warehouses, delivery_zones, categories, brands, warehouse_manager_access, suppliers).
--   DROP FUNCTION public.log_admin_change();
--   DROP TABLE public.admin_audit_log;

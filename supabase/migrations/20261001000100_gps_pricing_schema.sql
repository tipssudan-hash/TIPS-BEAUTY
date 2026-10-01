-- GPS-01: schema for GPS delivery & dynamic pricing, Phase 1 (slim).
-- Spec: docs/specs/gps-delivery-pricing.md. Ticket: GitHub #35.
-- Adds warehouse coordinates, a dynamic-pricing config table (global / per-State /
-- per-Warehouse+Locality), and an audit log of every config write. No RPC yet (GPS-02)
-- and nothing here is read by the app until GPS-02/GPS-04 land — this ticket is schema only.

-- 1. Warehouse GPS coordinates + dispatch lead time.
ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS latitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS longitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS base_dispatch_minutes integer NOT NULL DEFAULT 30;

ALTER TABLE public.warehouses
  ADD CONSTRAINT warehouses_latitude_check
    CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  ADD CONSTRAINT warehouses_longitude_check
    CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  ADD CONSTRAINT warehouses_base_dispatch_minutes_check
    CHECK (base_dispatch_minutes >= 0);

COMMENT ON COLUMN public.warehouses.latitude IS 'Warehouse GPS latitude, for GPS-02''s haversine distance calculation.';
COMMENT ON COLUMN public.warehouses.longitude IS 'Warehouse GPS longitude, for GPS-02''s haversine distance calculation.';
COMMENT ON COLUMN public.warehouses.base_dispatch_minutes IS 'Minutes from order confirmation to a driver leaving this warehouse, used in ETA estimates.';

-- 2. Dynamic delivery pricing config.
-- Precedence, most to least specific (GPS-02 picks the first row that matches):
--   1. (warehouse_id, delivery_zone_id) both set — exact Warehouse->Locality override
--   2. (warehouse_id, state) with delivery_zone_id null — per-Warehouse State default
--   3. (warehouse_id null, delivery_zone_id null, state null) — one global default row
CREATE TABLE IF NOT EXISTS public.delivery_pricing_config (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE CASCADE,
  delivery_zone_id uuid REFERENCES public.delivery_zones(id) ON DELETE CASCADE,
  state text,
  base_fee numeric(12,2) NOT NULL DEFAULT 0,
  per_km_rate numeric(12,2) NOT NULL DEFAULT 0,
  weight_multiplier numeric(12,4) NOT NULL DEFAULT 0,
  road_multiplier numeric(6,3) NOT NULL DEFAULT 1,
  min_fee numeric(12,2) NOT NULL DEFAULT 0,
  max_fee numeric(12,2),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
  CONSTRAINT delivery_pricing_config_base_fee_check CHECK (base_fee >= 0),
  CONSTRAINT delivery_pricing_config_per_km_rate_check CHECK (per_km_rate >= 0),
  CONSTRAINT delivery_pricing_config_weight_multiplier_check CHECK (weight_multiplier >= 0),
  CONSTRAINT delivery_pricing_config_road_multiplier_check CHECK (road_multiplier > 0),
  CONSTRAINT delivery_pricing_config_min_fee_check CHECK (min_fee >= 0),
  CONSTRAINT delivery_pricing_config_max_fee_check CHECK (max_fee IS NULL OR max_fee >= min_fee),
  -- A zone-level row must also name the warehouse the override applies from.
  CONSTRAINT delivery_pricing_config_zone_needs_warehouse_check
    CHECK (delivery_zone_id IS NULL OR warehouse_id IS NOT NULL)
);

ALTER TABLE public.delivery_pricing_config OWNER TO postgres;

COMMENT ON TABLE public.delivery_pricing_config IS 'Dynamic delivery pricing formula coefficients (GPS-02). Zero hardcoded prices: every coefficient GPS-02''s RPC uses lives here.';
COMMENT ON COLUMN public.delivery_pricing_config.warehouse_id IS 'Null = applies to every warehouse (global/state-default row).';
COMMENT ON COLUMN public.delivery_pricing_config.delivery_zone_id IS 'Null = applies to every Locality in the row''s state (or globally, if state is also null).';
COMMENT ON COLUMN public.delivery_pricing_config.road_multiplier IS 'Stands in for real road distance (no routing engine in this stack) — calibrated per (warehouse, locality), since which bridge/route is nearest depends on which warehouse is fulfilling.';

-- One row per precedence tier (partial unique indexes, since the columns that must be
-- unique together differ, and plain UNIQUE treats NULLs as distinct so wouldn't enforce this).
CREATE UNIQUE INDEX IF NOT EXISTS delivery_pricing_config_zone_override_uq
  ON public.delivery_pricing_config (warehouse_id, delivery_zone_id)
  WHERE warehouse_id IS NOT NULL AND delivery_zone_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS delivery_pricing_config_warehouse_state_uq
  ON public.delivery_pricing_config (warehouse_id, state)
  WHERE warehouse_id IS NOT NULL AND delivery_zone_id IS NULL AND state IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS delivery_pricing_config_global_uq
  ON public.delivery_pricing_config ((true))
  WHERE warehouse_id IS NULL AND delivery_zone_id IS NULL AND state IS NULL;

-- 3. Audit log: every write to delivery_pricing_config, who/when/before/after.
CREATE TABLE IF NOT EXISTS public.delivery_pricing_config_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  config_id uuid REFERENCES public.delivery_pricing_config(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
  old_values jsonb,
  new_values jsonb
);

ALTER TABLE public.delivery_pricing_config_audit OWNER TO postgres;

COMMENT ON TABLE public.delivery_pricing_config_audit IS 'Append-only. Written only by delivery_pricing_config_audit_trigger(); never by a direct client write.';

CREATE INDEX IF NOT EXISTS delivery_pricing_config_audit_config_id_idx
  ON public.delivery_pricing_config_audit (config_id);

-- 4. Trigger: record every insert/update/delete. SECURITY DEFINER so it can write the
-- audit row regardless of the acting admin's own RLS grants on the audit table.
CREATE OR REPLACE FUNCTION public.delivery_pricing_config_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.delivery_pricing_config_audit(config_id, action, changed_by, new_values)
    VALUES (NEW.id, 'insert', auth.uid(), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.delivery_pricing_config_audit(config_id, action, changed_by, old_values, new_values)
    VALUES (NEW.id, 'update', auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE
    INSERT INTO public.delivery_pricing_config_audit(config_id, action, changed_by, old_values)
    VALUES (OLD.id, 'delete', auth.uid(), to_jsonb(OLD));
    RETURN OLD;
  END IF;
END;
$$;

ALTER FUNCTION public.delivery_pricing_config_audit_trigger() OWNER TO postgres;

DROP TRIGGER IF EXISTS delivery_pricing_config_audit ON public.delivery_pricing_config;
CREATE TRIGGER delivery_pricing_config_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.delivery_pricing_config
  FOR EACH ROW EXECUTE FUNCTION public.delivery_pricing_config_audit_trigger();

-- Keep updated_at honest without relying on every caller to set it.
CREATE OR REPLACE FUNCTION public.delivery_pricing_config_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_pricing_config_set_updated_at ON public.delivery_pricing_config;
CREATE TRIGGER delivery_pricing_config_set_updated_at
  BEFORE UPDATE ON public.delivery_pricing_config
  FOR EACH ROW EXECUTE FUNCTION public.delivery_pricing_config_set_updated_at();

-- 5. RLS: admin-only, both reads and writes — this is pricing-formula data, not the kind
-- of reference data (zone names/fees) that delivery_zones already exposes to customers.
-- Customer-facing exposure is GPS-02's RPC, which runs SECURITY DEFINER and is deliberately
-- narrow (a fee and a window, never the raw coefficients).
ALTER TABLE public.delivery_pricing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_pricing_config_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage delivery pricing config" ON public.delivery_pricing_config
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins view delivery pricing config audit" ON public.delivery_pricing_config_audit
  FOR SELECT TO authenticated USING (public.is_admin());
-- No INSERT/UPDATE/DELETE policy for the audit table: only the SECURITY DEFINER trigger
-- function writes it, which bypasses RLS entirely as it runs as the table owner.

GRANT ALL ON TABLE public.delivery_pricing_config TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.delivery_pricing_config TO authenticated;

GRANT ALL ON TABLE public.delivery_pricing_config_audit TO service_role;
GRANT SELECT ON TABLE public.delivery_pricing_config_audit TO authenticated;

-- DOWN (manual):
--   DROP TRIGGER delivery_pricing_config_set_updated_at ON public.delivery_pricing_config;
--   DROP FUNCTION public.delivery_pricing_config_set_updated_at();
--   DROP TRIGGER delivery_pricing_config_audit ON public.delivery_pricing_config;
--   DROP FUNCTION public.delivery_pricing_config_audit_trigger();
--   DROP TABLE public.delivery_pricing_config_audit;
--   DROP TABLE public.delivery_pricing_config;
--   ALTER TABLE public.warehouses
--     DROP CONSTRAINT warehouses_latitude_check,
--     DROP CONSTRAINT warehouses_longitude_check,
--     DROP CONSTRAINT warehouses_base_dispatch_minutes_check,
--     DROP COLUMN latitude, DROP COLUMN longitude, DROP COLUMN base_dispatch_minutes;

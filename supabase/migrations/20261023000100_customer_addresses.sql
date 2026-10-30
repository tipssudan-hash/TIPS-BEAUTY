-- Saved delivery addresses per customer (§7c.6). Customers manage only their own rows.

CREATE TABLE public.customer_addresses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  label         text,
  recipient_name text NOT NULL,
  phone         text NOT NULL,
  state         text NOT NULL,
  city          text NOT NULL,
  address_line  text NOT NULL,
  latitude      numeric CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90)),
  longitude     numeric CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180)),
  is_default    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at    timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX customer_addresses_one_default_idx ON public.customer_addresses (customer_id) WHERE is_default;
CREATE INDEX customer_addresses_customer_created_idx ON public.customer_addresses (customer_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.customer_addresses_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.customer_addresses_touch_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS customer_addresses_touch_updated_at ON public.customer_addresses;
CREATE TRIGGER customer_addresses_touch_updated_at
  BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.customer_addresses_touch_updated_at();

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers read own addresses" ON public.customer_addresses
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = customer_id);
CREATE POLICY "Customers insert own addresses" ON public.customer_addresses
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = customer_id);
CREATE POLICY "Customers update own addresses" ON public.customer_addresses
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = customer_id) WITH CHECK ((SELECT auth.uid()) = customer_id);
CREATE POLICY "Customers delete own addresses" ON public.customer_addresses
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = customer_id);

REVOKE ALL ON TABLE public.customer_addresses FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_addresses TO authenticated;
GRANT ALL ON TABLE public.customer_addresses TO service_role;

-- DOWN (manual):
--   DROP TABLE public.customer_addresses;
--   DROP FUNCTION public.customer_addresses_touch_updated_at();

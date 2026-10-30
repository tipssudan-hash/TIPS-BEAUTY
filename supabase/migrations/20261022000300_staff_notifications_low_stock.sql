-- Phase 5 (§7b.3): in-app notifications for warehouse staff. Rows are written by triggers only; staff read
-- their own rows and mark them read through mark_staff_notifications_read(). A row stays unique per
-- (user, kind, ref) while unread, so a condition that keeps recurring does not flood the inbox.

CREATE TABLE IF NOT EXISTS public.staff_notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('low_stock', 'delivery_failed', 'remittance_submitted')),
  title        text NOT NULL,
  body         text,
  ref_type     text,
  ref_id       uuid,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_notifications_unread_dedupe
  ON public.staff_notifications (user_id, kind, ref_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS staff_notifications_user_created_idx
  ON public.staff_notifications (user_id, created_at DESC);

ALTER TABLE public.staff_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.staff_notifications TO authenticated;
GRANT ALL ON public.staff_notifications TO service_role;

DROP POLICY IF EXISTS "Staff view own notifications" ON public.staff_notifications;
CREATE POLICY "Staff view own notifications"
  ON public.staff_notifications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'staff_notifications'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_notifications;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_notification_recipients(p_warehouse_id uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.id FROM public.profiles p WHERE p.role = 'admin'
  UNION
  SELECT a.user_id FROM public.warehouse_manager_access a
  WHERE p_warehouse_id IS NOT NULL AND a.warehouse_id = p_warehouse_id;
$$;
REVOKE ALL ON FUNCTION public.staff_notification_recipients(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_staff_notifications_read(p_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  UPDATE public.staff_notifications n
  SET read_at = now()
  WHERE n.user_id = (SELECT auth.uid())
    AND n.read_at IS NULL
    AND n.id = ANY (COALESCE(p_ids, '{}'::uuid[]));
END;
$$;
REVOKE ALL ON FUNCTION public.mark_staff_notifications_read(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_staff_notifications_read(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.warehouse_inventory_low_stock_notify() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_product text;
  v_warehouse text;
BEGIN
  IF NOT (OLD.quantity > NEW.reorder_level AND NEW.quantity <= NEW.reorder_level AND NEW.reorder_level > 0) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.name_ar, p.name_en, '') INTO v_product FROM public.products p WHERE p.id = NEW.product_id;
  SELECT w.name INTO v_warehouse FROM public.warehouses w WHERE w.id = NEW.warehouse_id;

  INSERT INTO public.staff_notifications (user_id, warehouse_id, kind, title, body, ref_type, ref_id)
  SELECT r.user_id, NEW.warehouse_id, 'low_stock', 'مخزون منخفض',
         concat(COALESCE(v_product, ''), ' — ', COALESCE(v_warehouse, ''), ': ', NEW.quantity, ' قطعة متبقية (حد إعادة الطلب ', NEW.reorder_level, ')'),
         'warehouse_inventory', md5(NEW.warehouse_id::text || ':' || NEW.product_id::text)::uuid
  FROM public.staff_notification_recipients(NEW.warehouse_id) AS r(user_id)
  ON CONFLICT (user_id, kind, ref_id) WHERE read_at IS NULL DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_warehouse_inventory_low_stock ON public.warehouse_inventory;
CREATE TRIGGER on_warehouse_inventory_low_stock
  AFTER UPDATE OF quantity, reorder_level ON public.warehouse_inventory
  FOR EACH ROW EXECUTE FUNCTION public.warehouse_inventory_low_stock_notify();

CREATE OR REPLACE FUNCTION public.orders_delivery_failed_notify() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.staff_notifications (user_id, warehouse_id, kind, title, body, ref_type, ref_id)
  SELECT r.user_id, NEW.fulfillment_warehouse_id, 'delivery_failed', 'فشل تسليم طلب',
         concat('الطلب ', COALESCE(NEW.order_number, ''), ' تعذّر تسليمه ويحتاج إلى قرار: إعادة إسناد أو إلغاء بعد استلام المرتجع.'),
         'order', NEW.id
  FROM public.staff_notification_recipients(NEW.fulfillment_warehouse_id) AS r(user_id)
  ON CONFLICT (user_id, kind, ref_id) WHERE read_at IS NULL DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_order_delivery_failed_notify ON public.orders;
CREATE TRIGGER on_order_delivery_failed_notify
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'delivery_failed' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.orders_delivery_failed_notify();

CREATE OR REPLACE FUNCTION public.driver_cash_remittance_notify() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.staff_notifications (user_id, warehouse_id, kind, title, body, ref_type, ref_id)
  SELECT r.user_id, NEW.warehouse_id, 'remittance_submitted', 'تسوية نقدية بانتظار التأكيد',
         concat('أُرسلت تسوية نقدية بمبلغ ', NEW.amount, ' وتحتاج إلى تأكيد.'),
         'driver_cash_remittance', NEW.id
  FROM public.staff_notification_recipients(NEW.warehouse_id) AS r(user_id)
  ON CONFLICT (user_id, kind, ref_id) WHERE read_at IS NULL DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_driver_cash_remittance_submitted_notify ON public.driver_cash_remittances;
CREATE TRIGGER on_driver_cash_remittance_submitted_notify
  AFTER INSERT ON public.driver_cash_remittances
  FOR EACH ROW
  WHEN (NEW.status = 'submitted')
  EXECUTE FUNCTION public.driver_cash_remittance_notify();

REVOKE ALL ON FUNCTION public.warehouse_inventory_low_stock_notify() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.orders_delivery_failed_notify() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.driver_cash_remittance_notify() FROM PUBLIC, anon, authenticated;

-- DOWN (manual):
--   DROP TRIGGER on_driver_cash_remittance_submitted_notify ON public.driver_cash_remittances;
--   DROP TRIGGER on_order_delivery_failed_notify ON public.orders;
--   DROP TRIGGER on_warehouse_inventory_low_stock ON public.warehouse_inventory;
--   DROP FUNCTION public.driver_cash_remittance_notify(); DROP FUNCTION public.orders_delivery_failed_notify();
--   DROP FUNCTION public.warehouse_inventory_low_stock_notify(); DROP FUNCTION public.mark_staff_notifications_read(uuid[]);
--   DROP FUNCTION public.staff_notification_recipients(uuid);
--   DROP TABLE public.staff_notifications;
-- Optional e-mail (app_settings.notification_emails) is not queued here: send-order-emails cancels queue rows
-- without an order_id and builds order-specific copy, so it needs its own change first.

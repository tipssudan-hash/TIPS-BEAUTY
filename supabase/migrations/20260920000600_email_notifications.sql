-- 0006 Transactional email pipeline (Resend) on top of the existing notification_queue.
-- - app_settings: admin-editable staff recipient list.
-- - 'email' becomes a valid queue channel; a separate trigger queues customer + staff rows on order creation.
-- - pg_cron calls the send-order-emails Edge Function once a minute when pending rows exist.
--   The function is authenticated with a key stored in Vault under 'send_order_emails_key'
--   (created outside migrations; the job is a no-op until it exists).

-- app_settings -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  notification_emails text[] NOT NULL DEFAULT '{}',
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now())
);
INSERT INTO public.app_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage app settings" ON public.app_settings
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, UPDATE ON TABLE public.app_settings TO authenticated;
GRANT ALL ON TABLE public.app_settings TO service_role;

-- Queue channel ----------------------------------------------------------------
ALTER TABLE public.notification_queue DROP CONSTRAINT IF EXISTS notification_queue_channel_check;
ALTER TABLE public.notification_queue ADD CONSTRAINT notification_queue_channel_check
  CHECK (channel IN ('whatsapp', 'sms', 'email'));

ALTER TABLE public.notification_queue ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS notification_queue_pending_email_idx
  ON public.notification_queue (created_at) WHERE channel = 'email' AND status = 'pending';

CREATE OR REPLACE FUNCTION public.queue_order_email_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.notification_queue (order_id, customer_id, channel, event_type, message, payload)
  VALUES
    (NEW.id, NEW.customer_id, 'email', 'order_created', 'تم استلام طلبك رقم ' || COALESCE(NEW.order_number, '') || ' بنجاح.',
     jsonb_build_object('audience', 'customer', 'order_number', NEW.order_number)),
    (NEW.id, NEW.customer_id, 'email', 'order_created', 'طلب جديد رقم ' || COALESCE(NEW.order_number, ''),
     jsonb_build_object('audience', 'staff', 'order_number', NEW.order_number));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_queue_email_notifications ON public.orders;
CREATE TRIGGER orders_queue_email_notifications
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.queue_order_email_notification();

-- Dispatcher -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_email_queue() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_key text;
  v_url text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notification_queue WHERE channel = 'email' AND status = 'pending' AND attempts < 5) THEN
    RETURN;
  END IF;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'send_order_emails_key' LIMIT 1;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'send_order_emails_url' LIMIT 1;
  IF v_key IS NULL OR v_url IS NULL THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_email_queue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_email_queue() TO service_role;

SELECT cron.schedule('dispatch-email-queue', '* * * * *', $$SELECT public.dispatch_email_queue();$$);

-- DOWN:
--   SELECT cron.unschedule('dispatch-email-queue'); DROP FUNCTION public.dispatch_email_queue();
--   DROP TRIGGER orders_queue_email_notifications ON public.orders; DROP FUNCTION public.queue_order_email_notification();
--   DELETE FROM public.notification_queue WHERE channel = 'email'; restore the channel CHECK; DROP COLUMN attempts;
--   DROP TABLE public.app_settings;

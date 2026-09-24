-- 0018 WhatsApp order confirmations for phone-only customers, and one place to see delivery failures.
--
-- Phone sign-in creates customers with no email address. The email pipeline sends order confirmations to
-- profiles.email, so those customers would silently hear nothing about an order they just paid for —
-- the hole phone sign-in opens, and the reason this exists.
--
-- Scope is deliberately one message: the order confirmation, matching exactly what email customers get.
-- Every additional template is its own Meta approval cycle in Arabic, and utility messages outside the
-- 24-hour window each cost money.
--
-- The email path is untouched. This is a second trigger rather than an edit to
-- queue_order_email_notification(), so a fault here cannot break the channel that already works.

CREATE OR REPLACE FUNCTION public.queue_order_whatsapp_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
DECLARE
  v_email text;
  v_phone text;
BEGIN
  SELECT p.email, p.phone INTO v_email, v_phone FROM public.profiles p WHERE p.id = NEW.customer_id;

  -- Only where email cannot reach them. A customer with an email already gets the confirmation there,
  -- and sending both would be two costs for one message.
  IF v_email IS NOT NULL AND length(trim(v_email)) > 0 THEN
    RETURN NEW;
  END IF;

  -- Fall back to the phone on the order itself: a guest-style checkout may carry a number the profile
  -- does not have yet.
  v_phone := COALESCE(public.normalize_sd_phone(v_phone), public.normalize_sd_phone(NEW.phone));
  IF v_phone IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notification_queue (order_id, customer_id, channel, event_type, message, payload, recipient_phone)
  VALUES (
    NEW.id,
    NEW.customer_id,
    'whatsapp',
    'order_created',
    'تم استلام طلبك رقم ' || COALESCE(NEW.order_number, '') || ' بنجاح.',
    jsonb_build_object('audience', 'customer', 'order_number', NEW.order_number),
    v_phone
  );
  RETURN NEW;
END;
$fn$;

ALTER FUNCTION public.queue_order_whatsapp_notification() OWNER TO postgres;

DROP TRIGGER IF EXISTS orders_queue_whatsapp_notification ON public.orders;
CREATE TRIGGER orders_queue_whatsapp_notification
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.queue_order_whatsapp_notification();

CREATE INDEX IF NOT EXISTS notification_queue_pending_whatsapp_idx
  ON public.notification_queue (created_at) WHERE channel = 'whatsapp' AND status = 'pending';

-- Dispatcher -------------------------------------------------------------------
-- Mirrors dispatch_email_queue() exactly, including the vault-secret pattern and the "do nothing until
-- the secrets exist" posture, so the two pipelines behave the same way in an outage.
CREATE OR REPLACE FUNCTION public.dispatch_whatsapp_queue() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $fn$
DECLARE
  v_key text;
  v_url text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notification_queue WHERE channel = 'whatsapp' AND status = 'pending' AND attempts < 5) THEN
    RETURN;
  END IF;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'send_order_whatsapp_key' LIMIT 1;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'send_order_whatsapp_url' LIMIT 1;
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
$fn$;

ALTER FUNCTION public.dispatch_whatsapp_queue() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dispatch_whatsapp_queue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_whatsapp_queue() TO service_role;

SELECT cron.schedule('dispatch-whatsapp-queue', '* * * * *', $$SELECT public.dispatch_whatsapp_queue();$$);

-- Monitoring -------------------------------------------------------------------
-- Three pipelines fail in three different tables, and a customer who hears nothing does not know which
-- one broke. This is the single answer to "did our messages actually go out?", for the Admin Portal.
CREATE OR REPLACE FUNCTION public.admin_delivery_failures(p_hours integer DEFAULT 48, p_limit integer DEFAULT 200)
RETURNS TABLE (
  source text,
  channel text,
  status text,
  recipient text,
  reference text,
  error_message text,
  attempts integer,
  order_number text,
  created_at timestamp with time zone
)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;

  RETURN QUERY
  -- Order notifications (email and WhatsApp) that did not go out.
  SELECT
    'notification_queue'::text,
    q.channel,
    q.status,
    COALESCE(q.recipient_phone, (SELECT p.email FROM public.profiles p WHERE p.id = q.customer_id)),
    q.provider_reference,
    q.error_message,
    q.attempts,
    (SELECT o.order_number FROM public.orders o WHERE o.id = q.order_id),
    q.created_at
  FROM public.notification_queue q
  WHERE q.status IN ('failed', 'cancelled')
    AND q.created_at > timezone('utc', now()) - make_interval(hours => p_hours)

  UNION ALL

  -- Login codes that were never delivered, or were refused by the rate limiter.
  SELECT
    'otp_delivery_log'::text,
    l.channel,
    l.status,
    l.phone,
    l.provider_message_id,
    l.error_message,
    l.attempt,
    NULL::text,
    l.created_at
  FROM public.otp_delivery_log l
  WHERE l.status IN ('failed', 'blocked')
    AND l.created_at > timezone('utc', now()) - make_interval(hours => p_hours)

  UNION ALL

  -- Push notifications rejected by Expo or FCM.
  SELECT
    'push_notification_deliveries'::text,
    COALESCE(d.provider, 'expo'),
    d.status,
    NULL::text,
    d.provider_message_id,
    d.error_message,
    NULL::integer,
    (SELECT o.order_number FROM public.orders o WHERE o.id = d.order_id),
    d.created_at
  FROM public.push_notification_deliveries d
  WHERE d.status = 'failed'
    AND d.created_at > timezone('utc', now()) - make_interval(hours => p_hours)

  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$fn$;

ALTER FUNCTION public.admin_delivery_failures(integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_delivery_failures(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delivery_failures(integer, integer) TO authenticated, service_role;

-- Counts for the screen's header, so staff can see at a glance whether a channel is dead.
CREATE OR REPLACE FUNCTION public.admin_delivery_summary(p_hours integer DEFAULT 48)
RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
DECLARE
  v_since timestamp with time zone := timezone('utc', now()) - make_interval(hours => p_hours);
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;

  RETURN jsonb_build_object(
    'hours', p_hours,
    'email', (SELECT jsonb_build_object(
        'sent', count(*) FILTER (WHERE status = 'sent'),
        'pending', count(*) FILTER (WHERE status = 'pending'),
        'failed', count(*) FILTER (WHERE status IN ('failed', 'cancelled')))
      FROM public.notification_queue WHERE channel = 'email' AND created_at > v_since),
    'whatsapp', (SELECT jsonb_build_object(
        'sent', count(*) FILTER (WHERE status = 'sent'),
        'pending', count(*) FILTER (WHERE status = 'pending'),
        'failed', count(*) FILTER (WHERE status IN ('failed', 'cancelled')))
      FROM public.notification_queue WHERE channel = 'whatsapp' AND created_at > v_since),
    'otp', (SELECT jsonb_build_object(
        'sent', count(*) FILTER (WHERE status = 'sent'),
        'blocked', count(*) FILTER (WHERE status = 'blocked'),
        'failed', count(*) FILTER (WHERE status = 'failed'))
      FROM public.otp_delivery_log WHERE created_at > v_since),
    'push', (SELECT jsonb_build_object(
        'sent', count(*) FILTER (WHERE status = 'submitted'),
        'failed', count(*) FILTER (WHERE status = 'failed'))
      FROM public.push_notification_deliveries WHERE created_at > v_since)
  );
END;
$fn$;

ALTER FUNCTION public.admin_delivery_summary(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_delivery_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delivery_summary(integer) TO authenticated, service_role;

-- DOWN:
--   SELECT cron.unschedule('dispatch-whatsapp-queue');
--   DROP TRIGGER orders_queue_whatsapp_notification ON public.orders;
--   DROP FUNCTION public.queue_order_whatsapp_notification(), public.dispatch_whatsapp_queue(),
--                 public.admin_delivery_failures(integer, integer), public.admin_delivery_summary(integer);

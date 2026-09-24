-- 0019 Scope the WhatsApp dispatcher to the messages this project owns.
--
-- Found when the delivery-health test failed against the real database: a pre-existing trigger,
-- `orders_queue_notifications` -> `queue_order_notification()`, has been queueing channel = 'whatsapp'
-- rows since 2026-09-07 — for every customer and for every event (order_created, order_status_*,
-- payment_paid, payment_proof_submitted, return_requested). 54 of them are sitting pending, because
-- nothing has ever drained that channel.
--
-- 0018 added a dispatcher that drains `channel = 'whatsapp' AND status = 'pending'`. Armed with real
-- credentials it would have sent all 54 — weeks-old order updates, several per customer, each billable —
-- and would have double-sent every future confirmation, since the legacy trigger queues order_created
-- for everyone while ours queues it for phone-only customers.
--
-- The agreed scope is one message: an order confirmation, to customers email cannot reach. So rows we
-- own are marked, and the dispatcher sends only those. The legacy trigger is left alone: it is someone
-- else's design and its rows may yet be wanted for a different channel.

-- Mark the rows this project queues.
CREATE OR REPLACE FUNCTION public.queue_order_whatsapp_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
DECLARE
  v_email text;
  v_phone text;
BEGIN
  SELECT p.email, p.phone INTO v_email, v_phone FROM public.profiles p WHERE p.id = NEW.customer_id;

  IF v_email IS NOT NULL AND length(trim(v_email)) > 0 THEN
    RETURN NEW;
  END IF;

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
    -- `notifier` is the marker send-order-whatsapp filters on. Without it the dispatcher cannot tell
    -- our rows from the legacy trigger's, which look identical for order_created.
    jsonb_build_object('audience', 'customer', 'order_number', NEW.order_number, 'notifier', 'order_confirmation_v1'),
    v_phone
  );
  RETURN NEW;
END;
$fn$;

ALTER FUNCTION public.queue_order_whatsapp_notification() OWNER TO postgres;

-- The dispatcher's "is there anything to send?" check must agree with what the function actually sends,
-- or pg_cron wakes the Edge Function every minute for rows it will always skip.
CREATE OR REPLACE FUNCTION public.dispatch_whatsapp_queue() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $fn$
DECLARE
  v_key text;
  v_url text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.notification_queue
     WHERE channel = 'whatsapp'
       AND status = 'pending'
       AND attempts < 5
       AND payload->>'notifier' = 'order_confirmation_v1'
  ) THEN
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

DROP INDEX IF EXISTS public.notification_queue_pending_whatsapp_idx;
CREATE INDEX IF NOT EXISTS notification_queue_pending_whatsapp_idx
  ON public.notification_queue (created_at)
  WHERE channel = 'whatsapp' AND status = 'pending' AND payload->>'notifier' = 'order_confirmation_v1';

-- The health screen counted the legacy backlog as our pending messages, which would have read as a
-- broken pipeline forever. Count only what we are responsible for sending.
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
      FROM public.notification_queue
       WHERE channel = 'whatsapp' AND created_at > v_since
         AND payload->>'notifier' = 'order_confirmation_v1'),
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

-- NOT done here, deliberately: the 54 legacy rows are left pending and untouched. They are pre-launch
-- data belonging to someone else's trigger, the dispatcher now ignores them, and deciding whether they
-- should ever be sent — on WhatsApp, SMS, or not at all — is the owner's call, not a migration's.

-- 0012 One New-Order Alert row per staff recipient (T2-03).
-- The order-created trigger used to queue a single 'staff' email row that the Edge Function
-- fanned out to every address in app_settings.notification_emails — one bad address failed
-- the whole row and a retry re-sent to the recipients that had succeeded. Now the trigger
-- queues one row per distinct recipient (payload.recipient) so attempts and failures are per row.
-- No staff row is queued when no recipient is configured.

CREATE OR REPLACE FUNCTION public.queue_order_email_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.notification_queue (order_id, customer_id, channel, event_type, message, payload)
  VALUES (NEW.id, NEW.customer_id, 'email', 'order_created',
          'تم استلام طلبك رقم ' || COALESCE(NEW.order_number, '') || ' بنجاح.',
          jsonb_build_object('audience', 'customer', 'order_number', NEW.order_number));

  INSERT INTO public.notification_queue (order_id, customer_id, channel, event_type, message, payload)
  SELECT NEW.id, NEW.customer_id, 'email', 'order_created',
         'طلب جديد رقم ' || COALESCE(NEW.order_number, ''),
         jsonb_build_object('audience', 'staff', 'order_number', NEW.order_number, 'recipient', r.email)
  FROM (
    SELECT DISTINCT lower(btrim(e)) AS email
    FROM public.app_settings s, unnest(s.notification_emails) AS e
    WHERE s.id AND btrim(e) <> ''
  ) r;

  RETURN NEW;
END;
$$;

-- DOWN: restore the two-row version from 20260920000600_email_notifications.sql.

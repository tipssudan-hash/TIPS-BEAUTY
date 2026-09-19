-- 0004 Auto-cancel orders that stay `new` for 48 hours (business rule), releasing stock,
-- coupon and points. Runs under pg_cron every 15 minutes.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
GRANT USAGE ON SCHEMA cron TO postgres;

CREATE OR REPLACE FUNCTION public.cancel_stale_orders(p_max_age interval DEFAULT interval '48 hours') RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
  v_count integer := 0;
BEGIN
  FOR v_id IN
    SELECT o.id FROM public.orders o
    WHERE o.status = 'new' AND o.created_at < timezone('utc', now()) - p_max_age
    ORDER BY o.created_at
    FOR UPDATE SKIP LOCKED
  LOOP
    -- One failing order must not stop the sweep for the others.
    BEGIN
      UPDATE public.orders o SET status = 'cancelled' WHERE o.id = v_id;
      INSERT INTO public.order_status_history (order_id, status, note, changed_by)
      VALUES (v_id, 'cancelled', 'إلغاء تلقائي: لم يتم تأكيد الطلب خلال 48 ساعة', NULL);
      PERFORM public.release_order_resources(v_id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cancel_stale_orders: order % failed: %', v_id, SQLERRM;
    END;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_stale_orders(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_stale_orders(interval) TO service_role;

SELECT cron.schedule('cancel-stale-orders', '*/15 * * * *', $$SELECT public.cancel_stale_orders();$$);

-- DOWN:
--   SELECT cron.unschedule('cancel-stale-orders');
--   DROP FUNCTION public.cancel_stale_orders(interval);

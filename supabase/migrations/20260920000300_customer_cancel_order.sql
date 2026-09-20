-- 0003 Customer self-cancellation while the order is still new.

CREATE OR REPLACE FUNCTION public.customer_cancel_order(p_order_id uuid) RETURNS TABLE(id uuid, status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_order public.orders%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT o.* INTO v_order FROM public.orders o WHERE o.id = p_order_id AND o.customer_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status <> 'new' THEN RAISE EXCEPTION 'Only new orders can be cancelled; please contact support'; END IF;

  UPDATE public.orders o SET status = 'cancelled' WHERE o.id = v_order.id;
  INSERT INTO public.order_status_history (order_id, status, note, changed_by)
  VALUES (v_order.id, 'cancelled', 'تم الإلغاء بواسطة العميل', v_user_id);
  PERFORM public.release_order_resources(v_order.id);

  RETURN QUERY SELECT v_order.id, 'cancelled'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.customer_cancel_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_cancel_order(uuid) TO authenticated, service_role;

-- DOWN: DROP FUNCTION public.customer_cancel_order(uuid);

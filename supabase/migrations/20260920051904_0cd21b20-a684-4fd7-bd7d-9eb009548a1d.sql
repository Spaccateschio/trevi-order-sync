CREATE OR REPLACE FUNCTION public.accept_purchase_delivery(_delivery_id uuid, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_d public.purchase_deliveries; v_open integer; v_ref integer;
BEGIN
  SELECT * INTO v_d FROM public.purchase_deliveries WHERE id = _delivery_id;
  IF v_d.id IS NULL OR NOT public.is_company_member(v_d.company_id) THEN RAISE EXCEPTION 'Consegna non trovata'; END IF;
  IF v_d.status NOT IN ('dichiarata','in_contestazione') THEN RAISE EXCEPTION 'Consegna non accettabile'; END IF;

  SELECT count(*) INTO v_open FROM public.purchase_delivery_disputes dd
    JOIN public.purchase_delivery_items di ON di.id = dd.delivery_item_id
   WHERE di.delivery_id = _delivery_id AND dd.status = 'aperta';
  IF v_open > 0 THEN RAISE EXCEPTION 'Contestazioni ancora aperte: risolverle prima di accettare'; END IF;

  UPDATE public.purchase_delivery_items
     SET status = 'accettata', accepted_quantity = COALESCE(accepted_quantity, declared_quantity),
         decided_by = _actor_user_id, decided_at = now()
   WHERE delivery_id = _delivery_id AND status IN ('dichiarata','rettificata');

  INSERT INTO public.purchase_delivery_line_events (company_id, delivery_item_id, event_type, new_quantity, actor_user_id)
  SELECT v_d.company_id, di.id, 'accettata', di.accepted_quantity, _actor_user_id
    FROM public.purchase_delivery_items di WHERE di.delivery_id = _delivery_id AND di.status = 'accettata';

  SELECT count(*) INTO v_ref FROM public.purchase_delivery_items
   WHERE delivery_id = _delivery_id AND status = 'rifiutata';

  UPDATE public.purchase_deliveries
     SET status = (CASE WHEN v_ref > 0 THEN 'chiusa_con_rifiuti' ELSE 'accettata' END)::public.purchase_delivery_status,
         accepted_by = _actor_user_id, accepted_at = now()
   WHERE id = _delivery_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_d.company_id, _actor_user_id, 'purchase_delivery.accepted', 'purchase_delivery', _delivery_id, NULL);
  RETURN _delivery_id;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.accept_purchase_delivery(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_purchase_delivery(uuid, uuid) TO authenticated, service_role;
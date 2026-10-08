CREATE OR REPLACE FUNCTION public.set_shopping_list_delivery_date(_company_id uuid, _list_id uuid, _delivery_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  UPDATE public.shopping_lists SET delivery_date = _delivery_date
   WHERE id = _list_id AND company_id = _company_id AND status = 'aperta'
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Lista non trovata o non più aperta'; END IF;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, auth.uid(), 'shopping_list.delivery_date', 'shopping_list', v_id,
          jsonb_build_object('delivery_date', _delivery_date));
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.set_shopping_list_delivery_date(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_shopping_list_delivery_date(uuid, uuid, date) TO authenticated, service_role;
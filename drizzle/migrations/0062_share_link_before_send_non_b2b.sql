CREATE OR REPLACE FUNCTION public.create_order_share_link(_order_id uuid, _token_hash text, _expires_at timestamp with time zone, _recipient_label text DEFAULT NULL::text, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_o public.purchase_orders; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = _order_id FOR UPDATE;
  IF v_o.id IS NULL OR NOT public.is_company_member(v_o.company_id) THEN RAISE EXCEPTION 'Ordine non trovato'; END IF;
  -- Inviato/parzialmente consegnato come prima; in più la bozza NON B2B, per mettere il link nel messaggio di invio.
  IF NOT (v_o.status IN ('inviato','parzialmente_consegnato') OR (v_o.status = 'bozza' AND v_o.relation_id IS NULL)) THEN
    RAISE EXCEPTION 'Condivisibile solo dopo l''invio dell''ordine (o in bozza per fornitori non B2B)'; END IF;

  UPDATE public.purchase_order_share_links SET revoked_at = now()
   WHERE order_id = _order_id AND revoked_at IS NULL;

  INSERT INTO public.purchase_order_share_links (company_id, order_id, token_hash, recipient_label,
    expires_at, created_by)
  VALUES (v_o.company_id, _order_id, _token_hash, _recipient_label, _expires_at, _actor_user_id)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_o.company_id, _actor_user_id, 'purchase_order.share_link_created', 'purchase_order', _order_id,
          CASE WHEN v_o.status = 'bozza' THEN jsonb_build_object('before_send', true) ELSE NULL END);
  RETURN v_id;
END; $function$;
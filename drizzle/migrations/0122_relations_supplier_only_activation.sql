DROP POLICY IF EXISTS relations_insert_admin ON public.supplier_customer_relations;
DROP POLICY IF EXISTS relations_update_admin ON public.supplier_customer_relations;
DROP POLICY IF EXISTS relations_update_supplier_admin ON public.supplier_customer_relations;
REVOKE INSERT, UPDATE ON public.supplier_customer_relations FROM anon, authenticated;
GRANT ALL ON public.supplier_customer_relations TO service_role;

CREATE OR REPLACE FUNCTION public.request_supplier_relation(_seller_company_id uuid, _buyer_company_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _relation_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Autenticazione richiesta'; END IF;
  IF NOT public.is_company_admin(_buyer_company_id) THEN
    RAISE EXCEPTION 'Solo un amministratore della tua azienda può richiedere il collegamento';
  END IF;
  IF NOT public.company_buys(_buyer_company_id) THEN
    RAISE EXCEPTION 'La tua azienda non ha il profilo di acquisto attivo';
  END IF;
  IF NOT public.company_sells(_seller_company_id) THEN
    RAISE EXCEPTION 'L''azienda scelta non vende sulla piattaforma';
  END IF;
  IF _seller_company_id = _buyer_company_id THEN
    RAISE EXCEPTION 'Non puoi collegarti alla tua stessa azienda';
  END IF;

  SELECT id INTO _relation_id FROM public.supplier_customer_relations
  WHERE seller_company_id = _seller_company_id AND buyer_company_id = _buyer_company_id;
  IF _relation_id IS NOT NULL THEN RETURN _relation_id; END IF;

  IF NOT COALESCE((SELECT is_discoverable FROM public.companies WHERE id = _seller_company_id), false) THEN
    RAISE EXCEPTION 'Collegamento possibile solo tramite invito';
  END IF;

  INSERT INTO public.supplier_customer_relations (
    seller_company_id, buyer_company_id, status, origin, requested_by, seller_enabled, buyer_enabled
  ) VALUES (
    _seller_company_id, _buyer_company_id, 'in_attesa', 'richiesta_cliente', _uid, false, false
  ) RETURNING id INTO _relation_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_seller_company_id, _uid, 'relation.requested', 'relation', _relation_id,
          jsonb_build_object('buyer_company_id', _buyer_company_id));
  RETURN _relation_id;
END;
$function$;
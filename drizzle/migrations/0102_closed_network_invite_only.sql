ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_discoverable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.is_discoverable IS 'Azienda trovabile nella ricerca aperta; modificabile solo dal super admin piattaforma.';

CREATE OR REPLACE FUNCTION public._companies_discoverable_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $f$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_discoverable AND NOT COALESCE(public._is_active_platform_super(), false) THEN
      NEW.is_discoverable := false;
    END IF;
  ELSIF NEW.is_discoverable IS DISTINCT FROM OLD.is_discoverable
        AND auth.uid() IS NOT NULL
        AND NOT COALESCE(public._is_active_platform_super(), false) THEN
    RAISE EXCEPTION 'Solo il super amministratore della piattaforma può modificare la visibilità';
  END IF;
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS companies_discoverable_guard ON public.companies;

CREATE TRIGGER companies_discoverable_guard BEFORE INSERT OR UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public._companies_discoverable_guard();

REVOKE ALL ON FUNCTION public._companies_discoverable_guard() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_supplier_relation(_seller_company_id uuid, _buyer_company_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _relation_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta';
  END IF;

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

  SELECT id INTO _relation_id
  FROM public.supplier_customer_relations
  WHERE seller_company_id = _seller_company_id AND buyer_company_id = _buyer_company_id;

  IF _relation_id IS NOT NULL THEN
    RETURN _relation_id;
  END IF;

  IF NOT COALESCE((SELECT is_discoverable FROM public.companies WHERE id = _seller_company_id), false) THEN
    RAISE EXCEPTION 'Collegamento possibile solo tramite invito';
  END IF;

  INSERT INTO public.supplier_customer_relations (
    seller_company_id, buyer_company_id, status, origin, requested_by
  ) VALUES (
    _seller_company_id, _buyer_company_id, 'in_attesa', 'richiesta_cliente', _uid
  )
  RETURNING id INTO _relation_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_seller_company_id, _uid, 'relation.requested', 'relation', _relation_id,
          jsonb_build_object('buyer_company_id', _buyer_company_id));

  RETURN _relation_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.invite_customer_relation(_seller_company_id uuid, _buyer_company_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _relation_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta';
  END IF;

  IF NOT public.is_company_admin(_seller_company_id) THEN
    RAISE EXCEPTION 'Solo un amministratore della tua azienda può invitare un cliente';
  END IF;

  IF NOT public.company_sells(_seller_company_id) THEN
    RAISE EXCEPTION 'La tua azienda non ha il profilo di vendita attivo';
  END IF;

  IF NOT public.company_buys(_buyer_company_id) THEN
    RAISE EXCEPTION 'L''azienda scelta non acquista sulla piattaforma';
  END IF;

  IF _seller_company_id = _buyer_company_id THEN
    RAISE EXCEPTION 'Non puoi collegarti alla tua stessa azienda';
  END IF;

  SELECT id INTO _relation_id
  FROM public.supplier_customer_relations
  WHERE seller_company_id = _seller_company_id AND buyer_company_id = _buyer_company_id;

  IF _relation_id IS NOT NULL THEN
    RETURN _relation_id;
  END IF;

  IF NOT COALESCE((SELECT is_discoverable FROM public.companies WHERE id = _buyer_company_id), false) THEN
    RAISE EXCEPTION 'Collegamento possibile solo tramite invito';
  END IF;

  INSERT INTO public.supplier_customer_relations (
    seller_company_id, buyer_company_id, status, origin, requested_by, seller_enabled, buyer_enabled
  ) VALUES (
    _seller_company_id, _buyer_company_id, 'in_attesa', 'invito_fornitore', _uid, true, true
  )
  RETURNING id INTO _relation_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_seller_company_id, _uid, 'relation.invited', 'relation', _relation_id,
          jsonb_build_object('buyer_company_id', _buyer_company_id));

  RETURN _relation_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_companies(_query text, _role text)
 RETURNS TABLE(id uuid, legal_name text, city text, province text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _q text := btrim(coalesce(_query, ''));
  _vat text := public.normalize_vat(_q);
BEGIN
  IF _role NOT IN ('cliente', 'fornitore') THEN
    RAISE EXCEPTION 'Ruolo non valido';
  END IF;

  RETURN QUERY
  SELECT c.id, c.legal_name, c.city, c.province
  FROM public.companies c
  WHERE c.status = 'attivo'
    AND c.is_discoverable
    AND (
      (_role = 'cliente' AND c.can_buy AND EXISTS (
        SELECT 1 FROM public.company_members m
        WHERE m.user_id = auth.uid() AND m.status = 'attivo'
          AND public.company_sells(m.company_id) AND m.company_id <> c.id))
      OR
      (_role = 'fornitore' AND c.can_sell AND NOT EXISTS (
        SELECT 1 FROM public.company_members m
        WHERE m.company_id = c.id AND m.user_id = auth.uid() AND m.status = 'attivo'))
    )
    AND (
      _q = ''
      OR c.legal_name ILIKE '%' || _q || '%'
      OR (_vat IS NOT NULL AND _vat <> '' AND c.vat_normalized LIKE _vat || '%')
    )
  ORDER BY c.legal_name
  LIMIT 50;
END;
$function$;

CREATE OR REPLACE FUNCTION public.available_buyers()
 RETURNS TABLE(id uuid, legal_name text, city text, province text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.id, c.legal_name, c.city, c.province
  FROM public.companies c
  WHERE c.can_buy
    AND c.status = 'attivo'
    AND c.is_discoverable
    AND EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.user_id = auth.uid()
        AND m.status = 'attivo'
        AND public.company_sells(m.company_id)
        AND m.company_id <> c.id
    );
$function$;

CREATE OR REPLACE FUNCTION public.available_suppliers()
 RETURNS TABLE(id uuid, legal_name text, city text, province text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.id, c.legal_name, c.city, c.province
  FROM public.companies c
  WHERE c.can_sell = true
    AND c.status = 'attivo'
    AND c.is_discoverable
    AND NOT EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.company_id = c.id
        AND m.user_id = auth.uid()
        AND m.status = 'attivo'
    )
  ORDER BY (c.legal_name = 'Trevi Fruit') DESC, c.legal_name;
$function$;

CREATE OR REPLACE FUNCTION public.customer_record_match_suggestions(_customer_record_id uuid)
 RETURNS TABLE(company_id uuid, legal_name text, vat_normalized text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _record public.customer_records;
BEGIN
  SELECT * INTO _record FROM public.customer_records WHERE id = _customer_record_id;
  IF _record.id IS NULL OR NOT public.is_company_member(_record.seller_company_id) THEN
    RAISE EXCEPTION 'Cliente non trovato';
  END IF;
  IF _record.vat_normalized IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT c.id, c.legal_name, c.vat_normalized
  FROM public.companies c
  WHERE c.vat_normalized = _record.vat_normalized
    AND c.id <> _record.seller_company_id
    AND c.can_buy
    AND c.status = 'attivo'
    AND (c.is_discoverable OR EXISTS (
      SELECT 1 FROM public.supplier_customer_relations r
      WHERE r.seller_company_id = _record.seller_company_id AND r.buyer_company_id = c.id));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.company_exists_for_vat(text) FROM PUBLIC, anon, authenticated;
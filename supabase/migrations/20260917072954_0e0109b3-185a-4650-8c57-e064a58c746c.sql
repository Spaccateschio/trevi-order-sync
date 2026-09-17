ALTER TABLE public.supplier_customer_relations
  ADD COLUMN IF NOT EXISTS seller_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS buyer_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

UPDATE public.supplier_customer_relations
SET accepted_at = COALESCE(accepted_at, decided_at)
WHERE status = 'attivo';

UPDATE public.supplier_customer_relations
SET status = 'attivo',
    seller_enabled = false,
    accepted_at = COALESCE(accepted_at, decided_at, requested_at)
WHERE status = 'sospeso';

CREATE OR REPLACE FUNCTION public.relation_is_operational(_seller_company_id uuid, _buyer_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.supplier_customer_relations rel
    WHERE rel.seller_company_id = _seller_company_id
      AND rel.buyer_company_id = _buyer_company_id
      AND rel.status = 'attivo'
      AND rel.seller_enabled
      AND rel.buyer_enabled
  );
$$;

CREATE OR REPLACE FUNCTION public.has_active_relation(_seller_company_id uuid, _buyer_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.relation_is_operational(_seller_company_id, _buyer_company_id);
$$;

CREATE OR REPLACE FUNCTION public.invite_customer_relation(_seller_company_id uuid, _buyer_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.decide_company_relation(_relation_id uuid, _accept boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _rel public.supplier_customer_relations;
  _deciding_side text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta';
  END IF;

  SELECT * INTO _rel FROM public.supplier_customer_relations WHERE id = _relation_id;
  IF _rel.id IS NULL THEN
    RAISE EXCEPTION 'Collegamento non trovato';
  END IF;

  IF _rel.status <> 'in_attesa' THEN
    RAISE EXCEPTION 'Il collegamento non è in attesa di risposta';
  END IF;

  IF _rel.origin = 'richiesta_cliente' THEN
    _deciding_side := 'venditore';
    IF NOT public.is_company_admin(_rel.seller_company_id) THEN
      RAISE EXCEPTION 'Solo un amministratore dell''azienda venditrice può rispondere';
    END IF;
  ELSE
    _deciding_side := 'acquirente';
    IF NOT public.is_company_admin(_rel.buyer_company_id) THEN
      RAISE EXCEPTION 'Solo un amministratore dell''azienda acquirente può rispondere';
    END IF;
  END IF;

  UPDATE public.supplier_customer_relations
  SET status = CASE WHEN _accept THEN 'attivo'::relation_status ELSE 'rifiutato'::relation_status END,
      accepted_at = CASE WHEN _accept THEN now() ELSE NULL END,
      seller_enabled = CASE WHEN _accept THEN true ELSE seller_enabled END,
      buyer_enabled = CASE WHEN _accept THEN true ELSE buyer_enabled END,
      decided_at = now(),
      decided_by = _uid
  WHERE id = _relation_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_rel.seller_company_id, _uid,
          CASE WHEN _accept THEN 'relation.accepted' ELSE 'relation.rejected' END,
          'relation', _relation_id,
          jsonb_build_object('buyer_company_id', _rel.buyer_company_id, 'deciding_side', _deciding_side));
END;
$$;

CREATE OR REPLACE FUNCTION public.set_relation_side_enabled(_relation_id uuid, _enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _rel public.supplier_customer_relations;
  _side text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta';
  END IF;

  SELECT * INTO _rel FROM public.supplier_customer_relations WHERE id = _relation_id;
  IF _rel.id IS NULL THEN
    RAISE EXCEPTION 'Collegamento non trovato';
  END IF;

  IF _rel.status <> 'attivo' THEN
    RAISE EXCEPTION 'Il collegamento non è attivo';
  END IF;

  IF public.is_company_admin(_rel.seller_company_id) THEN
    _side := 'venditore';
    UPDATE public.supplier_customer_relations SET seller_enabled = _enabled WHERE id = _relation_id;
  ELSIF public.is_company_admin(_rel.buyer_company_id) THEN
    _side := 'acquirente';
    UPDATE public.supplier_customer_relations SET buyer_enabled = _enabled WHERE id = _relation_id;
  ELSE
    RAISE EXCEPTION 'Operazione riservata agli amministratori delle aziende collegate';
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_rel.seller_company_id, _uid, 'relation.side_toggled', 'relation', _relation_id,
          jsonb_build_object('side', _side, 'enabled', _enabled,
                             'buyer_company_id', _rel.buyer_company_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_company_relation(_relation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _rel public.supplier_customer_relations;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta';
  END IF;

  SELECT * INTO _rel FROM public.supplier_customer_relations WHERE id = _relation_id;
  IF _rel.id IS NULL THEN
    RAISE EXCEPTION 'Collegamento non trovato';
  END IF;

  IF NOT (public.is_company_admin(_rel.seller_company_id) OR public.is_company_admin(_rel.buyer_company_id)) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori delle aziende collegate';
  END IF;

  UPDATE public.supplier_customer_relations
  SET status = 'revocato', decided_at = now(), decided_by = _uid
  WHERE id = _relation_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_rel.seller_company_id, _uid, 'relation.revoked', 'relation', _relation_id,
          jsonb_build_object('buyer_company_id', _rel.buyer_company_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.available_buyers()
RETURNS TABLE (id uuid, legal_name text, city text, province text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.legal_name, c.city, c.province
  FROM public.companies c
  WHERE c.can_buy
    AND c.status = 'attivo'
    AND EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.user_id = auth.uid()
        AND m.status = 'attivo'
        AND public.company_sells(m.company_id)
        AND m.company_id <> c.id
    );
$$;

REVOKE ALL ON FUNCTION public.relation_is_operational(uuid, uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.invite_customer_relation(uuid, uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.decide_company_relation(uuid, boolean) FROM anon, public;
REVOKE ALL ON FUNCTION public.set_relation_side_enabled(uuid, boolean) FROM anon, public;
REVOKE ALL ON FUNCTION public.revoke_company_relation(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.available_buyers() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.relation_is_operational(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_customer_relation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_company_relation(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_relation_side_enabled(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_company_relation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.available_buyers() TO authenticated;
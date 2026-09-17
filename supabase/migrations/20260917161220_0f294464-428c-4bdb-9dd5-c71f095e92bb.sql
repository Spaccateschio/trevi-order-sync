-- 1) Codice invito breve
ALTER TABLE public.company_invitations
  ADD COLUMN IF NOT EXISTS invite_code text,
  ADD COLUMN IF NOT EXISTS is_free_invite boolean NOT NULL DEFAULT false;

ALTER TABLE public.company_invitations ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.company_invitations ALTER COLUMN email_normalized DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS company_invitations_invite_code_key
  ON public.company_invitations (invite_code) WHERE invite_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  _code text;
  _i int;
BEGIN
  LOOP
    _code := '';
    FOR _i IN 1..8 LOOP
      _code := _code || substr(_alphabet, 1 + floor(random() * length(_alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.company_invitations WHERE invite_code = _code);
  END LOOP;
  RETURN _code;
END;
$$;

-- 2) Nucleo di accettazione condiviso
CREATE OR REPLACE FUNCTION public.accept_invitation_row(_invitation_id uuid, _buyer_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _inv public.company_invitations;
  _record public.customer_records;
  _buyer_vat text;
  _relation_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Autenticazione richiesta'; END IF;

  SELECT * INTO _inv FROM public.company_invitations WHERE id = _invitation_id;
  IF _inv.id IS NULL THEN RAISE EXCEPTION 'Invito non valido'; END IF;
  IF _inv.status <> 'in_attesa' THEN RAISE EXCEPTION 'Invito non più utilizzabile'; END IF;
  IF _inv.expires_at < now() THEN
    UPDATE public.company_invitations SET status = 'annullato_scaduto', decided_at = now() WHERE id = _inv.id;
    RAISE EXCEPTION 'Invito scaduto: chiedi al fornitore di reinviarlo';
  END IF;

  IF NOT public.is_company_admin(_buyer_company_id) THEN
    RAISE EXCEPTION 'Solo un amministratore della tua azienda può accettare l''invito';
  END IF;
  IF NOT public.company_buys(_buyer_company_id) THEN
    RAISE EXCEPTION 'La tua azienda non ha il profilo di acquisto attivo';
  END IF;
  IF NOT public.company_sells(_inv.seller_company_id) THEN
    RAISE EXCEPTION 'L''azienda che ha inviato l''invito non vende sulla piattaforma';
  END IF;
  IF _buyer_company_id = _inv.seller_company_id THEN
    RAISE EXCEPTION 'Non puoi collegarti alla tua stessa azienda';
  END IF;

  SELECT vat_normalized INTO _buyer_vat FROM public.companies WHERE id = _buyer_company_id;
  IF _inv.customer_record_id IS NOT NULL THEN
    SELECT * INTO _record FROM public.customer_records WHERE id = _inv.customer_record_id;
    IF _record.vat_normalized IS NOT NULL AND _buyer_vat IS NOT NULL
       AND _record.vat_normalized <> _buyer_vat THEN
      RAISE EXCEPTION 'La partita IVA della tua azienda non corrisponde a quella della scheda cliente: serve una conferma dell''amministratore del fornitore';
    END IF;
  END IF;

  SELECT id INTO _relation_id FROM public.supplier_customer_relations
  WHERE seller_company_id = _inv.seller_company_id AND buyer_company_id = _buyer_company_id;

  IF _relation_id IS NULL THEN
    INSERT INTO public.supplier_customer_relations (
      seller_company_id, buyer_company_id, status, origin, requested_by,
      seller_enabled, buyer_enabled, accepted_at, decided_at, decided_by, customer_record_id
    ) VALUES (
      _inv.seller_company_id, _buyer_company_id, 'attivo', 'invito_fornitore', _inv.invited_by,
      true, true, now(), now(), _uid,
      CASE WHEN _inv.customer_record_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM public.supplier_customer_relations r
                             WHERE r.customer_record_id = _inv.customer_record_id)
           THEN _inv.customer_record_id ELSE NULL END
    ) RETURNING id INTO _relation_id;
  ELSE
    UPDATE public.supplier_customer_relations SET
      status = 'attivo', seller_enabled = true, buyer_enabled = true,
      accepted_at = coalesce(accepted_at, now()), decided_at = now(), decided_by = _uid,
      customer_record_id = coalesce(customer_record_id,
        CASE WHEN _inv.customer_record_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM public.supplier_customer_relations r
                               WHERE r.customer_record_id = _inv.customer_record_id AND r.id <> _relation_id)
             THEN _inv.customer_record_id ELSE NULL END)
    WHERE id = _relation_id;
  END IF;

  UPDATE public.company_invitations
  SET status = 'accettato', decided_at = now(), relation_id = _relation_id,
      token_hash = encode(sha256(gen_random_uuid()::text::bytea), 'hex'),
      invite_code = NULL
  WHERE id = _inv.id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_inv.seller_company_id, _uid, 'invitation.accepted', 'relation', _relation_id,
          jsonb_build_object('invitation_id', _inv.id, 'buyer_company_id', _buyer_company_id,
                             'customer_record_id', _inv.customer_record_id));

  RETURN _relation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_invitation_row(uuid, uuid) FROM anon, authenticated;

-- 3) Accettazione per token (invariata dall'esterno) e per codice
CREATE OR REPLACE FUNCTION public.accept_customer_invitation(_token text, _buyer_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  SELECT id INTO _id FROM public.company_invitations
  WHERE token_hash = encode(sha256(coalesce(_token, '')::bytea), 'hex');
  IF _id IS NULL THEN RAISE EXCEPTION 'Invito non valido'; END IF;
  RETURN public.accept_invitation_row(_id, _buyer_company_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_invitation_code(_code text, _buyer_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _norm text := upper(regexp_replace(coalesce(_code, ''), '[^A-Za-z0-9]', '', 'g'));
  _id uuid;
BEGIN
  IF _norm = '' THEN RAISE EXCEPTION 'Indica il codice invito'; END IF;

  UPDATE public.company_invitations SET status = 'annullato_scaduto', decided_at = now()
  WHERE status = 'in_attesa' AND expires_at < now();

  SELECT id INTO _id FROM public.company_invitations WHERE invite_code = _norm;
  IF _id IS NULL THEN RAISE EXCEPTION 'Codice invito non valido o già utilizzato'; END IF;
  RETURN public.accept_invitation_row(_id, _buyer_company_id);
END;
$$;

-- 4) Creazione invito: aggiunge il codice breve
DROP FUNCTION IF EXISTS public.create_customer_invitation(uuid, text, integer);
CREATE FUNCTION public.create_customer_invitation(_customer_record_id uuid, _email text, _valid_days integer DEFAULT 14)
RETURNS TABLE(invitation_id uuid, token text, invite_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _seller uuid;
  _email_norm text := lower(btrim(coalesce(_email, '')));
  _token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  _code text := public.generate_invite_code();
  _id uuid;
BEGIN
  SELECT seller_company_id INTO _seller FROM public.customer_records WHERE id = _customer_record_id;
  IF _seller IS NULL THEN RAISE EXCEPTION 'Cliente non trovato'; END IF;
  IF _uid IS NULL OR NOT public.is_company_admin(_seller) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;
  IF _email_norm = '' OR position('@' in _email_norm) = 0 THEN
    RAISE EXCEPTION 'Indica un indirizzo email valido';
  END IF;

  UPDATE public.company_invitations SET status = 'annullato_scaduto', decided_at = now()
  WHERE seller_company_id = _seller AND status = 'in_attesa' AND expires_at < now();

  IF EXISTS (
    SELECT 1 FROM public.company_invitations
    WHERE seller_company_id = _seller AND email_normalized = _email_norm AND status = 'in_attesa'
  ) THEN
    RAISE EXCEPTION 'Esiste già un invito in attesa per questa email: usa Reinvia';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.customer_records cr
    JOIN public.companies c ON c.vat_normalized = cr.vat_normalized
    JOIN public.supplier_customer_relations r
      ON r.seller_company_id = _seller AND r.buyer_company_id = c.id AND r.status = 'attivo'
    WHERE cr.id = _customer_record_id AND cr.vat_normalized IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Questo cliente è già collegato alla tua azienda';
  END IF;

  INSERT INTO public.company_invitations (
    seller_company_id, customer_record_id, email, email_normalized, token_hash,
    invite_code, expires_at, invited_by
  ) VALUES (
    _seller, _customer_record_id, btrim(_email), _email_norm,
    encode(sha256(_token::bytea), 'hex'), _code,
    now() + make_interval(days => greatest(1, least(60, coalesce(_valid_days, 14)))), _uid
  ) RETURNING id INTO _id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_seller, _uid, 'invitation.created', 'invitation', _id,
          jsonb_build_object('customer_record_id', _customer_record_id, 'email', _email_norm));

  RETURN QUERY SELECT _id, _token, _code;
END;
$$;

-- 5) Invito rapido senza scheda cliente
CREATE OR REPLACE FUNCTION public.create_free_invitation(_seller_company_id uuid, _email text DEFAULT NULL, _valid_days integer DEFAULT 14)
RETURNS TABLE(invitation_id uuid, token text, invite_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email_norm text := nullif(lower(btrim(coalesce(_email, ''))), '');
  _token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  _code text := public.generate_invite_code();
  _id uuid;
BEGIN
  IF _uid IS NULL OR NOT public.is_company_admin(_seller_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;
  IF NOT public.company_sells(_seller_company_id) THEN
    RAISE EXCEPTION 'La tua azienda non ha il profilo di vendita attivo';
  END IF;
  IF _email_norm IS NOT NULL AND position('@' in _email_norm) = 0 THEN
    RAISE EXCEPTION 'Indica un indirizzo email valido oppure lascia il campo vuoto';
  END IF;

  UPDATE public.company_invitations SET status = 'annullato_scaduto', decided_at = now()
  WHERE seller_company_id = _seller_company_id AND status = 'in_attesa' AND expires_at < now();

  IF _email_norm IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.company_invitations
    WHERE seller_company_id = _seller_company_id AND email_normalized = _email_norm AND status = 'in_attesa'
  ) THEN
    RAISE EXCEPTION 'Esiste già un invito in attesa per questa email: usa Rinnova';
  END IF;

  INSERT INTO public.company_invitations (
    seller_company_id, customer_record_id, email, email_normalized, token_hash,
    invite_code, is_free_invite, expires_at, invited_by
  ) VALUES (
    _seller_company_id, NULL, nullif(btrim(coalesce(_email, '')), ''), _email_norm,
    encode(sha256(_token::bytea), 'hex'), _code, true,
    now() + make_interval(days => greatest(1, least(60, coalesce(_valid_days, 14)))), _uid
  ) RETURNING id INTO _id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_seller_company_id, _uid, 'invitation.created_free', 'invitation', _id,
          jsonb_build_object('email', _email_norm));

  RETURN QUERY SELECT _id, _token, _code;
END;
$$;

-- 6) Ricerca aziende collegabili
CREATE OR REPLACE FUNCTION public.search_companies(_query text, _role text)
RETURNS TABLE(id uuid, legal_name text, city text, province text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;
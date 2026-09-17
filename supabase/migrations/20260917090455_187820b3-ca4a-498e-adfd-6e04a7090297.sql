-- 1. Normalizzazione P.IVA
CREATE OR REPLACE FUNCTION public.normalize_vat(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(regexp_replace(regexp_replace(upper(coalesce(_value, '')), '[^0-9A-Z]', '', 'g'), '^[A-Z]{2}', ''), '');
$$;

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS vat_normalized text;
UPDATE public.companies SET vat_normalized = public.normalize_vat(vat_number);

CREATE OR REPLACE FUNCTION public.set_vat_normalized()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.vat_normalized = public.normalize_vat(NEW.vat_number);
  RETURN NEW;
END;
$$;

CREATE TRIGGER companies_set_vat_normalized
BEFORE INSERT OR UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.set_vat_normalized();

CREATE UNIQUE INDEX companies_vat_normalized_unique
  ON public.companies (vat_normalized) WHERE vat_normalized IS NOT NULL;

-- 2. Anagrafica clienti del venditore
CREATE TABLE public.customer_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  legal_name text NOT NULL,
  vat_number text,
  vat_normalized text,
  tax_code text,
  email text,
  phone text,
  address_line text,
  postal_code text,
  city text,
  province text,
  delivery_address_line text,
  delivery_postal_code text,
  delivery_city text,
  delivery_province text,
  delivery_notes text,
  internal_reference text,
  notes text,
  status entity_status NOT NULL DEFAULT 'attivo',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_records TO authenticated;
GRANT ALL ON public.customer_records TO service_role;
ALTER TABLE public.customer_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_records_select" ON public.customer_records
  FOR SELECT TO authenticated USING (public.is_company_member(seller_company_id));
CREATE POLICY "customer_records_insert" ON public.customer_records
  FOR INSERT TO authenticated WITH CHECK (public.is_company_admin(seller_company_id));
CREATE POLICY "customer_records_update" ON public.customer_records
  FOR UPDATE TO authenticated USING (public.is_company_admin(seller_company_id))
  WITH CHECK (public.is_company_admin(seller_company_id));

CREATE TRIGGER customer_records_set_updated_at
BEFORE UPDATE ON public.customer_records
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER customer_records_set_vat_normalized
BEFORE INSERT OR UPDATE ON public.customer_records
FOR EACH ROW EXECUTE FUNCTION public.set_vat_normalized();

CREATE UNIQUE INDEX customer_records_seller_vat_unique
  ON public.customer_records (seller_company_id, vat_normalized) WHERE vat_normalized IS NOT NULL;
CREATE INDEX customer_records_seller_idx ON public.customer_records (seller_company_id);

-- 3. Collegamento scheda cliente <-> rapporto commerciale
ALTER TABLE public.supplier_customer_relations
  ADD COLUMN IF NOT EXISTS customer_record_id uuid REFERENCES public.customer_records(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX relations_customer_record_unique
  ON public.supplier_customer_relations (customer_record_id) WHERE customer_record_id IS NOT NULL;

-- 4. Inviti B2B
CREATE TYPE public.invitation_status AS ENUM ('in_attesa', 'accettato', 'annullato', 'annullato_scaduto');

CREATE TABLE public.company_invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  customer_record_id uuid REFERENCES public.customer_records(id) ON DELETE SET NULL,
  email text NOT NULL,
  email_normalized text NOT NULL,
  token_hash text NOT NULL,
  status invitation_status NOT NULL DEFAULT 'in_attesa',
  expires_at timestamptz NOT NULL,
  invited_by uuid,
  sent_at timestamptz NOT NULL DEFAULT now(),
  resend_count integer NOT NULL DEFAULT 0,
  relation_id uuid REFERENCES public.supplier_customer_relations(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.company_invitations TO authenticated;
GRANT ALL ON public.company_invitations TO service_role;
ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_invitations_select" ON public.company_invitations
  FOR SELECT TO authenticated USING (public.is_company_member(seller_company_id));

CREATE TRIGGER company_invitations_set_updated_at
BEFORE UPDATE ON public.company_invitations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX company_invitations_pending_unique
  ON public.company_invitations (seller_company_id, email_normalized) WHERE status = 'in_attesa';
CREATE INDEX company_invitations_token_idx ON public.company_invitations (token_hash);

-- 5. Gestione anagrafica clienti
CREATE OR REPLACE FUNCTION public.manage_customer_record(
  _seller_company_id uuid,
  _action text,
  _customer_record_id uuid DEFAULT NULL,
  _legal_name text DEFAULT NULL,
  _vat_number text DEFAULT NULL,
  _tax_code text DEFAULT NULL,
  _email text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _address_line text DEFAULT NULL,
  _postal_code text DEFAULT NULL,
  _city text DEFAULT NULL,
  _province text DEFAULT NULL,
  _delivery_address_line text DEFAULT NULL,
  _delivery_postal_code text DEFAULT NULL,
  _delivery_city text DEFAULT NULL,
  _delivery_province text DEFAULT NULL,
  _delivery_notes text DEFAULT NULL,
  _internal_reference text DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
BEGIN
  IF _uid IS NULL OR NOT public.is_company_admin(_seller_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;
  IF NOT public.company_sells(_seller_company_id) THEN
    RAISE EXCEPTION 'L''anagrafica clienti è disponibile solo per le aziende che vendono';
  END IF;

  IF _action = 'create' THEN
    IF coalesce(btrim(_legal_name), '') = '' THEN
      RAISE EXCEPTION 'La ragione sociale è obbligatoria';
    END IF;
    INSERT INTO public.customer_records (
      seller_company_id, legal_name, vat_number, tax_code, email, phone,
      address_line, postal_code, city, province,
      delivery_address_line, delivery_postal_code, delivery_city, delivery_province, delivery_notes,
      internal_reference, notes, created_by
    ) VALUES (
      _seller_company_id, btrim(_legal_name), NULLIF(btrim(_vat_number), ''), NULLIF(btrim(_tax_code), ''),
      NULLIF(btrim(_email), ''), NULLIF(btrim(_phone), ''),
      NULLIF(_address_line, ''), NULLIF(_postal_code, ''), NULLIF(_city, ''), NULLIF(_province, ''),
      NULLIF(_delivery_address_line, ''), NULLIF(_delivery_postal_code, ''), NULLIF(_delivery_city, ''),
      NULLIF(_delivery_province, ''), NULLIF(_delivery_notes, ''),
      NULLIF(_internal_reference, ''), NULLIF(_notes, ''), _uid
    ) RETURNING id INTO _id;
  ELSE
    SELECT id INTO _id FROM public.customer_records
    WHERE id = _customer_record_id AND seller_company_id = _seller_company_id;
    IF _id IS NULL THEN RAISE EXCEPTION 'Cliente non trovato'; END IF;

    IF _action = 'update' THEN
      IF coalesce(btrim(_legal_name), '') = '' THEN
        RAISE EXCEPTION 'La ragione sociale è obbligatoria';
      END IF;
      UPDATE public.customer_records SET
        legal_name = btrim(_legal_name),
        vat_number = NULLIF(btrim(_vat_number), ''),
        tax_code = NULLIF(btrim(_tax_code), ''),
        email = NULLIF(btrim(_email), ''),
        phone = NULLIF(btrim(_phone), ''),
        address_line = NULLIF(_address_line, ''),
        postal_code = NULLIF(_postal_code, ''),
        city = NULLIF(_city, ''),
        province = NULLIF(_province, ''),
        delivery_address_line = NULLIF(_delivery_address_line, ''),
        delivery_postal_code = NULLIF(_delivery_postal_code, ''),
        delivery_city = NULLIF(_delivery_city, ''),
        delivery_province = NULLIF(_delivery_province, ''),
        delivery_notes = NULLIF(_delivery_notes, ''),
        internal_reference = NULLIF(_internal_reference, ''),
        notes = NULLIF(_notes, '')
      WHERE id = _id;
    ELSIF _action = 'deactivate' THEN
      UPDATE public.customer_records SET status = 'disattivato' WHERE id = _id;
    ELSIF _action = 'activate' THEN
      UPDATE public.customer_records SET status = 'attivo' WHERE id = _id;
    ELSE
      RAISE EXCEPTION 'Operazione anagrafica non valida';
    END IF;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_seller_company_id, _uid, 'customer_record.' || _action, 'customer_record', _id,
          jsonb_build_object('legal_name', _legal_name, 'vat_number', _vat_number));
  RETURN _id;
END;
$$;

-- 6. Inviti: creazione, reinvio, annullamento
CREATE OR REPLACE FUNCTION public.create_customer_invitation(
  _customer_record_id uuid,
  _email text,
  _valid_days integer DEFAULT 14
)
RETURNS TABLE(invitation_id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _seller uuid;
  _email_norm text := lower(btrim(coalesce(_email, '')));
  _token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
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

  -- Scadenze automatiche prima del controllo di duplicato
  UPDATE public.company_invitations SET status = 'annullato_scaduto', decided_at = now()
  WHERE seller_company_id = _seller AND status = 'in_attesa' AND expires_at < now();

  IF EXISTS (
    SELECT 1 FROM public.company_invitations
    WHERE seller_company_id = _seller AND email_normalized = _email_norm AND status = 'in_attesa'
  ) THEN
    RAISE EXCEPTION 'Esiste già un invito in attesa per questa email: usa Reinvia';
  END IF;

  INSERT INTO public.company_invitations (
    seller_company_id, customer_record_id, email, email_normalized, token_hash,
    expires_at, invited_by
  ) VALUES (
    _seller, _customer_record_id, btrim(_email), _email_norm,
    encode(sha256(_token::bytea), 'hex'),
    now() + make_interval(days => greatest(1, least(60, coalesce(_valid_days, 14)))), _uid
  ) RETURNING id INTO _id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_seller, _uid, 'invitation.created', 'invitation', _id,
          jsonb_build_object('customer_record_id', _customer_record_id, 'email', _email_norm));

  RETURN QUERY SELECT _id, _token;
END;
$$;

CREATE OR REPLACE FUNCTION public.resend_customer_invitation(
  _invitation_id uuid,
  _valid_days integer DEFAULT 14
)
RETURNS TABLE(invitation_id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _seller uuid;
  _status invitation_status;
  _token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
BEGIN
  SELECT seller_company_id, status INTO _seller, _status
  FROM public.company_invitations WHERE id = _invitation_id;
  IF _seller IS NULL THEN RAISE EXCEPTION 'Invito non trovato'; END IF;
  IF _uid IS NULL OR NOT public.is_company_admin(_seller) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;
  IF _status = 'accettato' THEN RAISE EXCEPTION 'Invito già accettato'; END IF;

  UPDATE public.company_invitations SET
    token_hash = encode(sha256(_token::bytea), 'hex'),
    status = 'in_attesa',
    expires_at = now() + make_interval(days => greatest(1, least(60, coalesce(_valid_days, 14)))),
    sent_at = now(),
    decided_at = NULL,
    resend_count = resend_count + 1
  WHERE id = _invitation_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_seller, _uid, 'invitation.resent', 'invitation', _invitation_id, '{}'::jsonb);

  RETURN QUERY SELECT _invitation_id, _token;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_customer_invitation(_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _seller uuid;
  _status invitation_status;
BEGIN
  SELECT seller_company_id, status INTO _seller, _status
  FROM public.company_invitations WHERE id = _invitation_id;
  IF _seller IS NULL THEN RAISE EXCEPTION 'Invito non trovato'; END IF;
  IF _uid IS NULL OR NOT public.is_company_admin(_seller) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;
  IF _status = 'accettato' THEN RAISE EXCEPTION 'Invito già accettato'; END IF;

  UPDATE public.company_invitations
  SET status = 'annullato', decided_at = now(), token_hash = encode(sha256(gen_random_uuid()::text::bytea), 'hex')
  WHERE id = _invitation_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_seller, _uid, 'invitation.cancelled', 'invitation', _invitation_id, '{}'::jsonb);
END;
$$;

-- 7. Lettura invito tramite gettone (nessun dato sensibile, solo contesto)
CREATE OR REPLACE FUNCTION public.invitation_preview(_token text)
RETURNS TABLE(
  invitation_id uuid,
  seller_company_name text,
  customer_legal_name text,
  customer_vat_normalized text,
  email text,
  status invitation_status,
  expired boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticazione richiesta'; END IF;
  RETURN QUERY
  SELECT inv.id, s.legal_name, cr.legal_name, cr.vat_normalized, inv.email, inv.status,
         inv.expires_at < now()
  FROM public.company_invitations inv
  JOIN public.companies s ON s.id = inv.seller_company_id
  LEFT JOIN public.customer_records cr ON cr.id = inv.customer_record_id
  WHERE inv.token_hash = encode(sha256(coalesce(_token, '')::bytea), 'hex');
END;
$$;

-- 8. Accettazione invito: gettone valido + conferma esplicita + coerenza P.IVA
CREATE OR REPLACE FUNCTION public.accept_customer_invitation(_token text, _buyer_company_id uuid)
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

  SELECT * INTO _inv FROM public.company_invitations
  WHERE token_hash = encode(sha256(coalesce(_token, '')::bytea), 'hex');
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
      token_hash = encode(sha256(gen_random_uuid()::text::bytea), 'hex')
  WHERE id = _inv.id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_inv.seller_company_id, _uid, 'invitation.accepted', 'relation', _relation_id,
          jsonb_build_object('invitation_id', _inv.id, 'buyer_company_id', _buyer_company_id,
                             'customer_record_id', _inv.customer_record_id));

  RETURN _relation_id;
END;
$$;

-- 9. Collegamento manuale scheda cliente <-> rapporto (solo azione esplicita del venditore)
CREATE OR REPLACE FUNCTION public.link_customer_record_to_relation(
  _relation_id uuid,
  _customer_record_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _rel public.supplier_customer_relations;
  _record public.customer_records;
  _buyer_vat text;
BEGIN
  SELECT * INTO _rel FROM public.supplier_customer_relations WHERE id = _relation_id;
  IF _rel.id IS NULL THEN RAISE EXCEPTION 'Collegamento non trovato'; END IF;
  IF _uid IS NULL OR NOT public.is_company_admin(_rel.seller_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda venditrice';
  END IF;

  IF _customer_record_id IS NULL THEN
    UPDATE public.supplier_customer_relations SET customer_record_id = NULL WHERE id = _relation_id;
  ELSE
    SELECT * INTO _record FROM public.customer_records WHERE id = _customer_record_id;
    IF _record.id IS NULL OR _record.seller_company_id <> _rel.seller_company_id THEN
      RAISE EXCEPTION 'La scheda cliente non appartiene alla tua azienda';
    END IF;
    SELECT vat_normalized INTO _buyer_vat FROM public.companies WHERE id = _rel.buyer_company_id;
    IF _record.vat_normalized IS NOT NULL AND _buyer_vat IS NOT NULL
       AND _record.vat_normalized <> _buyer_vat THEN
      RAISE EXCEPTION 'Partite IVA differenti: verifica i dati prima di collegare scheda e azienda';
    END IF;
    UPDATE public.supplier_customer_relations SET customer_record_id = _customer_record_id
    WHERE id = _relation_id;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_rel.seller_company_id, _uid,
          CASE WHEN _customer_record_id IS NULL THEN 'relation.record_unlinked' ELSE 'relation.record_linked' END,
          'relation', _relation_id,
          jsonb_build_object('customer_record_id', _customer_record_id));
END;
$$;

-- 10. Suggerimento (mai automatico) di corrispondenza per P.IVA
CREATE OR REPLACE FUNCTION public.customer_record_match_suggestions(_customer_record_id uuid)
RETURNS TABLE(company_id uuid, legal_name text, vat_normalized text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    AND c.status = 'attivo';
END;
$$;

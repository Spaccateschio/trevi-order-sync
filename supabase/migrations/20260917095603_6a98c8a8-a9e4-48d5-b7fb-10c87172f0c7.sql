-- 1. Enum funzioni indirizzo
CREATE TYPE public.address_function AS ENUM ('sede_legale','sede_operativa','consegna','ritiro','magazzino');
CREATE TYPE public.proposed_update_status AS ENUM ('in_attesa','accettato','rifiutato');

-- 2. Indirizzi
CREATE TABLE public.addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_record_id uuid REFERENCES public.customer_records(id) ON DELETE CASCADE,
  label text NOT NULL,
  address_line text,
  street_number text,
  postal_code text,
  city text,
  province text,
  country text NOT NULL DEFAULT 'Italia',
  contact_name text,
  phone text,
  notes text,
  status public.entity_status NOT NULL DEFAULT 'attivo',
  visible_to_partners boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT addresses_single_owner CHECK (
    (company_id IS NOT NULL AND customer_record_id IS NULL)
    OR (company_id IS NULL AND customer_record_id IS NOT NULL)
  )
);
CREATE INDEX addresses_company_idx ON public.addresses(company_id);
CREATE INDEX addresses_record_idx ON public.addresses(customer_record_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses TO authenticated;
GRANT ALL ON public.addresses TO service_role;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER addresses_updated_at BEFORE UPDATE ON public.addresses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Funzioni dell'indirizzo (un indirizzo può servire a più scopi)
CREATE TABLE public.address_functions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address_id uuid NOT NULL REFERENCES public.addresses(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_record_id uuid REFERENCES public.customer_records(id) ON DELETE CASCADE,
  function public.address_function NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (address_id, function)
);
CREATE UNIQUE INDEX address_functions_company_default_unique
  ON public.address_functions(company_id, function) WHERE is_default AND company_id IS NOT NULL;
CREATE UNIQUE INDEX address_functions_record_default_unique
  ON public.address_functions(customer_record_id, function) WHERE is_default AND customer_record_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.address_functions TO authenticated;
GRANT ALL ON public.address_functions TO service_role;
ALTER TABLE public.address_functions ENABLE ROW LEVEL SECURITY;

-- Il proprietario della funzione deriva sempre dall'indirizzo: mai dal browser
CREATE OR REPLACE FUNCTION public.address_function_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _a public.addresses;
BEGIN
  SELECT * INTO _a FROM public.addresses WHERE id = NEW.address_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'Indirizzo non trovato'; END IF;
  NEW.company_id := _a.company_id;
  NEW.customer_record_id := _a.customer_record_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER address_functions_owner BEFORE INSERT OR UPDATE ON public.address_functions
FOR EACH ROW EXECUTE FUNCTION public.address_function_owner();

-- 4. Visibilità: mai automatica verso i partner
CREATE OR REPLACE FUNCTION public.can_read_company_address(_company_id uuid, _visible boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _company_id IS NULL THEN RETURN false; END IF;
  IF public.is_company_member(_company_id) THEN RETURN true; END IF;
  IF NOT coalesce(_visible, false) THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.supplier_customer_relations r
    JOIN public.company_members m
      ON m.user_id = auth.uid() AND m.status = 'attivo'
     AND m.company_id = CASE WHEN r.seller_company_id = _company_id
                             THEN r.buyer_company_id ELSE r.seller_company_id END
    WHERE (r.seller_company_id = _company_id OR r.buyer_company_id = _company_id)
      AND r.status = 'attivo' AND r.seller_enabled AND r.buyer_enabled
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.owns_customer_record(_customer_record_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customer_records cr
    WHERE cr.id = _customer_record_id
      AND public.is_company_member(cr.seller_company_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_customer_record(_customer_record_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customer_records cr
    WHERE cr.id = _customer_record_id
      AND public.is_company_admin(cr.seller_company_id)
  );
$$;

CREATE POLICY "Indirizzi visibili a proprietari e partner autorizzati"
ON public.addresses FOR SELECT TO authenticated
USING (
  public.can_read_company_address(company_id, visible_to_partners)
  OR public.owns_customer_record(customer_record_id)
);

CREATE POLICY "Solo amministratori creano indirizzi propri"
ON public.addresses FOR INSERT TO authenticated
WITH CHECK (
  (company_id IS NOT NULL AND public.is_company_admin(company_id))
  OR public.can_write_customer_record(customer_record_id)
);

CREATE POLICY "Solo amministratori modificano indirizzi propri"
ON public.addresses FOR UPDATE TO authenticated
USING (
  (company_id IS NOT NULL AND public.is_company_admin(company_id))
  OR public.can_write_customer_record(customer_record_id)
)
WITH CHECK (
  (company_id IS NOT NULL AND public.is_company_admin(company_id))
  OR public.can_write_customer_record(customer_record_id)
);

CREATE POLICY "Solo amministratori rimuovono indirizzi propri"
ON public.addresses FOR DELETE TO authenticated
USING (
  (company_id IS NOT NULL AND public.is_company_admin(company_id))
  OR public.can_write_customer_record(customer_record_id)
);

CREATE POLICY "Funzioni indirizzo leggibili con l'indirizzo"
ON public.address_functions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.addresses a
    WHERE a.id = address_id
      AND (public.can_read_company_address(a.company_id, a.visible_to_partners)
           OR public.owns_customer_record(a.customer_record_id))
  )
);

CREATE POLICY "Funzioni indirizzo gestite dagli amministratori"
ON public.address_functions FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.addresses a
    WHERE a.id = address_id
      AND ((a.company_id IS NOT NULL AND public.is_company_admin(a.company_id))
           OR public.can_write_customer_record(a.customer_record_id))
  )
);

CREATE POLICY "Funzioni indirizzo aggiornate dagli amministratori"
ON public.address_functions FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.addresses a
    WHERE a.id = address_id
      AND ((a.company_id IS NOT NULL AND public.is_company_admin(a.company_id))
           OR public.can_write_customer_record(a.customer_record_id))
  )
)
WITH CHECK (true);

CREATE POLICY "Funzioni indirizzo rimosse dagli amministratori"
ON public.address_functions FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.addresses a
    WHERE a.id = address_id
      AND ((a.company_id IS NOT NULL AND public.is_company_admin(a.company_id))
           OR public.can_write_customer_record(a.customer_record_id))
  )
);

-- 5. Aggiornamenti proposti dal cliente al venditore
CREATE TABLE public.customer_record_proposed_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_record_id uuid NOT NULL REFERENCES public.customer_records(id) ON DELETE CASCADE,
  seller_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  current_value text,
  proposed_value text,
  source text NOT NULL DEFAULT 'registrazione_invito',
  status public.proposed_update_status NOT NULL DEFAULT 'in_attesa',
  proposed_by uuid,
  decided_at timestamptz,
  decided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crpu_record_idx ON public.customer_record_proposed_updates(customer_record_id);

GRANT SELECT, UPDATE ON public.customer_record_proposed_updates TO authenticated;
GRANT ALL ON public.customer_record_proposed_updates TO service_role;
ALTER TABLE public.customer_record_proposed_updates ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER crpu_updated_at BEFORE UPDATE ON public.customer_record_proposed_updates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Il venditore vede le proposte sulle proprie schede"
ON public.customer_record_proposed_updates FOR SELECT TO authenticated
USING (public.is_company_member(seller_company_id));

CREATE POLICY "Il venditore decide sulle proprie proposte"
ON public.customer_record_proposed_updates FOR UPDATE TO authenticated
USING (public.is_company_admin(seller_company_id))
WITH CHECK (public.is_company_admin(seller_company_id));

-- 6. Migrazione degli indirizzi esistenti, senza perdita
INSERT INTO public.addresses (company_id, label, address_line, postal_code, city, province, phone, created_by)
SELECT c.id, 'Sede legale', c.address_line, c.postal_code, c.city, c.province, c.phone, c.created_by
FROM public.companies c
WHERE coalesce(c.address_line, c.postal_code, c.city, c.province) IS NOT NULL;

INSERT INTO public.address_functions (address_id, function, is_default)
SELECT a.id, 'sede_legale', true FROM public.addresses a
WHERE a.company_id IS NOT NULL AND a.label = 'Sede legale';

INSERT INTO public.addresses (company_id, label, address_line, postal_code, city, province, notes, created_by)
SELECT c.id, 'Consegna', c.delivery_address_line, c.delivery_postal_code, c.delivery_city,
       c.delivery_province, c.delivery_notes, c.created_by
FROM public.companies c
WHERE coalesce(c.delivery_address_line, c.delivery_postal_code, c.delivery_city, c.delivery_province) IS NOT NULL;

INSERT INTO public.address_functions (address_id, function, is_default)
SELECT a.id, 'consegna', true FROM public.addresses a
WHERE a.company_id IS NOT NULL AND a.label = 'Consegna';

INSERT INTO public.addresses (customer_record_id, label, address_line, postal_code, city, province, phone, created_by)
SELECT cr.id, 'Sede legale', cr.address_line, cr.postal_code, cr.city, cr.province, cr.phone, cr.created_by
FROM public.customer_records cr
WHERE coalesce(cr.address_line, cr.postal_code, cr.city, cr.province) IS NOT NULL;

INSERT INTO public.address_functions (address_id, function, is_default)
SELECT a.id, 'sede_legale', true FROM public.addresses a
WHERE a.customer_record_id IS NOT NULL AND a.label = 'Sede legale';

INSERT INTO public.addresses (customer_record_id, label, address_line, postal_code, city, province, notes, created_by)
SELECT cr.id, 'Consegna', cr.delivery_address_line, cr.delivery_postal_code, cr.delivery_city,
       cr.delivery_province, cr.delivery_notes, cr.created_by
FROM public.customer_records cr
WHERE coalesce(cr.delivery_address_line, cr.delivery_postal_code, cr.delivery_city, cr.delivery_province) IS NOT NULL;

INSERT INTO public.address_functions (address_id, function, is_default)
SELECT a.id, 'consegna', true FROM public.addresses a
WHERE a.customer_record_id IS NOT NULL AND a.label = 'Consegna';

-- 7. Anteprima invito accessibile anche prima dell'accesso (il codice è l'unica prova)
DROP FUNCTION IF EXISTS public.invitation_preview(text);
CREATE OR REPLACE FUNCTION public.invitation_preview(_token text)
RETURNS TABLE(
  invitation_id uuid,
  seller_company_id uuid,
  seller_company_name text,
  customer_record_id uuid,
  customer_legal_name text,
  customer_vat_number text,
  customer_vat_normalized text,
  customer_tax_code text,
  customer_email text,
  customer_phone text,
  customer_address_line text,
  customer_postal_code text,
  customer_city text,
  customer_province text,
  customer_delivery_address_line text,
  customer_delivery_postal_code text,
  customer_delivery_city text,
  customer_delivery_province text,
  customer_delivery_notes text,
  email text,
  status public.invitation_status,
  expired boolean,
  company_exists_for_vat boolean,
  vat_mismatch boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _my_vat text;
BEGIN
  SELECT c.vat_normalized INTO _my_vat
  FROM public.company_members m
  JOIN public.companies c ON c.id = m.company_id
  WHERE m.user_id = auth.uid() AND m.status = 'attivo'
  LIMIT 1;

  RETURN QUERY
  SELECT inv.id, inv.seller_company_id, s.legal_name, cr.id, cr.legal_name, cr.vat_number,
         cr.vat_normalized, cr.tax_code, cr.email, cr.phone,
         cr.address_line, cr.postal_code, cr.city, cr.province,
         cr.delivery_address_line, cr.delivery_postal_code, cr.delivery_city,
         cr.delivery_province, cr.delivery_notes,
         inv.email, inv.status, inv.expires_at < now(),
         EXISTS (SELECT 1 FROM public.companies c2
                 WHERE c2.vat_normalized IS NOT NULL
                   AND c2.vat_normalized = cr.vat_normalized),
         (cr.vat_normalized IS NOT NULL AND _my_vat IS NOT NULL AND cr.vat_normalized <> _my_vat)
  FROM public.company_invitations inv
  JOIN public.companies s ON s.id = inv.seller_company_id
  LEFT JOIN public.customer_records cr ON cr.id = inv.customer_record_id
  WHERE inv.token_hash = encode(sha256(coalesce(_token, '')::bytea), 'hex');
END;
$$;
REVOKE ALL ON FUNCTION public.invitation_preview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invitation_preview(text) TO anon, authenticated;

-- 8. Nessuna appropriazione di un'azienda già registrata tramite la sola P.IVA
CREATE OR REPLACE FUNCTION public.company_exists_for_vat(_vat_number text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.vat_normalized IS NOT NULL
      AND c.vat_normalized = public.normalize_vat(_vat_number)
  );
$$;
REVOKE ALL ON FUNCTION public.company_exists_for_vat(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_exists_for_vat(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_company(
  _legal_name text, _can_buy boolean, _can_sell boolean,
  _vat_number text DEFAULT NULL, _tax_code text DEFAULT NULL, _email text DEFAULT NULL,
  _phone text DEFAULT NULL, _address_line text DEFAULT NULL, _postal_code text DEFAULT NULL,
  _city text DEFAULT NULL, _province text DEFAULT NULL,
  _delivery_address_line text DEFAULT NULL, _delivery_postal_code text DEFAULT NULL,
  _delivery_city text DEFAULT NULL, _delivery_province text DEFAULT NULL,
  _delivery_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _company_id uuid;
  _member_id uuid;
  _address_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Autenticazione richiesta'; END IF;
  IF NOT (_can_buy OR _can_sell) THEN RAISE EXCEPTION 'Indica come userai la piattaforma'; END IF;
  IF coalesce(btrim(_legal_name), '') = '' THEN RAISE EXCEPTION 'La ragione sociale è obbligatoria'; END IF;

  IF EXISTS (SELECT 1 FROM public.company_members m WHERE m.user_id = _uid AND m.status = 'attivo') THEN
    RAISE EXCEPTION 'Utente già collegato a un''azienda';
  END IF;

  IF public.normalize_vat(_vat_number) IS NOT NULL
     AND public.company_exists_for_vat(_vat_number) THEN
    RAISE EXCEPTION 'Esiste già un''azienda registrata con questa partita IVA: chiedi al suo amministratore di aggiungerti, oppure verifica il dato inserito';
  END IF;

  INSERT INTO public.companies (
    legal_name, vat_number, tax_code, email, phone,
    address_line, postal_code, city, province,
    delivery_address_line, delivery_postal_code, delivery_city, delivery_province, delivery_notes,
    can_buy, can_sell, created_by
  ) VALUES (
    btrim(_legal_name), NULLIF(_vat_number, ''), NULLIF(_tax_code, ''), NULLIF(_email, ''), NULLIF(_phone, ''),
    NULLIF(_address_line, ''), NULLIF(_postal_code, ''), NULLIF(_city, ''), NULLIF(_province, ''),
    NULLIF(_delivery_address_line, ''), NULLIF(_delivery_postal_code, ''), NULLIF(_delivery_city, ''),
    NULLIF(_delivery_province, ''), NULLIF(_delivery_notes, ''),
    _can_buy, _can_sell, _uid
  ) RETURNING id INTO _company_id;

  INSERT INTO public.company_members (company_id, user_id, status)
  VALUES (_company_id, _uid, 'attivo') RETURNING id INTO _member_id;

  INSERT INTO public.company_member_roles (member_id, company_id, role)
  VALUES (_member_id, _company_id, 'amministratore'::public.app_role);

  INSERT INTO public.company_settings (company_id, display_name)
  VALUES (_company_id, btrim(_legal_name));

  IF coalesce(NULLIF(_address_line, ''), NULLIF(_city, '')) IS NOT NULL THEN
    INSERT INTO public.addresses (company_id, label, address_line, postal_code, city, province, phone, created_by)
    VALUES (_company_id, 'Sede legale', NULLIF(_address_line, ''), NULLIF(_postal_code, ''),
            NULLIF(_city, ''), NULLIF(_province, ''), NULLIF(_phone, ''), _uid)
    RETURNING id INTO _address_id;
    INSERT INTO public.address_functions (address_id, function, is_default)
    VALUES (_address_id, 'sede_legale', true);
  END IF;

  IF coalesce(NULLIF(_delivery_address_line, ''), NULLIF(_delivery_city, '')) IS NOT NULL THEN
    INSERT INTO public.addresses (company_id, label, address_line, postal_code, city, province, notes, created_by)
    VALUES (_company_id, 'Consegna', NULLIF(_delivery_address_line, ''), NULLIF(_delivery_postal_code, ''),
            NULLIF(_delivery_city, ''), NULLIF(_delivery_province, ''), NULLIF(_delivery_notes, ''), _uid)
    RETURNING id INTO _address_id;
    INSERT INTO public.address_functions (address_id, function, is_default)
    VALUES (_address_id, 'consegna', true);
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, _uid, 'company.registered', 'company', _company_id,
          jsonb_build_object('can_buy', _can_buy, 'can_sell', _can_sell));

  RETURN _company_id;
END;
$$;

-- 9. Accettazione invito con creazione dell'azienda confermata dal cliente
CREATE OR REPLACE FUNCTION public.accept_invitation_with_new_company(
  _token text, _legal_name text, _can_buy boolean DEFAULT true, _can_sell boolean DEFAULT false,
  _vat_number text DEFAULT NULL, _tax_code text DEFAULT NULL, _email text DEFAULT NULL,
  _phone text DEFAULT NULL, _address_line text DEFAULT NULL, _postal_code text DEFAULT NULL,
  _city text DEFAULT NULL, _province text DEFAULT NULL,
  _delivery_address_line text DEFAULT NULL, _delivery_postal_code text DEFAULT NULL,
  _delivery_city text DEFAULT NULL, _delivery_province text DEFAULT NULL,
  _delivery_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _inv public.company_invitations;
  _record public.customer_records;
  _company_id uuid;
  _relation_id uuid;
  _new_vat text := public.normalize_vat(_vat_number);
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

  IF EXISTS (SELECT 1 FROM public.company_members m WHERE m.user_id = _uid AND m.status = 'attivo') THEN
    RAISE EXCEPTION 'Hai già un''azienda: accetta l''invito con l''azienda esistente';
  END IF;

  IF _inv.customer_record_id IS NOT NULL THEN
    SELECT * INTO _record FROM public.customer_records WHERE id = _inv.customer_record_id;
    IF _record.vat_normalized IS NOT NULL AND _new_vat IS NOT NULL AND _record.vat_normalized <> _new_vat THEN
      RAISE EXCEPTION 'La partita IVA inserita non corrisponde a quella indicata dal fornitore: il collegamento deve essere verificato dal fornitore';
    END IF;
  END IF;

  IF _new_vat IS NOT NULL AND public.company_exists_for_vat(_vat_number) THEN
    RAISE EXCEPTION 'Esiste già un''azienda registrata con questa partita IVA: chiedi al suo amministratore di aggiungerti';
  END IF;

  _company_id := public.register_company(
    _legal_name, _can_buy, _can_sell, _vat_number, _tax_code, _email, _phone,
    _address_line, _postal_code, _city, _province,
    _delivery_address_line, _delivery_postal_code, _delivery_city, _delivery_province, _delivery_notes
  );

  IF NOT public.company_sells(_inv.seller_company_id) THEN
    RAISE EXCEPTION 'L''azienda che ha inviato l''invito non vende sulla piattaforma';
  END IF;

  INSERT INTO public.supplier_customer_relations (
    seller_company_id, buyer_company_id, status, origin, requested_by,
    seller_enabled, buyer_enabled, accepted_at, decided_at, decided_by, customer_record_id
  ) VALUES (
    _inv.seller_company_id, _company_id, 'attivo', 'invito_fornitore', _inv.invited_by,
    true, true, now(), now(), _uid,
    CASE WHEN _inv.customer_record_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.supplier_customer_relations r
                           WHERE r.customer_record_id = _inv.customer_record_id)
         THEN _inv.customer_record_id ELSE NULL END
  ) RETURNING id INTO _relation_id;

  UPDATE public.company_invitations
  SET status = 'accettato', decided_at = now(), relation_id = _relation_id,
      token_hash = encode(sha256(gen_random_uuid()::text::bytea), 'hex')
  WHERE id = _inv.id;

  -- Differenze proposte al venditore: la sua anagrafica non viene mai sovrascritta
  IF _record.id IS NOT NULL THEN
    INSERT INTO public.customer_record_proposed_updates
      (customer_record_id, seller_company_id, field_name, current_value, proposed_value, proposed_by)
    SELECT _record.id, _record.seller_company_id, d.field_name, d.current_value, d.proposed_value, _uid
    FROM (VALUES
      ('legal_name', _record.legal_name, btrim(_legal_name)),
      ('vat_number', _record.vat_number, NULLIF(btrim(coalesce(_vat_number,'')), '')),
      ('tax_code', _record.tax_code, NULLIF(btrim(coalesce(_tax_code,'')), '')),
      ('email', _record.email, NULLIF(btrim(coalesce(_email,'')), '')),
      ('phone', _record.phone, NULLIF(btrim(coalesce(_phone,'')), '')),
      ('address_line', _record.address_line, NULLIF(btrim(coalesce(_address_line,'')), '')),
      ('postal_code', _record.postal_code, NULLIF(btrim(coalesce(_postal_code,'')), '')),
      ('city', _record.city, NULLIF(btrim(coalesce(_city,'')), '')),
      ('province', _record.province, NULLIF(btrim(coalesce(_province,'')), '')),
      ('delivery_address_line', _record.delivery_address_line, NULLIF(btrim(coalesce(_delivery_address_line,'')), '')),
      ('delivery_postal_code', _record.delivery_postal_code, NULLIF(btrim(coalesce(_delivery_postal_code,'')), '')),
      ('delivery_city', _record.delivery_city, NULLIF(btrim(coalesce(_delivery_city,'')), '')),
      ('delivery_province', _record.delivery_province, NULLIF(btrim(coalesce(_delivery_province,'')), ''))
    ) AS d(field_name, current_value, proposed_value)
    WHERE d.proposed_value IS NOT NULL
      AND coalesce(d.current_value, '') <> d.proposed_value;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_inv.seller_company_id, _uid, 'invitation.accepted_new_company', 'relation', _relation_id,
          jsonb_build_object('invitation_id', _inv.id, 'buyer_company_id', _company_id,
                             'customer_record_id', _inv.customer_record_id));

  RETURN _relation_id;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_invitation_with_new_company(text, text, boolean, boolean, text, text, text, text, text, text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invitation_with_new_company(text, text, boolean, boolean, text, text, text, text, text, text, text, text, text, text, text, text, text) TO authenticated;

-- 10. Decisione del venditore su un aggiornamento proposto (nessuna scrittura automatica)
CREATE OR REPLACE FUNCTION public.decide_proposed_update(_proposal_id uuid, _accept boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _p public.customer_record_proposed_updates;
BEGIN
  SELECT * INTO _p FROM public.customer_record_proposed_updates WHERE id = _proposal_id;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'Proposta non trovata'; END IF;
  IF _uid IS NULL OR NOT public.is_company_admin(_p.seller_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda venditrice';
  END IF;
  IF _p.status <> 'in_attesa' THEN RAISE EXCEPTION 'Proposta già gestita'; END IF;

  IF _accept THEN
    EXECUTE format('UPDATE public.customer_records SET %I = $1 WHERE id = $2', _p.field_name)
    USING _p.proposed_value, _p.customer_record_id;
  END IF;

  UPDATE public.customer_record_proposed_updates
  SET status = CASE WHEN _accept THEN 'accettato'::public.proposed_update_status
                    ELSE 'rifiutato'::public.proposed_update_status END,
      decided_at = now(), decided_by = _uid
  WHERE id = _proposal_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_p.seller_company_id, _uid,
          CASE WHEN _accept THEN 'customer_record.update_accepted' ELSE 'customer_record.update_rejected' END,
          'customer_record', _p.customer_record_id,
          jsonb_build_object('field', _p.field_name, 'proposed_value', _p.proposed_value));
END;
$$;
REVOKE ALL ON FUNCTION public.decide_proposed_update(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_proposed_update(uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.can_read_company_address(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owns_customer_record(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_write_customer_record(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_company_address(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_customer_record(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_customer_record(uuid) TO authenticated;
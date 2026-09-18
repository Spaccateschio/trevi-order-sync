-- 1. Colonne additive
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS default_price_list_number smallint;
ALTER TABLE public.company_invitations ADD COLUMN IF NOT EXISTS price_list_number smallint;

-- 2. Risoluzione del listino predefinito dell'azienda venditrice
CREATE OR REPLACE FUNCTION public.resolve_default_price_list(_company_id uuid)
RETURNS smallint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT s.default_price_list_number
       FROM public.company_settings s
      WHERE s.company_id = _company_id
        AND s.default_price_list_number IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.danea_price_lists l
                     WHERE l.company_id = _company_id
                       AND l.list_number = s.default_price_list_number
                       AND l.is_active)),
    (SELECT min(l.list_number) FROM public.danea_price_lists l
      WHERE l.company_id = _company_id AND l.is_active)
  );
$$;
REVOKE ALL ON FUNCTION public.resolve_default_price_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_default_price_list(uuid) TO authenticated;

-- 3. Impostazione del listino predefinito dell'azienda
CREATE OR REPLACE FUNCTION public.set_default_price_list(_company_id uuid, _list_number smallint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;
  IF _list_number IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.danea_price_lists l
     WHERE l.company_id = _company_id AND l.list_number = _list_number AND l.is_active
  ) THEN
    RAISE EXCEPTION 'Listino non valido o non attivo per questa azienda';
  END IF;

  INSERT INTO public.company_settings (company_id, display_name, default_price_list_number)
  VALUES (_company_id, (SELECT legal_name FROM public.companies WHERE id = _company_id), _list_number)
  ON CONFLICT (company_id) DO UPDATE SET default_price_list_number = _list_number, updated_at = now();

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, _uid, 'settings.default_price_list', 'company', _company_id,
          jsonb_build_object('list_number', _list_number));
END;
$$;
REVOKE ALL ON FUNCTION public.set_default_price_list(uuid, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_default_price_list(uuid, smallint) TO authenticated;

-- 4. Assegnazione del listino a una scheda cliente
CREATE OR REPLACE FUNCTION public.set_customer_price_list(_customer_record_id uuid, _list_number smallint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _seller uuid;
BEGIN
  SELECT seller_company_id INTO _seller FROM public.customer_records WHERE id = _customer_record_id;
  IF _seller IS NULL THEN RAISE EXCEPTION 'Cliente non trovato'; END IF;
  IF _uid IS NULL OR NOT public.is_company_admin(_seller) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda venditrice';
  END IF;
  IF _list_number IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.danea_price_lists l
     WHERE l.company_id = _seller AND l.list_number = _list_number AND l.is_active
  ) THEN
    RAISE EXCEPTION 'Listino non valido o non attivo per questa azienda';
  END IF;

  UPDATE public.customer_records
  SET assigned_price_list_number = _list_number, updated_at = now()
  WHERE id = _customer_record_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_seller, _uid, 'customer_record.price_list_assigned', 'customer_record', _customer_record_id,
          jsonb_build_object('list_number', _list_number));
END;
$$;
REVOKE ALL ON FUNCTION public.set_customer_price_list(uuid, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_customer_price_list(uuid, smallint) TO authenticated;

-- 5. Inviti con listino: DROP + CREATE per evitare overload ambigui
DROP FUNCTION IF EXISTS public.create_customer_invitation(uuid, text, integer);
CREATE FUNCTION public.create_customer_invitation(
  _customer_record_id uuid, _email text, _valid_days integer DEFAULT 14,
  _price_list_number smallint DEFAULT NULL
)
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
  _list smallint;
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

  _list := COALESCE(_price_list_number, public.resolve_default_price_list(_seller));
  IF _list IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.danea_price_lists l
     WHERE l.company_id = _seller AND l.list_number = _list AND l.is_active
  ) THEN
    _list := NULL;
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
    invite_code, expires_at, invited_by, price_list_number
  ) VALUES (
    _seller, _customer_record_id, btrim(_email), _email_norm,
    encode(sha256(_token::bytea), 'hex'), _code,
    now() + make_interval(days => greatest(1, least(60, coalesce(_valid_days, 14)))), _uid, _list
  ) RETURNING id INTO _id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_seller, _uid, 'invitation.created', 'invitation', _id,
          jsonb_build_object('customer_record_id', _customer_record_id, 'email', _email_norm,
                             'price_list_number', _list));

  RETURN QUERY SELECT _id, _token, _code;
END;
$$;
REVOKE ALL ON FUNCTION public.create_customer_invitation(uuid, text, integer, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_customer_invitation(uuid, text, integer, smallint) TO authenticated;

DROP FUNCTION IF EXISTS public.create_free_invitation(uuid, text, integer);
CREATE FUNCTION public.create_free_invitation(
  _seller_company_id uuid, _email text DEFAULT NULL, _valid_days integer DEFAULT 14,
  _price_list_number smallint DEFAULT NULL
)
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
  _list smallint;
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

  _list := COALESCE(_price_list_number, public.resolve_default_price_list(_seller_company_id));
  IF _list IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.danea_price_lists l
     WHERE l.company_id = _seller_company_id AND l.list_number = _list AND l.is_active
  ) THEN
    _list := NULL;
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
    invite_code, is_free_invite, expires_at, invited_by, price_list_number
  ) VALUES (
    _seller_company_id, NULL, nullif(btrim(coalesce(_email, '')), ''), _email_norm,
    encode(sha256(_token::bytea), 'hex'), _code, true,
    now() + make_interval(days => greatest(1, least(60, coalesce(_valid_days, 14)))), _uid, _list
  ) RETURNING id INTO _id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_seller_company_id, _uid, 'invitation.created_free', 'invitation', _id,
          jsonb_build_object('email', _email_norm, 'price_list_number', _list));

  RETURN QUERY SELECT _id, _token, _code;
END;
$$;
REVOKE ALL ON FUNCTION public.create_free_invitation(uuid, text, integer, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_free_invitation(uuid, text, integer, smallint) TO authenticated;

-- 6. Copia del listino dell'invito al cliente d'anagrafica.
-- Percorsi coperti: accept_invitation_row copre accept_customer_invitation (link)
-- e accept_invitation_code (codice); accept_invitation_with_new_company ha una copia propria
-- perché non passa da accept_invitation_row; link_customer_record_to_relation copre
-- l'aggancio successivo degli inviti liberi.
CREATE OR REPLACE FUNCTION public.apply_invitation_price_list(_invitation_id uuid, _relation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _list smallint;
  _record uuid;
  _seller uuid;
BEGIN
  SELECT price_list_number, seller_company_id INTO _list, _seller
  FROM public.company_invitations WHERE id = _invitation_id;
  IF _list IS NULL THEN RETURN; END IF;

  SELECT customer_record_id INTO _record
  FROM public.supplier_customer_relations WHERE id = _relation_id;
  IF _record IS NULL THEN RETURN; END IF;

  UPDATE public.customer_records
  SET assigned_price_list_number = _list, updated_at = now()
  WHERE id = _record
    AND seller_company_id = _seller
    AND assigned_price_list_number IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_invitation_price_list(uuid, uuid) FROM PUBLIC, anon, authenticated;

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

  -- Listino scelto in fase di invito (copre link e codice)
  PERFORM public.apply_invitation_price_list(_inv.id, _relation_id);

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

CREATE OR REPLACE FUNCTION public.accept_invitation_with_new_company(_token text, _legal_name text, _can_buy boolean DEFAULT true, _can_sell boolean DEFAULT false, _vat_number text DEFAULT NULL::text, _tax_code text DEFAULT NULL::text, _email text DEFAULT NULL::text, _phone text DEFAULT NULL::text, _address_line text DEFAULT NULL::text, _postal_code text DEFAULT NULL::text, _city text DEFAULT NULL::text, _province text DEFAULT NULL::text, _delivery_address_line text DEFAULT NULL::text, _delivery_postal_code text DEFAULT NULL::text, _delivery_city text DEFAULT NULL::text, _delivery_province text DEFAULT NULL::text, _delivery_notes text DEFAULT NULL::text)
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

  -- Listino scelto in fase di invito (percorso registrazione nuova azienda)
  PERFORM public.apply_invitation_price_list(_inv.id, _relation_id);

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

-- 7. Aggancio successivo di un cliente d'anagrafica: applica il listino dell'invito libero
CREATE OR REPLACE FUNCTION public.link_customer_record_to_relation(_relation_id uuid, _customer_record_id uuid)
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
  _inv_id uuid;
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

    -- Invito libero con listino: si applica ora che esiste un cliente d'anagrafica
    SELECT id INTO _inv_id FROM public.company_invitations
    WHERE relation_id = _relation_id AND price_list_number IS NOT NULL
    ORDER BY decided_at DESC NULLS LAST LIMIT 1;
    IF _inv_id IS NOT NULL THEN
      PERFORM public.apply_invitation_price_list(_inv_id, _relation_id);
    END IF;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_rel.seller_company_id, _uid,
          CASE WHEN _customer_record_id IS NULL THEN 'relation.record_unlinked' ELSE 'relation.record_linked' END,
          'relation', _relation_id,
          jsonb_build_object('customer_record_id', _customer_record_id));
END;
$$;

-- 8. U.M. preferite: irrigidimento della sola policy di inserimento lato acquirente
DROP POLICY IF EXISTS customer_product_unit_preferences_insert_buyer ON public.customer_product_unit_preferences;
CREATE POLICY customer_product_unit_preferences_insert_parties
ON public.customer_product_unit_preferences
FOR INSERT TO authenticated
WITH CHECK (
  (public.is_company_member(buyer_company_id)
    AND public.relation_is_operational(seller_company_id, buyer_company_id))
  OR public.is_company_admin(seller_company_id)
);
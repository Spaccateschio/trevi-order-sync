-- 1. Anagrafica fornitori
CREATE TABLE public.supplier_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_company_id uuid NOT NULL REFERENCES public.companies(id),
  archive_id uuid REFERENCES public.danea_archives(id),
  internal_reference text,
  legal_name text NOT NULL,
  vat_number text,
  vat_normalized text,
  tax_code text,
  email text,
  phone text,
  fax text,
  pec text,
  contact_name text,
  address_line text,
  postal_code text,
  city text,
  province text,
  region text,
  country text,
  sdi_code text,
  sdi_admin_reference text,
  payment_terms text,
  bank text,
  our_bank text,
  agent text,
  discounts text,
  credit_limit text,
  notes text,
  danea_extra jsonb,
  status public.entity_status NOT NULL DEFAULT 'attivo',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX supplier_records_company_idx ON public.supplier_records (buyer_company_id);
CREATE INDEX supplier_records_vat_idx ON public.supplier_records (buyer_company_id, vat_normalized);
CREATE UNIQUE INDEX supplier_records_danea_ref_idx
  ON public.supplier_records (buyer_company_id, archive_id, internal_reference)
  WHERE archive_id IS NOT NULL AND internal_reference IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_records TO authenticated;
GRANT ALL ON public.supplier_records TO service_role;

ALTER TABLE public.supplier_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_records_select ON public.supplier_records
  FOR SELECT TO authenticated USING (public.is_company_member(buyer_company_id));
CREATE POLICY supplier_records_insert ON public.supplier_records
  FOR INSERT TO authenticated WITH CHECK (public.is_company_admin(buyer_company_id));
CREATE POLICY supplier_records_update ON public.supplier_records
  FOR UPDATE TO authenticated USING (public.is_company_admin(buyer_company_id))
  WITH CHECK (public.is_company_admin(buyer_company_id));

CREATE TRIGGER supplier_records_updated_at BEFORE UPDATE ON public.supplier_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER supplier_records_vat BEFORE INSERT OR UPDATE ON public.supplier_records
  FOR EACH ROW EXECUTE FUNCTION public.set_vat_normalized();

CREATE OR REPLACE FUNCTION public.assert_supplier_archive_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _company uuid;
BEGIN
  IF NEW.archive_id IS NULL THEN RETURN NEW; END IF;
  SELECT company_id INTO _company FROM public.danea_archives WHERE id = NEW.archive_id;
  IF _company IS NULL OR _company <> NEW.buyer_company_id THEN
    RAISE EXCEPTION 'L''archivio Danea non appartiene a questa azienda';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER supplier_records_archive BEFORE INSERT OR UPDATE ON public.supplier_records
  FOR EACH ROW EXECUTE FUNCTION public.assert_supplier_archive_company();

CREATE OR REPLACE FUNCTION public.owns_supplier_record(_supplier_record_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.supplier_records sr
    WHERE sr.id = _supplier_record_id AND public.is_company_member(sr.buyer_company_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_supplier_record(_supplier_record_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.supplier_records sr
    WHERE sr.id = _supplier_record_id AND public.is_company_admin(sr.buyer_company_id)
  );
$$;

-- 2. Indirizzi e funzioni: proprietario fornitore
ALTER TABLE public.addresses ADD COLUMN supplier_record_id uuid REFERENCES public.supplier_records(id);
ALTER TABLE public.address_functions ADD COLUMN supplier_record_id uuid REFERENCES public.supplier_records(id);

ALTER TABLE public.addresses DROP CONSTRAINT IF EXISTS addresses_single_owner;
ALTER TABLE public.addresses ADD CONSTRAINT addresses_single_owner CHECK (
  (CASE WHEN company_id IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN customer_record_id IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN supplier_record_id IS NOT NULL THEN 1 ELSE 0 END) = 1
);

DROP POLICY "Indirizzi visibili a proprietari e partner autorizzati" ON public.addresses;
CREATE POLICY "Indirizzi visibili a proprietari e partner autorizzati" ON public.addresses
  FOR SELECT TO authenticated USING (
    public.can_read_company_address(company_id, visible_to_partners)
    OR public.owns_customer_record(customer_record_id)
    OR public.owns_supplier_record(supplier_record_id)
  );

DROP POLICY "Solo amministratori creano indirizzi propri" ON public.addresses;
CREATE POLICY "Solo amministratori creano indirizzi propri" ON public.addresses
  FOR INSERT TO authenticated WITH CHECK (
    ((company_id IS NOT NULL) AND public.is_company_admin(company_id))
    OR public.can_write_customer_record(customer_record_id)
    OR public.can_write_supplier_record(supplier_record_id)
  );

DROP POLICY "Solo amministratori modificano indirizzi propri" ON public.addresses;
CREATE POLICY "Solo amministratori modificano indirizzi propri" ON public.addresses
  FOR UPDATE TO authenticated USING (
    ((company_id IS NOT NULL) AND public.is_company_admin(company_id))
    OR public.can_write_customer_record(customer_record_id)
    OR public.can_write_supplier_record(supplier_record_id)
  ) WITH CHECK (
    ((company_id IS NOT NULL) AND public.is_company_admin(company_id))
    OR public.can_write_customer_record(customer_record_id)
    OR public.can_write_supplier_record(supplier_record_id)
  );

DROP POLICY "Solo amministratori rimuovono indirizzi propri" ON public.addresses;
CREATE POLICY "Solo amministratori rimuovono indirizzi propri" ON public.addresses
  FOR DELETE TO authenticated USING (
    ((company_id IS NOT NULL) AND public.is_company_admin(company_id))
    OR public.can_write_customer_record(customer_record_id)
    OR public.can_write_supplier_record(supplier_record_id)
  );

CREATE OR REPLACE FUNCTION public.address_function_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _a public.addresses;
BEGIN
  SELECT * INTO _a FROM public.addresses WHERE id = NEW.address_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'Indirizzo non trovato'; END IF;
  NEW.company_id := _a.company_id;
  NEW.customer_record_id := _a.customer_record_id;
  NEW.supplier_record_id := _a.supplier_record_id;
  RETURN NEW;
END;
$$;

DROP POLICY "Funzioni indirizzo leggibili con l'indirizzo" ON public.address_functions;
CREATE POLICY "Funzioni indirizzo leggibili con l'indirizzo" ON public.address_functions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.addresses a
      WHERE a.id = address_functions.address_id
        AND (public.can_read_company_address(a.company_id, a.visible_to_partners)
             OR public.owns_customer_record(a.customer_record_id)
             OR public.owns_supplier_record(a.supplier_record_id))
    )
  );

DROP POLICY "Funzioni indirizzo gestite dagli amministratori" ON public.address_functions;
CREATE POLICY "Funzioni indirizzo gestite dagli amministratori" ON public.address_functions
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.addresses a
      WHERE a.id = address_functions.address_id
        AND (((a.company_id IS NOT NULL) AND public.is_company_admin(a.company_id))
             OR public.can_write_customer_record(a.customer_record_id)
             OR public.can_write_supplier_record(a.supplier_record_id))
    )
  );

DROP POLICY "Funzioni indirizzo aggiornate dagli amministratori" ON public.address_functions;
CREATE POLICY "Funzioni indirizzo aggiornate dagli amministratori" ON public.address_functions
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.addresses a
      WHERE a.id = address_functions.address_id
        AND (((a.company_id IS NOT NULL) AND public.is_company_admin(a.company_id))
             OR public.can_write_customer_record(a.customer_record_id)
             OR public.can_write_supplier_record(a.supplier_record_id))
    )
  ) WITH CHECK (true);

DROP POLICY "Funzioni indirizzo rimosse dagli amministratori" ON public.address_functions;
CREATE POLICY "Funzioni indirizzo rimosse dagli amministratori" ON public.address_functions
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.addresses a
      WHERE a.id = address_functions.address_id
        AND (((a.company_id IS NOT NULL) AND public.is_company_admin(a.company_id))
             OR public.can_write_customer_record(a.customer_record_id)
             OR public.can_write_supplier_record(a.supplier_record_id))
    )
  );

-- 3. Punti operativi condivisi (tabella customer_destinations generalizzata)
ALTER TABLE public.customer_destinations
  ADD COLUMN supplier_record_id uuid REFERENCES public.supplier_records(id),
  ADD COLUMN buyer_company_id uuid REFERENCES public.companies(id),
  ADD COLUMN "function" public.address_function NOT NULL DEFAULT 'consegna',
  ALTER COLUMN customer_record_id DROP NOT NULL,
  ALTER COLUMN seller_company_id DROP NOT NULL;

ALTER TABLE public.customer_destinations ADD CONSTRAINT destinations_single_owner CHECK (
  (CASE WHEN customer_record_id IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN supplier_record_id IS NOT NULL THEN 1 ELSE 0 END) = 1
);

CREATE OR REPLACE FUNCTION public.validate_customer_destination()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid;
BEGIN
  IF NEW.customer_record_id IS NOT NULL THEN
    SELECT seller_company_id INTO _owner FROM public.customer_records WHERE id = NEW.customer_record_id;
    IF _owner IS NULL THEN RAISE EXCEPTION 'Cliente inesistente'; END IF;
    NEW.seller_company_id := _owner;
    NEW.buyer_company_id := NULL;
    IF NEW.address_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.addresses a
      WHERE a.id = NEW.address_id AND a.customer_record_id = NEW.customer_record_id
    ) THEN
      RAISE EXCEPTION 'L''indirizzo non appartiene a questo cliente';
    END IF;
  ELSIF NEW.supplier_record_id IS NOT NULL THEN
    SELECT buyer_company_id INTO _owner FROM public.supplier_records WHERE id = NEW.supplier_record_id;
    IF _owner IS NULL THEN RAISE EXCEPTION 'Fornitore inesistente'; END IF;
    NEW.buyer_company_id := _owner;
    NEW.seller_company_id := NULL;
    IF NEW.address_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.addresses a
      WHERE a.id = NEW.address_id AND a.supplier_record_id = NEW.supplier_record_id
    ) THEN
      RAISE EXCEPTION 'L''indirizzo non appartiene a questo fornitore';
    END IF;
  ELSE
    RAISE EXCEPTION 'Indica il cliente o il fornitore del punto operativo';
  END IF;

  IF NEW.label IS NULL OR btrim(NEW.label) = '' THEN
    RAISE EXCEPTION 'Il nome del punto operativo è obbligatorio';
  END IF;
  NEW.label := btrim(NEW.label);
  RETURN NEW;
END;
$$;

DROP POLICY "Seller members read destinations" ON public.customer_destinations;
CREATE POLICY "Seller members read destinations" ON public.customer_destinations
  FOR SELECT TO authenticated USING (
    public.owns_customer_record(customer_record_id) OR public.owns_supplier_record(supplier_record_id)
  );

DROP POLICY "Seller admins insert destinations" ON public.customer_destinations;
CREATE POLICY "Seller admins insert destinations" ON public.customer_destinations
  FOR INSERT TO authenticated WITH CHECK (
    public.can_write_customer_record(customer_record_id) OR public.can_write_supplier_record(supplier_record_id)
  );

DROP POLICY "Seller admins update destinations" ON public.customer_destinations;
CREATE POLICY "Seller admins update destinations" ON public.customer_destinations
  FOR UPDATE TO authenticated USING (
    public.can_write_customer_record(customer_record_id) OR public.can_write_supplier_record(supplier_record_id)
  ) WITH CHECK (
    public.can_write_customer_record(customer_record_id) OR public.can_write_supplier_record(supplier_record_id)
  );

-- 4. Relazione B2B: lato fornitore e stati di match distinti
ALTER TABLE public.supplier_customer_relations
  ADD COLUMN supplier_record_id uuid REFERENCES public.supplier_records(id),
  ADD COLUMN customer_record_match_required boolean NOT NULL DEFAULT false,
  ADD COLUMN supplier_record_match_required boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX relations_supplier_record_unique
  ON public.supplier_customer_relations (supplier_record_id)
  WHERE supplier_record_id IS NOT NULL;

-- 5. Risoluzione automatica delle anagrafiche quando la relazione è operativa
CREATE OR REPLACE FUNCTION public.resolve_relation_records(_relation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _rel public.supplier_customer_relations;
  _seller public.companies;
  _buyer public.companies;
  _match uuid;
  _count int;
  _new uuid;
BEGIN
  SELECT * INTO _rel FROM public.supplier_customer_relations WHERE id = _relation_id;
  IF _rel.id IS NULL OR _rel.status <> 'attivo' THEN RETURN; END IF;

  SELECT * INTO _seller FROM public.companies WHERE id = _rel.seller_company_id;
  SELECT * INTO _buyer FROM public.companies WHERE id = _rel.buyer_company_id;

  -- Lato venditore: anagrafica cliente dell'azienda acquirente
  IF _rel.customer_record_id IS NULL THEN
    SELECT count(*), min(cr.id) INTO _count, _match
    FROM public.customer_records cr
    WHERE cr.seller_company_id = _rel.seller_company_id
      AND cr.status <> 'revocato'
      AND NOT EXISTS (SELECT 1 FROM public.supplier_customer_relations r WHERE r.customer_record_id = cr.id)
      AND (
        (_buyer.vat_normalized IS NOT NULL AND cr.vat_normalized = _buyer.vat_normalized)
        OR (_buyer.vat_normalized IS NULL AND _buyer.tax_code IS NOT NULL AND cr.tax_code = _buyer.tax_code)
      );

    IF _count = 1 THEN
      UPDATE public.supplier_customer_relations
      SET customer_record_id = _match, customer_record_match_required = false
      WHERE id = _relation_id;
    ELSIF _count > 1 THEN
      UPDATE public.supplier_customer_relations
      SET customer_record_match_required = true WHERE id = _relation_id;
    ELSE
      INSERT INTO public.customer_records (
        seller_company_id, legal_name, vat_number, tax_code, email, phone,
        address_line, postal_code, city, province, country, created_by
      ) VALUES (
        _rel.seller_company_id, _buyer.legal_name, _buyer.vat_number, _buyer.tax_code,
        _buyer.email, _buyer.phone, _buyer.address_line, _buyer.postal_code,
        _buyer.city, _buyer.province, _buyer.country, auth.uid()
      ) RETURNING id INTO _new;
      UPDATE public.supplier_customer_relations
      SET customer_record_id = _new, customer_record_match_required = false
      WHERE id = _relation_id;
      INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
      VALUES (_rel.seller_company_id, auth.uid(), 'customer_record.auto_created', 'customer_record', _new,
              jsonb_build_object('relation_id', _relation_id));
    END IF;
  END IF;

  -- Lato acquirente: anagrafica fornitore dell'azienda venditrice
  IF _rel.supplier_record_id IS NULL THEN
    SELECT count(*), min(sr.id) INTO _count, _match
    FROM public.supplier_records sr
    WHERE sr.buyer_company_id = _rel.buyer_company_id
      AND sr.status <> 'revocato'
      AND NOT EXISTS (SELECT 1 FROM public.supplier_customer_relations r WHERE r.supplier_record_id = sr.id)
      AND (
        (_seller.vat_normalized IS NOT NULL AND sr.vat_normalized = _seller.vat_normalized)
        OR (_seller.vat_normalized IS NULL AND _seller.tax_code IS NOT NULL AND sr.tax_code = _seller.tax_code)
      );

    IF _count = 1 THEN
      UPDATE public.supplier_customer_relations
      SET supplier_record_id = _match, supplier_record_match_required = false
      WHERE id = _relation_id;
    ELSIF _count > 1 THEN
      UPDATE public.supplier_customer_relations
      SET supplier_record_match_required = true WHERE id = _relation_id;
    ELSE
      INSERT INTO public.supplier_records (
        buyer_company_id, legal_name, vat_number, tax_code, email, phone,
        address_line, postal_code, city, province, country, created_by
      ) VALUES (
        _rel.buyer_company_id, _seller.legal_name, _seller.vat_number, _seller.tax_code,
        _seller.email, _seller.phone, _seller.address_line, _seller.postal_code,
        _seller.city, _seller.province, _seller.country, auth.uid()
      ) RETURNING id INTO _new;
      UPDATE public.supplier_customer_relations
      SET supplier_record_id = _new, supplier_record_match_required = false
      WHERE id = _relation_id;
      INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
      VALUES (_rel.buyer_company_id, auth.uid(), 'supplier_record.auto_created', 'supplier_record', _new,
              jsonb_build_object('relation_id', _relation_id));
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_relation_records(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.relation_records_after_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'attivo' AND (NEW.customer_record_id IS NULL OR NEW.supplier_record_id IS NULL) THEN
    PERFORM public.resolve_relation_records(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER relations_resolve_records
AFTER INSERT OR UPDATE OF status ON public.supplier_customer_relations
FOR EACH ROW EXECUTE FUNCTION public.relation_records_after_change();

-- 6. RPC anagrafica fornitori
CREATE OR REPLACE FUNCTION public.manage_supplier_record(
  _buyer_company_id uuid,
  _action text,
  _supplier_record_id uuid DEFAULT NULL,
  _legal_name text DEFAULT NULL,
  _vat_number text DEFAULT NULL,
  _tax_code text DEFAULT NULL,
  _email text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _fax text DEFAULT NULL,
  _pec text DEFAULT NULL,
  _contact_name text DEFAULT NULL,
  _address_line text DEFAULT NULL,
  _postal_code text DEFAULT NULL,
  _city text DEFAULT NULL,
  _province text DEFAULT NULL,
  _region text DEFAULT NULL,
  _country text DEFAULT NULL,
  _sdi_code text DEFAULT NULL,
  _sdi_admin_reference text DEFAULT NULL,
  _payment_terms text DEFAULT NULL,
  _bank text DEFAULT NULL,
  _our_bank text DEFAULT NULL,
  _agent text DEFAULT NULL,
  _discounts text DEFAULT NULL,
  _credit_limit text DEFAULT NULL,
  _internal_reference text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _danea_extra jsonb DEFAULT NULL,
  _archive_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non autorizzato'; END IF;
  IF NOT public.is_company_admin(_buyer_company_id) THEN
    RAISE EXCEPTION 'Solo un amministratore può gestire l''anagrafica fornitori';
  END IF;
  IF NOT public.company_buys(_buyer_company_id) THEN
    RAISE EXCEPTION 'Il profilo di acquisto non è attivo per la tua azienda';
  END IF;

  IF _action = 'create' THEN
    IF _legal_name IS NULL OR btrim(_legal_name) = '' THEN
      RAISE EXCEPTION 'La ragione sociale è obbligatoria';
    END IF;
    INSERT INTO public.supplier_records (
      buyer_company_id, archive_id, internal_reference, legal_name, vat_number, tax_code,
      email, phone, fax, pec, contact_name, address_line, postal_code, city, province,
      region, country, sdi_code, sdi_admin_reference, payment_terms, bank, our_bank,
      agent, discounts, credit_limit, notes, danea_extra, created_by
    ) VALUES (
      _buyer_company_id, _archive_id, nullif(btrim(coalesce(_internal_reference,'')),''),
      btrim(_legal_name), nullif(btrim(coalesce(_vat_number,'')),''), nullif(btrim(coalesce(_tax_code,'')),''),
      nullif(btrim(coalesce(_email,'')),''), nullif(btrim(coalesce(_phone,'')),''),
      nullif(btrim(coalesce(_fax,'')),''), nullif(btrim(coalesce(_pec,'')),''),
      nullif(btrim(coalesce(_contact_name,'')),''), nullif(btrim(coalesce(_address_line,'')),''),
      nullif(btrim(coalesce(_postal_code,'')),''), nullif(btrim(coalesce(_city,'')),''),
      nullif(btrim(coalesce(_province,'')),''), nullif(btrim(coalesce(_region,'')),''),
      nullif(btrim(coalesce(_country,'')),''), nullif(btrim(coalesce(_sdi_code,'')),''),
      nullif(btrim(coalesce(_sdi_admin_reference,'')),''), nullif(btrim(coalesce(_payment_terms,'')),''),
      nullif(btrim(coalesce(_bank,'')),''), nullif(btrim(coalesce(_our_bank,'')),''),
      nullif(btrim(coalesce(_agent,'')),''), nullif(btrim(coalesce(_discounts,'')),''),
      nullif(btrim(coalesce(_credit_limit,'')),''), nullif(btrim(coalesce(_notes,'')),''),
      _danea_extra, auth.uid()
    ) RETURNING id INTO _id;

  ELSIF _action = 'update' THEN
    UPDATE public.supplier_records SET
      archive_id = coalesce(_archive_id, archive_id),
      internal_reference = coalesce(nullif(btrim(coalesce(_internal_reference,'')),''), internal_reference),
      legal_name = coalesce(nullif(btrim(coalesce(_legal_name,'')),''), legal_name),
      vat_number = coalesce(nullif(btrim(coalesce(_vat_number,'')),''), vat_number),
      tax_code = coalesce(nullif(btrim(coalesce(_tax_code,'')),''), tax_code),
      email = coalesce(nullif(btrim(coalesce(_email,'')),''), email),
      phone = coalesce(nullif(btrim(coalesce(_phone,'')),''), phone),
      fax = coalesce(nullif(btrim(coalesce(_fax,'')),''), fax),
      pec = coalesce(nullif(btrim(coalesce(_pec,'')),''), pec),
      contact_name = coalesce(nullif(btrim(coalesce(_contact_name,'')),''), contact_name),
      address_line = coalesce(nullif(btrim(coalesce(_address_line,'')),''), address_line),
      postal_code = coalesce(nullif(btrim(coalesce(_postal_code,'')),''), postal_code),
      city = coalesce(nullif(btrim(coalesce(_city,'')),''), city),
      province = coalesce(nullif(btrim(coalesce(_province,'')),''), province),
      region = coalesce(nullif(btrim(coalesce(_region,'')),''), region),
      country = coalesce(nullif(btrim(coalesce(_country,'')),''), country),
      sdi_code = coalesce(nullif(btrim(coalesce(_sdi_code,'')),''), sdi_code),
      sdi_admin_reference = coalesce(nullif(btrim(coalesce(_sdi_admin_reference,'')),''), sdi_admin_reference),
      payment_terms = coalesce(nullif(btrim(coalesce(_payment_terms,'')),''), payment_terms),
      bank = coalesce(nullif(btrim(coalesce(_bank,'')),''), bank),
      our_bank = coalesce(nullif(btrim(coalesce(_our_bank,'')),''), our_bank),
      agent = coalesce(nullif(btrim(coalesce(_agent,'')),''), agent),
      discounts = coalesce(nullif(btrim(coalesce(_discounts,'')),''), discounts),
      credit_limit = coalesce(nullif(btrim(coalesce(_credit_limit,'')),''), credit_limit),
      notes = coalesce(nullif(btrim(coalesce(_notes,'')),''), notes),
      danea_extra = coalesce(_danea_extra, danea_extra)
    WHERE id = _supplier_record_id AND buyer_company_id = _buyer_company_id
    RETURNING id INTO _id;
    IF _id IS NULL THEN RAISE EXCEPTION 'Fornitore non trovato'; END IF;

  ELSIF _action IN ('activate', 'deactivate') THEN
    UPDATE public.supplier_records
    SET status = CASE WHEN _action = 'activate' THEN 'attivo'::public.entity_status ELSE 'disattivato'::public.entity_status END
    WHERE id = _supplier_record_id AND buyer_company_id = _buyer_company_id
    RETURNING id INTO _id;
    IF _id IS NULL THEN RAISE EXCEPTION 'Fornitore non trovato'; END IF;

  ELSE
    RAISE EXCEPTION 'Azione non supportata';
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_buyer_company_id, auth.uid(), 'supplier_record.' || _action, 'supplier_record', _id, '{}'::jsonb);

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_supplier_record(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.manage_supplier_record_status(
  _buyer_company_id uuid, _supplier_record_id uuid, _action text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non autorizzato'; END IF;
  IF NOT public.is_company_admin(_buyer_company_id) THEN
    RAISE EXCEPTION 'Solo un amministratore può modificare l''anagrafica';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.supplier_records
    WHERE id = _supplier_record_id AND buyer_company_id = _buyer_company_id
  ) THEN
    RAISE EXCEPTION 'Fornitore non trovato';
  END IF;

  IF _action = 'delete' THEN
    UPDATE public.supplier_records SET status = 'revocato' WHERE id = _supplier_record_id;
  ELSIF _action = 'restore' THEN
    UPDATE public.supplier_records SET status = 'attivo' WHERE id = _supplier_record_id;
  ELSE
    RAISE EXCEPTION 'Operazione anagrafica non valida';
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_buyer_company_id, auth.uid(), 'supplier_record.' || _action, 'supplier_record', _supplier_record_id, '{}'::jsonb);

  RETURN _supplier_record_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_supplier_record_status(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.manage_supplier_destination(
  _supplier_record_id uuid,
  _action text,
  _destination_id uuid DEFAULT NULL,
  _label text DEFAULT NULL,
  _address_id uuid DEFAULT NULL,
  _function public.address_function DEFAULT 'ritiro',
  _internal_code text DEFAULT NULL,
  _danea_reference text DEFAULT NULL,
  _contact_name text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _is_default boolean DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _buyer uuid;
  _id uuid;
BEGIN
  SELECT buyer_company_id INTO _buyer FROM public.supplier_records WHERE id = _supplier_record_id;
  IF _buyer IS NULL THEN RAISE EXCEPTION 'Fornitore inesistente'; END IF;
  IF NOT public.is_company_admin(_buyer) THEN
    RAISE EXCEPTION 'Solo un amministratore può gestire i punti operativi';
  END IF;

  IF _action = 'create' THEN
    INSERT INTO public.customer_destinations (
      supplier_record_id, address_id, label, "function", internal_code,
      danea_reference, contact_name, phone, notes, created_by
    ) VALUES (
      _supplier_record_id, _address_id, _label, coalesce(_function, 'ritiro'),
      nullif(btrim(coalesce(_internal_code,'')),''), nullif(btrim(coalesce(_danea_reference,'')),''),
      nullif(btrim(coalesce(_contact_name,'')),''), nullif(btrim(coalesce(_phone,'')),''),
      nullif(btrim(coalesce(_notes,'')),''), auth.uid()
    ) RETURNING id INTO _id;

    IF coalesce(_is_default, false) OR NOT EXISTS (
      SELECT 1 FROM public.customer_destinations
      WHERE supplier_record_id = _supplier_record_id AND is_default AND id <> _id
    ) THEN
      UPDATE public.customer_destinations SET is_default = false
      WHERE supplier_record_id = _supplier_record_id AND id <> _id AND is_default;
      UPDATE public.customer_destinations SET is_default = true WHERE id = _id;
    END IF;

  ELSIF _action = 'update' THEN
    UPDATE public.customer_destinations SET
      label = coalesce(_label, label),
      address_id = _address_id,
      "function" = coalesce(_function, "function"),
      internal_code = nullif(btrim(coalesce(_internal_code,'')),''),
      danea_reference = nullif(btrim(coalesce(_danea_reference,'')),''),
      contact_name = nullif(btrim(coalesce(_contact_name,'')),''),
      phone = nullif(btrim(coalesce(_phone,'')),''),
      notes = nullif(btrim(coalesce(_notes,'')),'')
    WHERE id = _destination_id AND supplier_record_id = _supplier_record_id
    RETURNING id INTO _id;
    IF _id IS NULL THEN RAISE EXCEPTION 'Punto operativo inesistente'; END IF;

  ELSIF _action IN ('activate', 'deactivate') THEN
    UPDATE public.customer_destinations
    SET status = CASE WHEN _action = 'activate' THEN 'attivo'::public.entity_status ELSE 'disattivato'::public.entity_status END,
        is_default = CASE WHEN _action = 'deactivate' THEN false ELSE is_default END
    WHERE id = _destination_id AND supplier_record_id = _supplier_record_id
    RETURNING id INTO _id;
    IF _id IS NULL THEN RAISE EXCEPTION 'Punto operativo inesistente'; END IF;

  ELSIF _action = 'set_default' THEN
    UPDATE public.customer_destinations SET is_default = false
    WHERE supplier_record_id = _supplier_record_id AND is_default;
    UPDATE public.customer_destinations SET is_default = true, status = 'attivo'
    WHERE id = _destination_id AND supplier_record_id = _supplier_record_id
    RETURNING id INTO _id;
    IF _id IS NULL THEN RAISE EXCEPTION 'Punto operativo inesistente'; END IF;

  ELSE
    RAISE EXCEPTION 'Azione non supportata';
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_buyer, auth.uid(), 'supplier_destination.' || _action, 'supplier_destination', _id,
          jsonb_build_object('supplier_record_id', _supplier_record_id));

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_supplier_destination(uuid, text, uuid, text, uuid, public.address_function, text, text, text, text, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.link_supplier_record_to_relation(
  _relation_id uuid, _supplier_record_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _buyer uuid;
BEGIN
  SELECT buyer_company_id INTO _buyer FROM public.supplier_customer_relations WHERE id = _relation_id;
  IF _buyer IS NULL THEN RAISE EXCEPTION 'Collegamento inesistente'; END IF;
  IF NOT public.is_company_admin(_buyer) THEN
    RAISE EXCEPTION 'Solo un amministratore può associare l''anagrafica';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.supplier_records
    WHERE id = _supplier_record_id AND buyer_company_id = _buyer
  ) THEN
    RAISE EXCEPTION 'Fornitore non trovato';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.supplier_customer_relations
    WHERE supplier_record_id = _supplier_record_id AND id <> _relation_id
  ) THEN
    RAISE EXCEPTION 'Questa anagrafica fornitore è già collegata a un altro rapporto';
  END IF;

  UPDATE public.supplier_customer_relations
  SET supplier_record_id = _supplier_record_id, supplier_record_match_required = false
  WHERE id = _relation_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_buyer, auth.uid(), 'relation.link_supplier_record', 'supplier_customer_relation', _relation_id,
          jsonb_build_object('supplier_record_id', _supplier_record_id));

  RETURN _relation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_supplier_record_to_relation(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.supplier_record_match_suggestions(_relation_id uuid)
RETURNS TABLE (id uuid, legal_name text, vat_number text, city text, internal_reference text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _rel public.supplier_customer_relations;
  _seller public.companies;
BEGIN
  SELECT * INTO _rel FROM public.supplier_customer_relations WHERE id = _relation_id;
  IF _rel.id IS NULL OR NOT public.is_company_member(_rel.buyer_company_id) THEN RETURN; END IF;
  SELECT * INTO _seller FROM public.companies WHERE id = _rel.seller_company_id;

  RETURN QUERY
  SELECT sr.id, sr.legal_name, sr.vat_number, sr.city, sr.internal_reference
  FROM public.supplier_records sr
  WHERE sr.buyer_company_id = _rel.buyer_company_id
    AND sr.status <> 'revocato'
    AND NOT EXISTS (SELECT 1 FROM public.supplier_customer_relations r WHERE r.supplier_record_id = sr.id)
    AND (
      (_seller.vat_normalized IS NOT NULL AND sr.vat_normalized = _seller.vat_normalized)
      OR (_seller.tax_code IS NOT NULL AND sr.tax_code = _seller.tax_code)
      OR public.normalize_vat(sr.legal_name) = public.normalize_vat(_seller.legal_name)
    )
  ORDER BY sr.legal_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.supplier_record_match_suggestions(uuid) TO authenticated;
-- 1) Listini univoci per archivio
DELETE FROM public.danea_price_lists l
USING public.danea_price_lists keep
WHERE l.company_id = keep.company_id
  AND l.archive_id = keep.archive_id
  AND l.list_number = keep.list_number
  AND l.id > keep.id;

CREATE UNIQUE INDEX IF NOT EXISTS danea_price_lists_company_archive_list_key
  ON public.danea_price_lists (company_id, archive_id, list_number);

-- 2) Archivio di provenienza sui clienti
ALTER TABLE public.customer_records
  ADD COLUMN IF NOT EXISTS archive_id uuid REFERENCES public.danea_archives(id);

CREATE INDEX IF NOT EXISTS customer_records_company_archive_idx
  ON public.customer_records (seller_company_id, archive_id);

CREATE OR REPLACE FUNCTION public.assert_customer_archive_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company uuid;
BEGIN
  IF NEW.archive_id IS NULL THEN RETURN NEW; END IF;
  SELECT company_id INTO _company FROM public.danea_archives WHERE id = NEW.archive_id;
  IF _company IS NULL OR _company <> NEW.seller_company_id THEN
    RAISE EXCEPTION 'L''archivio Danea non appartiene a questa azienda';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_records_archive_scope ON public.customer_records;
CREATE TRIGGER customer_records_archive_scope
BEFORE INSERT OR UPDATE OF archive_id, seller_company_id ON public.customer_records
FOR EACH ROW EXECUTE FUNCTION public.assert_customer_archive_company();

-- 3) manage_customer_record con archivio
DROP FUNCTION IF EXISTS public.manage_customer_record(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, smallint);

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
  _notes text DEFAULT NULL,
  _region text DEFAULT NULL,
  _country text DEFAULT NULL,
  _sdi_code text DEFAULT NULL,
  _sdi_admin_reference text DEFAULT NULL,
  _contact_name text DEFAULT NULL,
  _fax text DEFAULT NULL,
  _pec text DEFAULT NULL,
  _discounts text DEFAULT NULL,
  _credit_limit text DEFAULT NULL,
  _agent text DEFAULT NULL,
  _payment_terms text DEFAULT NULL,
  _bank text DEFAULT NULL,
  _our_bank text DEFAULT NULL,
  _danea_extra jsonb DEFAULT NULL,
  _price_list_number smallint DEFAULT NULL,
  _archive_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
  _list smallint;
  _archive uuid;
BEGIN
  IF _uid IS NULL OR NOT public.is_company_admin(_seller_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;
  IF NOT public.company_sells(_seller_company_id) THEN
    RAISE EXCEPTION 'L''azienda non ha la capacità di vendita attiva';
  END IF;

  IF _archive_id IS NOT NULL THEN
    SELECT id INTO _archive FROM public.danea_archives
    WHERE id = _archive_id AND company_id = _seller_company_id;
    IF _archive IS NULL THEN
      RAISE EXCEPTION 'Archivio Danea non valido per questa azienda';
    END IF;
  END IF;

  IF _price_list_number IS NOT NULL THEN
    SELECT l.list_number INTO _list
    FROM public.danea_price_lists l
    WHERE l.company_id = _seller_company_id
      AND l.list_number = _price_list_number
      AND (
        _archive IS NOT NULL AND l.archive_id = _archive
        OR _archive IS NULL AND (
          _customer_record_id IS NULL
          OR l.archive_id IS NOT DISTINCT FROM (
            SELECT cr.archive_id FROM public.customer_records cr WHERE cr.id = _customer_record_id
          )
          OR (SELECT cr.archive_id FROM public.customer_records cr WHERE cr.id = _customer_record_id) IS NULL
        )
      )
    LIMIT 1;
  END IF;

  IF _action = 'create' THEN
    IF coalesce(btrim(_legal_name), '') = '' THEN
      RAISE EXCEPTION 'La ragione sociale è obbligatoria';
    END IF;
    INSERT INTO public.customer_records (
      seller_company_id, legal_name, vat_number, tax_code, email, phone,
      address_line, postal_code, city, province,
      delivery_address_line, delivery_postal_code, delivery_city, delivery_province, delivery_notes,
      internal_reference, notes, created_by,
      region, country, sdi_code, sdi_admin_reference, contact_name, fax, pec,
      discounts, credit_limit, agent, payment_terms, bank, our_bank, danea_extra,
      assigned_price_list_number, archive_id
    ) VALUES (
      _seller_company_id, btrim(_legal_name), NULLIF(btrim(_vat_number), ''), NULLIF(btrim(_tax_code), ''),
      NULLIF(btrim(_email), ''), NULLIF(btrim(_phone), ''),
      NULLIF(_address_line, ''), NULLIF(_postal_code, ''), NULLIF(_city, ''), NULLIF(_province, ''),
      NULLIF(_delivery_address_line, ''), NULLIF(_delivery_postal_code, ''), NULLIF(_delivery_city, ''),
      NULLIF(_delivery_province, ''), NULLIF(_delivery_notes, ''),
      NULLIF(_internal_reference, ''), NULLIF(_notes, ''), _uid,
      NULLIF(btrim(_region), ''), NULLIF(btrim(_country), ''), NULLIF(btrim(_sdi_code), ''),
      NULLIF(btrim(_sdi_admin_reference), ''), NULLIF(btrim(_contact_name), ''), NULLIF(btrim(_fax), ''),
      NULLIF(btrim(_pec), ''), NULLIF(btrim(_discounts), ''), NULLIF(btrim(_credit_limit), ''),
      NULLIF(btrim(_agent), ''), NULLIF(btrim(_payment_terms), ''), NULLIF(btrim(_bank), ''),
      NULLIF(btrim(_our_bank), ''), _danea_extra,
      _list, _archive
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
        notes = NULLIF(_notes, ''),
        region = coalesce(NULLIF(btrim(_region), ''), region),
        country = coalesce(NULLIF(btrim(_country), ''), country),
        sdi_code = coalesce(NULLIF(btrim(_sdi_code), ''), sdi_code),
        sdi_admin_reference = coalesce(NULLIF(btrim(_sdi_admin_reference), ''), sdi_admin_reference),
        contact_name = coalesce(NULLIF(btrim(_contact_name), ''), contact_name),
        fax = coalesce(NULLIF(btrim(_fax), ''), fax),
        pec = coalesce(NULLIF(btrim(_pec), ''), pec),
        discounts = coalesce(NULLIF(btrim(_discounts), ''), discounts),
        credit_limit = coalesce(NULLIF(btrim(_credit_limit), ''), credit_limit),
        agent = coalesce(NULLIF(btrim(_agent), ''), agent),
        payment_terms = coalesce(NULLIF(btrim(_payment_terms), ''), payment_terms),
        bank = coalesce(NULLIF(btrim(_bank), ''), bank),
        our_bank = coalesce(NULLIF(btrim(_our_bank), ''), our_bank),
        danea_extra = CASE
          WHEN _danea_extra IS NULL THEN danea_extra
          ELSE coalesce(danea_extra, '{}'::jsonb) || _danea_extra
        END,
        archive_id = coalesce(_archive, archive_id),
        assigned_price_list_number = coalesce(_list, assigned_price_list_number)
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
          jsonb_build_object('legal_name', _legal_name, 'vat_number', _vat_number, 'archive_id', _archive));
  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_customer_record(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, smallint, uuid) TO authenticated;

-- 4) Listino assegnato risolto nell'archivio del cliente
CREATE OR REPLACE FUNCTION public.set_customer_price_list(_customer_record_id uuid, _list_number smallint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _seller uuid;
  _archive uuid;
BEGIN
  SELECT seller_company_id, archive_id INTO _seller, _archive
  FROM public.customer_records WHERE id = _customer_record_id;
  IF _seller IS NULL THEN RAISE EXCEPTION 'Cliente non trovato'; END IF;
  IF _uid IS NULL OR NOT public.is_company_admin(_seller) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda venditrice';
  END IF;
  IF _list_number IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.danea_price_lists l
     WHERE l.company_id = _seller
       AND l.list_number = _list_number
       AND l.is_active
       AND (_archive IS NULL OR l.archive_id = _archive)
  ) THEN
    RAISE EXCEPTION 'Listino non valido o non attivo per l''archivio di questo cliente';
  END IF;

  UPDATE public.customer_records
  SET assigned_price_list_number = _list_number, updated_at = now()
  WHERE id = _customer_record_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_seller, _uid, 'customer_record.price_list_assigned', 'customer_record', _customer_record_id,
          jsonb_build_object('list_number', _list_number, 'archive_id', _archive));
END;
$$;

-- 5) Prezzi acquirente: listino risolto nell'archivio del cliente
CREATE OR REPLACE FUNCTION public.buyer_catalog_prices(_seller_company_id uuid, _product_ids uuid[])
RETURNS TABLE(product_id uuid, list_number smallint, net_price numeric, gross_price numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH assignment AS (
    SELECT cr.assigned_price_list_number AS list_number
    FROM public.supplier_customer_relations r
    JOIN public.company_members m
      ON m.company_id = r.buyer_company_id
     AND m.user_id = auth.uid()
     AND m.status = 'attivo'
    JOIN public.customer_records cr
      ON cr.id = r.customer_record_id
     AND cr.seller_company_id = r.seller_company_id
    WHERE r.seller_company_id = _seller_company_id
      AND r.status = 'attivo'
      AND r.seller_enabled
      AND r.buyer_enabled
      AND cr.assigned_price_list_number IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.danea_price_lists l
        WHERE l.company_id = _seller_company_id
          AND l.list_number = cr.assigned_price_list_number
          AND l.is_active
          AND (cr.archive_id IS NULL OR l.archive_id = cr.archive_id)
      )
    LIMIT 1
  )
  SELECT pp.product_id, pp.list_number, pp.net_price, pp.gross_price
  FROM public.product_prices pp
  JOIN assignment a ON a.list_number = pp.list_number
  JOIN public.products p
    ON p.id = pp.product_id
   AND p.publish_status = 'pubblicato'
   AND p.b2b_visible
  WHERE pp.company_id = _seller_company_id
    AND pp.product_id = ANY(_product_ids);
$$;
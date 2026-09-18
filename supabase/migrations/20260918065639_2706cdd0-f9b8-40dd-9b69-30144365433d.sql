ALTER TABLE public.customer_records
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS sdi_code text,
  ADD COLUMN IF NOT EXISTS sdi_admin_reference text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS fax text,
  ADD COLUMN IF NOT EXISTS pec text,
  ADD COLUMN IF NOT EXISTS discounts text,
  ADD COLUMN IF NOT EXISTS credit_limit text,
  ADD COLUMN IF NOT EXISTS agent text,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS bank text,
  ADD COLUMN IF NOT EXISTS our_bank text,
  ADD COLUMN IF NOT EXISTS danea_extra jsonb;

DROP FUNCTION IF EXISTS public.manage_customer_record(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.manage_customer_record(
  _seller_company_id uuid,
  _action text,
  _customer_record_id uuid DEFAULT NULL::uuid,
  _legal_name text DEFAULT NULL::text,
  _vat_number text DEFAULT NULL::text,
  _tax_code text DEFAULT NULL::text,
  _email text DEFAULT NULL::text,
  _phone text DEFAULT NULL::text,
  _address_line text DEFAULT NULL::text,
  _postal_code text DEFAULT NULL::text,
  _city text DEFAULT NULL::text,
  _province text DEFAULT NULL::text,
  _delivery_address_line text DEFAULT NULL::text,
  _delivery_postal_code text DEFAULT NULL::text,
  _delivery_city text DEFAULT NULL::text,
  _delivery_province text DEFAULT NULL::text,
  _delivery_notes text DEFAULT NULL::text,
  _internal_reference text DEFAULT NULL::text,
  _notes text DEFAULT NULL::text,
  _region text DEFAULT NULL::text,
  _country text DEFAULT NULL::text,
  _sdi_code text DEFAULT NULL::text,
  _sdi_admin_reference text DEFAULT NULL::text,
  _contact_name text DEFAULT NULL::text,
  _fax text DEFAULT NULL::text,
  _pec text DEFAULT NULL::text,
  _discounts text DEFAULT NULL::text,
  _credit_limit text DEFAULT NULL::text,
  _agent text DEFAULT NULL::text,
  _payment_terms text DEFAULT NULL::text,
  _bank text DEFAULT NULL::text,
  _our_bank text DEFAULT NULL::text,
  _danea_extra jsonb DEFAULT NULL::jsonb,
  _price_list_number smallint DEFAULT NULL::smallint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
  _list smallint;
BEGIN
  IF _uid IS NULL OR NOT public.is_company_admin(_seller_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;
  IF NOT public.company_sells(_seller_company_id) THEN
    RAISE EXCEPTION 'L''azienda non ha la capacità di vendita attiva';
  END IF;

  IF _price_list_number IS NOT NULL THEN
    SELECT list_number INTO _list
    FROM public.danea_price_lists
    WHERE company_id = _seller_company_id AND list_number = _price_list_number
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
      assigned_price_list_number
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
      _list
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
          jsonb_build_object('legal_name', _legal_name, 'vat_number', _vat_number));
  RETURN _id;
END;
$function$;

REVOKE ALL ON FUNCTION public.manage_customer_record(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manage_customer_record(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, smallint) TO authenticated;
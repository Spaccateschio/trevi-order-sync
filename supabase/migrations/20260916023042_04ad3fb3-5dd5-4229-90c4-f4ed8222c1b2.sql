CREATE OR REPLACE FUNCTION public.register_customer_company(
  _legal_name TEXT,
  _vat_number TEXT DEFAULT NULL,
  _tax_code TEXT DEFAULT NULL,
  _email TEXT DEFAULT NULL,
  _phone TEXT DEFAULT NULL,
  _address_line TEXT DEFAULT NULL,
  _postal_code TEXT DEFAULT NULL,
  _city TEXT DEFAULT NULL,
  _province TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _customer_id UUID;
  _supplier_id UUID;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta';
  END IF;

  IF EXISTS (SELECT 1 FROM public.customer_company_users u WHERE u.user_id = _uid) THEN
    RAISE EXCEPTION 'Utente già collegato a un''azienda cliente';
  END IF;

  INSERT INTO public.customer_companies (
    legal_name, vat_number, tax_code, email, phone,
    address_line, postal_code, city, province, created_by
  ) VALUES (
    _legal_name, NULLIF(_vat_number, ''), NULLIF(_tax_code, ''), NULLIF(_email, ''), NULLIF(_phone, ''),
    NULLIF(_address_line, ''), NULLIF(_postal_code, ''), NULLIF(_city, ''), NULLIF(_province, ''), _uid
  )
  RETURNING id INTO _customer_id;

  INSERT INTO public.customer_company_users (customer_company_id, user_id, role)
  VALUES (_customer_id, _uid, 'owner');

  -- Se esiste una sola azienda fornitrice attiva, apre la richiesta di collegamento.
  SELECT c.id INTO _supplier_id
  FROM public.companies c
  WHERE c.status = 'attivo'
  LIMIT 2;

  IF (SELECT count(*) FROM public.companies c WHERE c.status = 'attivo') = 1 THEN
    INSERT INTO public.supplier_customer_relations (
      company_id, customer_company_id, status, origin, requested_by
    ) VALUES (
      _supplier_id, _customer_id, 'in_attesa', 'richiesta_cliente', _uid
    );
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id)
  VALUES (_supplier_id, _uid, 'customer_company.registered', 'customer_company', _customer_id);

  RETURN _customer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_customer_company(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_customer_company(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
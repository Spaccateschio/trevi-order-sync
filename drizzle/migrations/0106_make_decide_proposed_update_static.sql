CREATE OR REPLACE FUNCTION public.decide_proposed_update(_proposal_id uuid, _accept boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _p public.customer_record_proposed_updates;
  _allowed text[] := ARRAY[
    'legal_name','vat_number','tax_code','email','phone','address_line','postal_code',
    'city','province','delivery_address_line','delivery_postal_code','delivery_city',
    'delivery_province','delivery_notes','notes','contact_name'
  ];
BEGIN
  SELECT * INTO _p FROM public.customer_record_proposed_updates WHERE id = _proposal_id;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'Proposta non trovata'; END IF;
  IF _uid IS NULL OR NOT public.is_company_admin(_p.seller_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda venditrice';
  END IF;
  IF _p.status <> 'in_attesa' THEN RAISE EXCEPTION 'Proposta già gestita'; END IF;

  IF _accept THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.customer_records cr
      WHERE cr.id = _p.customer_record_id
        AND cr.seller_company_id = _p.seller_company_id
    ) THEN
      RAISE EXCEPTION 'La scheda cliente non appartiene a questa azienda';
    END IF;
    IF _p.field_name IS NULL OR NOT (_p.field_name = ANY(_allowed)) THEN
      RAISE EXCEPTION 'Campo non modificabile: %', coalesce(_p.field_name, '(vuoto)');
    END IF;

    IF _p.field_name = 'legal_name' THEN
      UPDATE public.customer_records SET legal_name = _p.proposed_value
      WHERE id = _p.customer_record_id AND seller_company_id = _p.seller_company_id;
    ELSIF _p.field_name = 'vat_number' THEN
      UPDATE public.customer_records SET vat_number = _p.proposed_value
      WHERE id = _p.customer_record_id AND seller_company_id = _p.seller_company_id;
    ELSIF _p.field_name = 'tax_code' THEN
      UPDATE public.customer_records SET tax_code = _p.proposed_value
      WHERE id = _p.customer_record_id AND seller_company_id = _p.seller_company_id;
    ELSIF _p.field_name = 'email' THEN
      UPDATE public.customer_records SET email = _p.proposed_value
      WHERE id = _p.customer_record_id AND seller_company_id = _p.seller_company_id;
    ELSIF _p.field_name = 'phone' THEN
      UPDATE public.customer_records SET phone = _p.proposed_value
      WHERE id = _p.customer_record_id AND seller_company_id = _p.seller_company_id;
    ELSIF _p.field_name = 'address_line' THEN
      UPDATE public.customer_records SET address_line = _p.proposed_value
      WHERE id = _p.customer_record_id AND seller_company_id = _p.seller_company_id;
    ELSIF _p.field_name = 'postal_code' THEN
      UPDATE public.customer_records SET postal_code = _p.proposed_value
      WHERE id = _p.customer_record_id AND seller_company_id = _p.seller_company_id;
    ELSIF _p.field_name = 'city' THEN
      UPDATE public.customer_records SET city = _p.proposed_value
      WHERE id = _p.customer_record_id AND seller_company_id = _p.seller_company_id;
    ELSIF _p.field_name = 'province' THEN
      UPDATE public.customer_records SET province = _p.proposed_value
      WHERE id = _p.customer_record_id AND seller_company_id = _p.seller_company_id;
    ELSIF _p.field_name = 'delivery_address_line' THEN
      UPDATE public.customer_records SET delivery_address_line = _p.proposed_value
      WHERE id = _p.customer_record_id AND seller_company_id = _p.seller_company_id;
    ELSIF _p.field_name = 'delivery_postal_code' THEN
      UPDATE public.customer_records SET delivery_postal_code = _p.proposed_value
      WHERE id = _p.customer_record_id AND seller_company_id = _p.seller_company_id;
    ELSIF _p.field_name = 'delivery_city' THEN
      UPDATE public.customer_records SET delivery_city = _p.proposed_value
      WHERE id = _p.customer_record_id AND seller_company_id = _p.seller_company_id;
    ELSIF _p.field_name = 'delivery_province' THEN
      UPDATE public.customer_records SET delivery_province = _p.proposed_value
      WHERE id = _p.customer_record_id AND seller_company_id = _p.seller_company_id;
    ELSIF _p.field_name = 'delivery_notes' THEN
      UPDATE public.customer_records SET delivery_notes = _p.proposed_value
      WHERE id = _p.customer_record_id AND seller_company_id = _p.seller_company_id;
    ELSIF _p.field_name = 'notes' THEN
      UPDATE public.customer_records SET notes = _p.proposed_value
      WHERE id = _p.customer_record_id AND seller_company_id = _p.seller_company_id;
    ELSIF _p.field_name = 'contact_name' THEN
      UPDATE public.customer_records SET contact_name = _p.proposed_value
      WHERE id = _p.customer_record_id AND seller_company_id = _p.seller_company_id;
    END IF;
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
$function$;

REVOKE EXECUTE ON FUNCTION public.decide_proposed_update(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_proposed_update(uuid, boolean) TO authenticated, service_role;
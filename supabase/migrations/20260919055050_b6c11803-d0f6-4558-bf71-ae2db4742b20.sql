CREATE OR REPLACE FUNCTION public.resolve_relation_records(_relation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    WITH candidates AS (
      SELECT cr.id, cr.created_at
      FROM public.customer_records cr
      WHERE cr.seller_company_id = _rel.seller_company_id
        AND cr.status <> 'revocato'
        AND NOT EXISTS (SELECT 1 FROM public.supplier_customer_relations r WHERE r.customer_record_id = cr.id)
        AND (
          (_buyer.vat_normalized IS NOT NULL AND cr.vat_normalized = _buyer.vat_normalized)
          OR (_buyer.vat_normalized IS NULL AND _buyer.tax_code IS NOT NULL AND cr.tax_code = _buyer.tax_code)
        )
    )
    SELECT (SELECT count(*) FROM candidates),
           (SELECT id FROM candidates ORDER BY created_at, id LIMIT 1)
    INTO _count, _match;

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
    WITH candidates AS (
      SELECT sr.id, sr.created_at
      FROM public.supplier_records sr
      WHERE sr.buyer_company_id = _rel.buyer_company_id
        AND sr.status <> 'revocato'
        AND NOT EXISTS (SELECT 1 FROM public.supplier_customer_relations r WHERE r.supplier_record_id = sr.id)
        AND (
          (_seller.vat_normalized IS NOT NULL AND sr.vat_normalized = _seller.vat_normalized)
          OR (_seller.vat_normalized IS NULL AND _seller.tax_code IS NOT NULL AND sr.tax_code = _seller.tax_code)
        )
    )
    SELECT (SELECT count(*) FROM candidates),
           (SELECT id FROM candidates ORDER BY created_at, id LIMIT 1)
    INTO _count, _match;

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
$function$;
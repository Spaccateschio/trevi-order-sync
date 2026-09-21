CREATE OR REPLACE FUNCTION public.add_catalog_product_to_own_products(
  _buyer_company_id uuid,
  _seller_company_id uuid,
  _seller_product_id uuid,
  _own_product_id uuid DEFAULT NULL::uuid,
  _supplier_product_code text DEFAULT NULL::text,
  _purchase_unit_id uuid DEFAULT NULL::uuid,
  _conversion_factor numeric DEFAULT NULL::numeric,
  _actor_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_seller public.products;
  v_relation uuid;
  v_supplier_record uuid;
  v_product uuid;
  v_link uuid;
  v_created_product boolean := false;
  v_created_link boolean := false;
  v_code text := NULLIF(btrim(COALESCE(_supplier_product_code, '')), '');
  v_archive uuid;
  v_seller_name text;
BEGIN
  IF NOT public.is_company_admin(_buyer_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;
  IF NOT public.relation_is_operational(_seller_company_id, _buyer_company_id) THEN
    RAISE EXCEPTION 'Catalogo fornitore non accessibile';
  END IF;

  SELECT * INTO v_seller FROM public.products
  WHERE id = _seller_product_id AND company_id = _seller_company_id;
  IF v_seller.id IS NULL THEN
    RAISE EXCEPTION 'Articolo di catalogo non trovato';
  END IF;

  IF v_code IS NULL THEN v_code := v_seller.code; END IF;

  SELECT r.id, r.supplier_record_id INTO v_relation, v_supplier_record
  FROM public.supplier_customer_relations r
  WHERE r.buyer_company_id = _buyer_company_id
    AND r.seller_company_id = _seller_company_id
  ORDER BY (r.status = 'attivo') DESC, r.created_at DESC
  LIMIT 1;

  IF v_supplier_record IS NULL THEN
    SELECT legal_name INTO v_seller_name FROM public.companies WHERE id = _seller_company_id;
    SELECT s.id INTO v_supplier_record
    FROM public.supplier_records s
    WHERE s.buyer_company_id = _buyer_company_id
      AND lower(s.legal_name) = lower(COALESCE(v_seller_name, ''))
    ORDER BY s.created_at
    LIMIT 1;

    IF v_supplier_record IS NULL THEN
      INSERT INTO public.supplier_records (buyer_company_id, legal_name, created_by)
      VALUES (_buyer_company_id, COALESCE(NULLIF(btrim(COALESCE(v_seller_name, '')), ''), 'Fornitore'),
              COALESCE(_actor_user_id, auth.uid()))
      RETURNING id INTO v_supplier_record;
    END IF;

    IF v_relation IS NOT NULL THEN
      UPDATE public.supplier_customer_relations
      SET supplier_record_id = v_supplier_record, supplier_record_match_required = false
      WHERE id = v_relation AND supplier_record_id IS NULL;
    END IF;
  END IF;

  IF _own_product_id IS NOT NULL THEN
    SELECT id INTO v_product FROM public.products
    WHERE id = _own_product_id AND company_id = _buyer_company_id;
    IF v_product IS NULL THEN
      RAISE EXCEPTION 'Prodotto non trovato fra i tuoi prodotti';
    END IF;
  ELSE
    SELECT id INTO v_product FROM public.products
    WHERE company_id = _buyer_company_id
      AND created_from_product_id = _seller_product_id
      AND origin = 'interno'
    LIMIT 1;

    IF v_product IS NULL THEN
      v_archive := public.ensure_internal_archive(_buyer_company_id, COALESCE(_actor_user_id, auth.uid()));
      INSERT INTO public.products (
        company_id, archive_id, code, description, category, subcategory, danea_um,
        barcode, producer_name, publish_status, origin, is_managed, b2b_visible,
        created_from_product_id, created_from_company_id
      ) VALUES (
        _buyer_company_id, v_archive, public.next_internal_product_code(_buyer_company_id),
        COALESCE(v_seller.description, v_seller.code), v_seller.category, v_seller.subcategory,
        v_seller.danea_um, v_seller.barcode, v_seller.producer_name,
        'pubblicato', 'interno', true, false,
        _seller_product_id, _seller_company_id
      ) RETURNING id INTO v_product;
      v_created_product := true;
    END IF;
  END IF;

  SELECT id INTO v_link FROM public.product_supplier_links
  WHERE company_id = _buyer_company_id
    AND product_id = v_product
    AND supplier_record_id = v_supplier_record
    AND COALESCE(supplier_product_code, '') = COALESCE(v_code, '')
  LIMIT 1;

  IF v_link IS NULL THEN
    INSERT INTO public.product_supplier_links (
      company_id, product_id, supplier_record_id, supplier_product_code,
      purchase_unit_id, conversion_factor, origin, created_by
    ) VALUES (
      _buyer_company_id, v_product, v_supplier_record, v_code,
      _purchase_unit_id, _conversion_factor, 'manuale', COALESCE(_actor_user_id, auth.uid())
    ) RETURNING id INTO v_link;
    v_created_link := true;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_buyer_company_id, COALESCE(_actor_user_id, auth.uid()), 'catalog_product.add_to_own', 'product', v_product,
          jsonb_build_object('seller_company_id', _seller_company_id,
                             'seller_product_id', _seller_product_id,
                             'link_id', v_link,
                             'created_product', v_created_product,
                             'created_link', v_created_link));

  RETURN jsonb_build_object(
    'product_id', v_product,
    'link_id', v_link,
    'supplier_record_id', v_supplier_record,
    'created_product', v_created_product,
    'created_link', v_created_link
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.add_catalog_product_to_own_products(uuid, uuid, uuid, uuid, text, uuid, numeric, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.add_catalog_product_to_own_products(uuid, uuid, uuid, uuid, text, uuid, numeric, uuid) TO authenticated, service_role;
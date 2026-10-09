-- TREVI FRUIT — FASE 1 — SQL FINALE CONSOLIDATO (v5)
CREATE OR REPLACE FUNCTION public.copy_b2b_item_to_own_product(
  _buyer_company_id uuid, _seller_company_id uuid, _seller_product_id uuid,
  _description text, _code text DEFAULT NULL, _category text DEFAULT NULL,
  _subcategory text DEFAULT NULL, _barcode text DEFAULT NULL, _producer_name text DEFAULT NULL,
  _notes text DEFAULT NULL, _stock_unit_id uuid DEFAULT NULL, _price_unit_id uuid DEFAULT NULL,
  _force_new boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_seller public.products;
  v_relation uuid; v_supplier_record uuid;
  v_unit public.units_of_measure;
  v_existing jsonb; v_active record;
  v_archive uuid; v_code text := NULLIF(btrim(COALESCE(_code,'')),'');
  v_product uuid; v_link uuid; v_constraint text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF NOT public.is_company_admin(_buyer_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;
  IF NOT public.relation_is_operational(_seller_company_id, _buyer_company_id) THEN
    RAISE EXCEPTION 'Catalogo fornitore non accessibile';
  END IF;
  IF _description IS NULL OR btrim(_description) = '' THEN
    RAISE EXCEPTION 'La descrizione del prodotto è obbligatoria';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_item:'||_buyer_company_id||':'||_seller_product_id, 0));

  SELECT r.id, r.supplier_record_id INTO v_relation, v_supplier_record
  FROM public.supplier_customer_relations r
  JOIN public.supplier_records s ON s.id = r.supplier_record_id AND s.buyer_company_id = _buyer_company_id
  WHERE r.buyer_company_id = _buyer_company_id AND r.seller_company_id = _seller_company_id
    AND r.status = 'attivo' AND r.seller_enabled AND r.buyer_enabled
  ORDER BY r.created_at DESC LIMIT 1;
  IF v_supplier_record IS NULL THEN
    RAISE EXCEPTION 'Rapporto con il fornitore senza scheda fornitore: abbinala prima di aggiungere il prodotto';
  END IF;

  SELECT * INTO v_seller FROM public.products WHERE id = _seller_product_id AND company_id = _seller_company_id;
  IF v_seller.id IS NULL THEN RAISE EXCEPTION 'Articolo di catalogo non trovato per questo fornitore'; END IF;

  IF _stock_unit_id IS NOT NULL THEN
    SELECT * INTO v_unit FROM public.units_of_measure
     WHERE id = _stock_unit_id AND company_id = _buyer_company_id AND status = 'attivo';
    IF NOT FOUND THEN RAISE EXCEPTION 'U.M. di magazzino non valida per la tua azienda'; END IF;
  END IF;
  IF _price_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.units_of_measure WHERE id = _price_unit_id AND company_id = _buyer_company_id) THEN
    RAISE EXCEPTION 'Unità di misura del prezzo non trovata';
  END IF;

  SELECT l.id, p.id AS product_id, p.code, p.description INTO v_active
  FROM public.product_supplier_links l JOIN public.products p ON p.id = l.product_id
  WHERE l.company_id = _buyer_company_id AND l.b2b_item_id = _seller_product_id AND l.is_active;

  SELECT jsonb_agg(jsonb_build_object('id',p.id,'code',p.code,'description',p.description,
           'created_at',p.created_at,'linked', p.id IS NOT DISTINCT FROM v_active.product_id) ORDER BY p.created_at)
    INTO v_existing
  FROM public.products p
  WHERE p.company_id = _buyer_company_id
    AND ((p.created_from_product_id = _seller_product_id AND p.created_from_company_id = _seller_company_id)
         OR p.id = v_active.product_id);
  IF v_existing IS NOT NULL AND NOT _force_new THEN
    RETURN jsonb_build_object('status','needs_confirmation','existing',v_existing);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('internal_product_code:' || _buyer_company_id::text, 0));
  v_archive := public.ensure_internal_archive(_buyer_company_id, auth.uid());
  IF v_code IS NULL THEN v_code := public.next_internal_product_code(_buyer_company_id); END IF;
  IF EXISTS (SELECT 1 FROM public.products WHERE company_id = _buyer_company_id AND archive_id = v_archive AND code = v_code) THEN
    RAISE EXCEPTION 'Esiste già un prodotto con il codice %', v_code;
  END IF;

  BEGIN
    INSERT INTO public.products (company_id, archive_id, code, description, category, subcategory, danea_um,
      barcode, producer_name, notes, publish_status, origin, is_managed, b2b_visible, price_unit_id,
      created_from_product_id, created_from_company_id)
    VALUES (_buyer_company_id, v_archive, v_code, btrim(_description),
      NULLIF(btrim(COALESCE(_category,'')),''), NULLIF(btrim(COALESCE(_subcategory,'')),''),
      CASE WHEN _stock_unit_id IS NOT NULL THEN v_unit.code END,
      NULLIF(btrim(COALESCE(_barcode,'')),''), NULLIF(btrim(COALESCE(_producer_name,'')),''),
      NULLIF(btrim(COALESCE(_notes,'')),''), 'pubblicato', 'interno', true, false, _price_unit_id,
      _seller_product_id, _seller_company_id)
    RETURNING id INTO v_product;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'products_archive_code_unique' THEN
      RAISE EXCEPTION 'Il codice % è già in uso: riprova', v_code;
    END IF;
    RAISE;
  END;

  IF _stock_unit_id IS NOT NULL THEN
    PERFORM public.set_product_stock_unit(v_product, _stock_unit_id);
  END IF;

  IF v_active.id IS NULL THEN
    INSERT INTO public.product_supplier_links (company_id, product_id, supplier_record_id, supplier_product_code,
      purchase_unit_id, conversion_factor, origin, created_by, supplier_company_id, b2b_item_id)
    VALUES (_buyer_company_id, v_product, v_supplier_record, v_seller.code,
      NULL, NULL, 'manuale', auth.uid(), _seller_company_id, _seller_product_id)
    RETURNING id INTO v_link;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_buyer_company_id, auth.uid(), 'b2b_item.copy_to_own', 'product', v_product,
    jsonb_build_object('seller_company_id',_seller_company_id,'seller_product_id',_seller_product_id,
      'link_id',v_link,'forced',_force_new,'already_linked_product_id',v_active.product_id));

  RETURN jsonb_build_object('status','created','product_id',v_product,'code',v_code,
    'link_id',v_link,'created_link', v_link IS NOT NULL,
    'already_linked_to', CASE WHEN v_active.id IS NOT NULL THEN
        jsonb_build_object('product_id',v_active.product_id,'code',v_active.code,'description',v_active.description) END,
    'conversion_to_verify', true);
END $function$;

REVOKE ALL ON FUNCTION public.copy_b2b_item_to_own_product(uuid, uuid, uuid, text, text, text, text, text, text, text, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copy_b2b_item_to_own_product(uuid, uuid, uuid, text, text, text, text, text, text, text, uuid, uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_catalog_product_to_own_products(_buyer_company_id uuid, _seller_company_id uuid, _seller_product_id uuid, _own_product_id uuid DEFAULT NULL::uuid, _supplier_product_code text DEFAULT NULL::text, _purchase_unit_id uuid DEFAULT NULL::uuid, _conversion_factor numeric DEFAULT NULL::numeric, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  v_reactivated boolean := false;
  v_b2b_filled boolean := false;
  v_new_code text; v_constraint text;
  v_active record; v_row record; v_candidates jsonb; v_count int;
  v_has_incompatible boolean; v_active_incompatible boolean;
  v_uncertain jsonb;
  v_pu uuid; v_su uuid; v_to_verify boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_admin(_buyer_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;
  IF NOT public.relation_is_operational(_seller_company_id, _buyer_company_id) THEN
    RAISE EXCEPTION 'Catalogo fornitore non accessibile';
  END IF;
  IF _conversion_factor IS NOT NULL AND _conversion_factor <= 0 THEN
    RAISE EXCEPTION 'Il fattore di conversione deve essere maggiore di zero';
  END IF;
  IF _purchase_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.units_of_measure
    WHERE id = _purchase_unit_id AND company_id = _buyer_company_id AND status = 'attivo') THEN
    RAISE EXCEPTION 'U.M. d''acquisto non valida per la tua azienda';
  END IF;

  SELECT * INTO v_seller FROM public.products
  WHERE id = _seller_product_id AND company_id = _seller_company_id;
  IF v_seller.id IS NULL THEN
    RAISE EXCEPTION 'Articolo di catalogo non trovato';
  END IF;

  IF v_code IS NULL THEN v_code := NULLIF(btrim(COALESCE(v_seller.code, '')), ''); END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_item:'||_buyer_company_id||':'||_seller_product_id, 0));

  SELECT r.id, r.supplier_record_id INTO v_relation, v_supplier_record
  FROM public.supplier_customer_relations r
  JOIN public.supplier_records s ON s.id = r.supplier_record_id AND s.buyer_company_id = _buyer_company_id
  WHERE r.buyer_company_id = _buyer_company_id AND r.seller_company_id = _seller_company_id
    AND r.status = 'attivo' AND r.seller_enabled AND r.buyer_enabled
  ORDER BY r.created_at DESC LIMIT 1;
  IF v_supplier_record IS NULL THEN
    RAISE EXCEPTION 'Rapporto con il fornitore senza scheda fornitore: abbinala prima di aggiungere il prodotto';
  END IF;

  SELECT l.id, l.product_id, l.supplier_record_id, l.supplier_company_id, p.code, p.description INTO v_active
  FROM public.product_supplier_links l JOIN public.products p ON p.id = l.product_id
  WHERE l.company_id = _buyer_company_id AND l.b2b_item_id = _seller_product_id AND l.is_active;
  IF v_active.id IS NOT NULL AND (v_active.supplier_record_id <> v_supplier_record
       OR v_active.supplier_company_id IS DISTINCT FROM _seller_company_id) THEN
    RAISE EXCEPTION 'Il collegamento esistente a questo articolo non è coerente con il fornitore: verifica % · %', v_active.code, v_active.description;
  END IF;

  IF _own_product_id IS NOT NULL THEN
    SELECT id INTO v_product FROM public.products
    WHERE id = _own_product_id AND company_id = _buyer_company_id;
    IF v_product IS NULL THEN
      RAISE EXCEPTION 'Prodotto non trovato fra i tuoi prodotti';
    END IF;
    IF v_active.id IS NOT NULL AND v_active.product_id <> v_product THEN
      RAISE EXCEPTION 'Articolo già collegato a % · %', v_active.code, v_active.description;
    END IF;
  ELSIF v_active.id IS NOT NULL THEN
    RETURN jsonb_build_object('status','linked','product_id',v_active.product_id,'link_id',v_active.id,
      'supplier_record_id',v_supplier_record,'created_product',false,'created_link',false,
      'reactivated',false,'b2b_filled',false);
  ELSE
    SELECT count(*), jsonb_agg(jsonb_build_object('id',id,'code',code,'description',description,'created_at',created_at) ORDER BY created_at)
      INTO v_count, v_candidates
    FROM public.products
    WHERE company_id = _buyer_company_id AND created_from_product_id = _seller_product_id
      AND created_from_company_id = _seller_company_id;
    IF v_count > 1 THEN
      RETURN jsonb_build_object('status','choose_candidate','candidates',v_candidates,
        'product_id',NULL,'link_id',NULL,'supplier_record_id',v_supplier_record,
        'created_product',false,'created_link',false);
    ELSIF v_count = 1 THEN
      v_product := (v_candidates->0->>'id')::uuid;
    ELSE
      PERFORM pg_advisory_xact_lock(hashtextextended('internal_product_code:' || _buyer_company_id::text, 0));
      v_archive := public.ensure_internal_archive(_buyer_company_id, _actor_user_id);
      v_new_code := public.next_internal_product_code(_buyer_company_id);
      BEGIN
        INSERT INTO public.products (
          company_id, archive_id, code, description, category, subcategory, danea_um,
          barcode, producer_name, publish_status, origin, is_managed, b2b_visible,
          created_from_product_id, created_from_company_id
        ) VALUES (
          _buyer_company_id, v_archive, v_new_code,
          COALESCE(v_seller.description, v_seller.code), v_seller.category, v_seller.subcategory,
          v_seller.danea_um, v_seller.barcode, v_seller.producer_name,
          'pubblicato', 'interno', true, false,
          _seller_product_id, _seller_company_id
        ) RETURNING id INTO v_product;
      EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
        IF v_constraint = 'products_archive_code_unique' THEN
          RAISE EXCEPTION 'Il codice % è già in uso: riprova', v_new_code;
        END IF;
        RAISE;
      END;
      v_created_product := true;
    END IF;
  END IF;

  SELECT id INTO v_link FROM public.product_supplier_links
  WHERE company_id = _buyer_company_id AND product_id = v_product
    AND b2b_item_id = _seller_product_id AND is_active;

  IF v_link IS NULL THEN
    IF v_code IS NOT NULL THEN
      SELECT
        bool_or(NOT ((b2b_item_id = _seller_product_id)
                     OR (b2b_item_id IS NULL AND (supplier_company_id IS NULL OR supplier_company_id = _seller_company_id)))),
        bool_or(is_active AND NOT ((b2b_item_id = _seller_product_id)
                     OR (b2b_item_id IS NULL AND (supplier_company_id IS NULL OR supplier_company_id = _seller_company_id))))
        INTO v_has_incompatible, v_active_incompatible
      FROM public.product_supplier_links
      WHERE company_id = _buyer_company_id AND product_id = v_product AND supplier_record_id = v_supplier_record
        AND NULLIF(btrim(COALESCE(supplier_product_code, '')), '') = v_code;
      IF COALESCE(v_active_incompatible, false) THEN
        RAISE EXCEPTION 'Questo prodotto ha già un collegamento attivo con lo stesso codice per un altro articolo o un altro venditore: nessuna modifica eseguita';
      END IF;
    END IF;

    SELECT id, is_active, b2b_item_id INTO v_row
    FROM public.product_supplier_links
    WHERE company_id = _buyer_company_id AND product_id = v_product AND supplier_record_id = v_supplier_record
      AND (supplier_company_id IS NULL OR supplier_company_id = _seller_company_id)
      AND ( b2b_item_id = _seller_product_id
            OR (b2b_item_id IS NULL AND v_code IS NOT NULL
                AND origin <> 'danea'
                AND NULLIF(btrim(COALESCE(supplier_product_code, '')), '') = v_code) )
    ORDER BY is_active DESC, (b2b_item_id = _seller_product_id) DESC NULLS LAST, created_at ASC, id ASC
    LIMIT 1;

    IF NOT v_created_product THEN
      SELECT jsonb_agg(jsonb_build_object(
               'link_id', l.id, 'product_id', l.product_id, 'product_code', p.code, 'product_description', p.description,
               'supplier_record_id', l.supplier_record_id, 'supplier_reference_label', l.supplier_reference_label,
               'supplier_product_code', l.supplier_product_code, 'origin', l.origin,
               'is_active', l.is_active, 'created_at', l.created_at)
             ORDER BY l.is_active DESC, l.created_at, l.id)
        INTO v_uncertain
      FROM public.product_supplier_links l JOIN public.products p ON p.id = l.product_id
      WHERE l.company_id = _buyer_company_id AND l.product_id = v_product AND l.supplier_record_id = v_supplier_record
        AND l.b2b_item_id IS NULL
        AND (l.supplier_company_id IS NULL OR l.supplier_company_id = _seller_company_id)
        AND ( NULLIF(btrim(COALESCE(l.supplier_product_code, '')), '') IS NULL
              OR (l.origin = 'danea' AND v_code IS NOT NULL
                  AND NULLIF(btrim(COALESCE(l.supplier_product_code, '')), '') = v_code) );
    END IF;

    IF v_row.id IS NOT NULL AND v_row.is_active THEN
      v_link := v_row.id;
      UPDATE public.product_supplier_links
      SET b2b_item_id = _seller_product_id, supplier_company_id = _seller_company_id
      WHERE id = v_link AND b2b_item_id IS NULL
        AND (supplier_company_id IS NULL OR supplier_company_id = _seller_company_id);
      v_b2b_filled := FOUND;

    ELSIF v_uncertain IS NOT NULL THEN
      IF v_created_product THEN
        RAISE EXCEPTION 'Collegamento esistente senza codice articolo: verifica il collegamento prima di procedere';
      END IF;
      RETURN jsonb_build_object('status','link_identity_uncertain',
        'message','Collegamento esistente senza codice articolo: verifica il collegamento prima di procedere',
        'uncertain_links', v_uncertain,
        'product_id', NULL, 'link_id', NULL, 'supplier_record_id', v_supplier_record,
        'created_product', false, 'created_link', false);

    ELSIF v_row.id IS NOT NULL THEN
      v_link := v_row.id;
      IF v_row.b2b_item_id IS NULL THEN
        UPDATE public.product_supplier_links
        SET b2b_item_id = _seller_product_id, supplier_company_id = _seller_company_id
        WHERE id = v_link AND b2b_item_id IS NULL
          AND (supplier_company_id IS NULL OR supplier_company_id = _seller_company_id);
        v_b2b_filled := FOUND;
      END IF;
      UPDATE public.product_supplier_links SET is_active = true WHERE id = v_link AND NOT is_active;
      v_reactivated := FOUND;

    ELSIF COALESCE(v_has_incompatible, false) THEN
      RAISE EXCEPTION 'Esiste già un collegamento con questo codice per un altro articolo o un altro venditore: nessuna modifica eseguita';

    ELSE
      BEGIN
        INSERT INTO public.product_supplier_links (
          company_id, product_id, supplier_record_id, supplier_product_code,
          purchase_unit_id, conversion_factor, origin, created_by,
          supplier_company_id, b2b_item_id
        ) VALUES (
          _buyer_company_id, v_product, v_supplier_record, v_code,
          _purchase_unit_id, _conversion_factor, 'manuale', _actor_user_id,
          _seller_company_id, _seller_product_id
        ) RETURNING id INTO v_link;
      EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
        IF v_constraint IN ('product_supplier_links_ref_code_unique','product_supplier_links_ref_label_unique') THEN
          RAISE EXCEPTION 'Esiste già un collegamento di questo fornitore con lo stesso riferimento su questo prodotto: verifica il collegamento';
        ELSIF v_constraint = 'product_supplier_links_one_active_b2b_item' THEN
          RAISE EXCEPTION 'Articolo già collegato a un altro prodotto';
        END IF;
        RAISE;
      END;
      v_created_link := true;
    END IF;
  END IF;

  SELECT purchase_unit_id INTO v_pu FROM public.product_supplier_links WHERE id = v_link;
  SELECT stock_unit_id INTO v_su FROM public.products WHERE id = v_product;
  v_to_verify := v_pu IS NULL OR v_su IS NULL OR (v_pu <> v_su AND NOT EXISTS (
    SELECT 1 FROM public.product_supplier_link_units u
    WHERE u.link_id = v_link AND u.unit_id = v_pu AND u.verified_stock_unit_id = v_su
      AND u.stock_conversion_factor IS NOT NULL));

  IF v_created_product OR v_created_link OR v_reactivated OR v_b2b_filled THEN
    INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
    VALUES (_buyer_company_id, _actor_user_id, 'catalog_product.add_to_own', 'product', v_product,
            jsonb_build_object('seller_company_id', _seller_company_id,
                               'seller_product_id', _seller_product_id,
                               'link_id', v_link,
                               'created_product', v_created_product,
                               'created_link', v_created_link,
                               'reactivated', v_reactivated,
                               'b2b_filled', v_b2b_filled));
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_created_product THEN 'created' ELSE 'linked' END,
    'product_id', v_product,
    'link_id', v_link,
    'supplier_record_id', v_supplier_record,
    'created_product', v_created_product,
    'created_link', v_created_link,
    'reactivated', v_reactivated,
    'b2b_filled', v_b2b_filled,
    'conversion_to_verify', v_to_verify
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.manage_internal_product(_company_id uuid, _action text, _product_id uuid DEFAULT NULL::uuid, _code text DEFAULT NULL::text, _description text DEFAULT NULL::text, _category text DEFAULT NULL::text, _subcategory text DEFAULT NULL::text, _danea_um text DEFAULT NULL::text, _barcode text DEFAULT NULL::text, _producer_name text DEFAULT NULL::text, _notes text DEFAULT NULL::text, _actor_user_id uuid DEFAULT NULL::uuid, _price_unit_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_archive uuid;
  v_id uuid;
  v_code text := NULLIF(btrim(COALESCE(_code, '')), '');
  v_constraint text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;

  IF _price_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.units_of_measure WHERE id = _price_unit_id AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Unità di misura del prezzo non trovata';
  END IF;

  IF _action = 'create' THEN
    IF _description IS NULL OR btrim(_description) = '' THEN
      RAISE EXCEPTION 'La descrizione del prodotto è obbligatoria';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('internal_product_code:' || _company_id::text, 0));
    v_archive := public.ensure_internal_archive(_company_id, COALESCE(_actor_user_id, auth.uid()));
    IF v_code IS NULL THEN
      v_code := public.next_internal_product_code(_company_id);
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.products
      WHERE company_id = _company_id AND archive_id = v_archive AND code = v_code
    ) THEN
      RAISE EXCEPTION 'Esiste già un prodotto con il codice %', v_code;
    END IF;

    BEGIN
      INSERT INTO public.products (
        company_id, archive_id, code, description, category, subcategory, danea_um,
        barcode, producer_name, notes, publish_status, origin, is_managed, b2b_visible, price_unit_id
      ) VALUES (
        _company_id, v_archive, v_code, btrim(_description),
        NULLIF(btrim(COALESCE(_category, '')), ''), NULLIF(btrim(COALESCE(_subcategory, '')), ''),
        NULLIF(btrim(COALESCE(_danea_um, '')), ''), NULLIF(btrim(COALESCE(_barcode, '')), ''),
        NULLIF(btrim(COALESCE(_producer_name, '')), ''), NULLIF(btrim(COALESCE(_notes, '')), ''),
        'pubblicato', 'interno', true, false, _price_unit_id
      ) RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'products_archive_code_unique' THEN
        RAISE EXCEPTION 'Il codice % è già in uso: riprova', v_code;
      END IF;
      RAISE;
    END;

  ELSE
    SELECT id INTO v_id FROM public.products
    WHERE id = _product_id AND company_id = _company_id AND origin = 'interno';
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Prodotto interno non trovato';
    END IF;

    IF _action = 'update' THEN
      IF v_code IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.products p2
        WHERE p2.company_id = _company_id AND p2.id <> v_id
          AND p2.archive_id = (SELECT archive_id FROM public.products WHERE id = v_id)
          AND p2.code = v_code
      ) THEN
        RAISE EXCEPTION 'Esiste già un prodotto con il codice %', v_code;
      END IF;

      UPDATE public.products SET
        code = COALESCE(v_code, code),
        description = COALESCE(NULLIF(btrim(COALESCE(_description, '')), ''), description),
        category = NULLIF(btrim(COALESCE(_category, '')), ''),
        subcategory = NULLIF(btrim(COALESCE(_subcategory, '')), ''),
        danea_um = NULLIF(btrim(COALESCE(_danea_um, '')), ''),
        barcode = NULLIF(btrim(COALESCE(_barcode, '')), ''),
        producer_name = NULLIF(btrim(COALESCE(_producer_name, '')), ''),
        notes = NULLIF(btrim(COALESCE(_notes, '')), ''),
        price_unit_id = _price_unit_id,
        updated_at = now()
      WHERE id = v_id;

    ELSIF _action = 'deactivate' THEN
      UPDATE public.products
      SET is_managed = false, publish_status = 'non_pubblicato', unpublished_at = now(), updated_at = now()
      WHERE id = v_id;

    ELSIF _action = 'activate' THEN
      UPDATE public.products
      SET is_managed = true, publish_status = 'pubblicato', unpublished_at = NULL, updated_at = now()
      WHERE id = v_id;

    ELSE
      RAISE EXCEPTION 'Azione non valida: %', _action;
    END IF;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, COALESCE(_actor_user_id, auth.uid()), 'internal_product.' || _action, 'product', v_id, '{}'::jsonb);

  RETURN v_id;
END;
$function$;
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
  -- Operatore ammesso solo dentro add_catalog_item_to_open_inventory (flag locale alla transazione).
  IF NOT public.is_company_admin(_buyer_company_id)
     AND NOT (COALESCE(current_setting('app.inventory_catalog_add', true), '') = _buyer_company_id::text
              AND public.has_company_role(_buyer_company_id, 'operatore'::public.app_role)) THEN
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

CREATE OR REPLACE FUNCTION public.add_card_to_open_inventory(_company_id uuid, _product_id uuid, _link_id uuid DEFAULT NULL, _location_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session uuid; v_location uuid := _location_id; v_added int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF NOT (public.is_company_admin(_company_id) OR public.has_company_role(_company_id, 'operatore'::public.app_role)) THEN
    RAISE EXCEPTION 'Solo amministratore e operatore possono aggiungere card al conteggio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _product_id AND company_id = _company_id) THEN
    RAISE EXCEPTION 'Prodotto non valido';
  END IF;
  IF _link_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.product_supplier_links
    WHERE id = _link_id AND company_id = _company_id AND product_id = _product_id AND is_active) THEN
    RAISE EXCEPTION 'Fornitore non valido per questo prodotto';
  END IF;
  IF v_location IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.inventory_locations WHERE id = v_location AND company_id = _company_id AND status = 'attivo') THEN
    RAISE EXCEPTION 'Zona non valida';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('general_inventory:' || _company_id::text, 0));
  SELECT id INTO v_session FROM public.inventory_sessions
  WHERE company_id = _company_id AND scope = 'generale' AND status = 'in_corso' LIMIT 1;
  IF v_session IS NULL THEN RAISE EXCEPTION 'Nessun inventario aperto'; END IF;
  IF v_location IS NULL THEN v_location := public.ensure_default_inventory_location(_company_id, auth.uid()); END IF;
  INSERT INTO public.inventory_session_products (company_id, session_id, product_id, location_id, product_supplier_link_id)
  VALUES (_company_id, v_session, _product_id, v_location, _link_id)
  ON CONFLICT ON CONSTRAINT inventory_session_products_card_key DO NOTHING;
  GET DIAGNOSTICS v_added = ROW_COUNT;
  RETURN jsonb_build_object('session_id', v_session, 'added', v_added, 'location_id', v_location);
END; $$;

CREATE OR REPLACE FUNCTION public.add_catalog_item_to_open_inventory(_company_id uuid, _seller_company_id uuid, _seller_product_id uuid, _location_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session uuid; v_location uuid := _location_id; v_res jsonb; v_added int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF NOT (public.is_company_admin(_company_id) OR public.has_company_role(_company_id, 'operatore'::public.app_role)) THEN
    RAISE EXCEPTION 'Solo amministratore e operatore possono aggiungere card al conteggio';
  END IF;
  IF v_location IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.inventory_locations WHERE id = v_location AND company_id = _company_id AND status = 'attivo') THEN
    RAISE EXCEPTION 'Zona non valida';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('general_inventory:' || _company_id::text, 0));
  SELECT id INTO v_session FROM public.inventory_sessions
  WHERE company_id = _company_id AND scope = 'generale' AND status = 'in_corso' LIMIT 1;
  IF v_session IS NULL THEN RAISE EXCEPTION 'Nessun inventario aperto: usa «Aggiungi ai miei prodotti»'; END IF;

  PERFORM set_config('app.inventory_catalog_add', _company_id::text, true);
  v_res := public.add_catalog_product_to_own_products(_company_id, _seller_company_id, _seller_product_id,
                                                      NULL, NULL, NULL, NULL, auth.uid());
  PERFORM set_config('app.inventory_catalog_add', '', true);

  IF COALESCE(v_res->>'status', '') NOT IN ('created', 'linked') OR v_res->>'link_id' IS NULL THEN
    RAISE EXCEPTION '%', COALESCE(v_res->>'message', CASE v_res->>'status'
      WHEN 'choose_candidate' THEN 'Esistono più copie di questo articolo: scegli quale usare dal Catalogo'
      ELSE 'Articolo non aggiungibile: verifica dal Catalogo' END);
  END IF;

  IF v_location IS NULL THEN v_location := public.ensure_default_inventory_location(_company_id, auth.uid()); END IF;
  INSERT INTO public.inventory_session_products (company_id, session_id, product_id, location_id, product_supplier_link_id)
  VALUES (_company_id, v_session, (v_res->>'product_id')::uuid, v_location, (v_res->>'link_id')::uuid)
  ON CONFLICT ON CONSTRAINT inventory_session_products_card_key DO NOTHING;
  GET DIAGNOSTICS v_added = ROW_COUNT;
  RETURN v_res || jsonb_build_object('session_id', v_session, 'added', v_added, 'location_id', v_location);
END; $$;

CREATE OR REPLACE FUNCTION public.start_full_general_inventory(_company_id uuid, _archive_id uuid DEFAULT NULL, _name text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_default uuid; v_added int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF NOT public.is_company_admin(_company_id) THEN RAISE EXCEPTION 'Solo un amministratore può avviare un inventario'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('general_inventory:' || _company_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.inventory_sessions WHERE company_id = _company_id AND scope = 'generale' AND status = 'in_corso') THEN
    RAISE EXCEPTION 'Inventario già in corso: «Inventario completo» si sceglie solo all''avvio';
  END IF;
  v_id := public.start_general_inventory(_company_id, _archive_id, _name, auth.uid());
  v_default := public.ensure_default_inventory_location(_company_id, auth.uid());

  WITH own_products AS (
    SELECT p.id FROM public.products p
    WHERE p.company_id = _company_id AND p.publish_status = 'pubblicato' AND p.is_managed
  ), active_locations AS (
    SELECT l.id FROM public.inventory_locations l WHERE l.company_id = _company_id AND l.status = 'attivo'
  ), presence AS (
    SELECT c.product_id, c.location_id FROM public.inventory_counts c
    JOIN public.inventory_sessions s ON s.id = c.session_id
    WHERE c.company_id = _company_id AND s.status = 'completata'
    UNION SELECT a.product_id, a.location_id FROM public.inventory_adjustments a WHERE a.company_id = _company_id
    UNION SELECT m.product_id, m.location_id FROM public.inventory_movements m WHERE m.company_id = _company_id
    UNION SELECT sl.product_id, sl.location_id FROM public.stock_lots sl WHERE sl.company_id = _company_id
  ), known AS (
    SELECT DISTINCT pr.product_id, pr.location_id FROM presence pr
    JOIN own_products ap ON ap.id = pr.product_id
    JOIN active_locations al ON al.id = pr.location_id
  ), places AS (
    SELECT product_id, location_id FROM known
    UNION
    SELECT ap.id, v_default FROM own_products ap WHERE NOT EXISTS (SELECT 1 FROM known k WHERE k.product_id = ap.id)
  ), cards AS (
    SELECT pl.product_id, pl.location_id, l.id AS link_id
    FROM places pl JOIN public.product_supplier_links l
      ON l.company_id = _company_id AND l.product_id = pl.product_id AND l.is_active
    UNION ALL
    SELECT pl.product_id, pl.location_id, NULL::uuid FROM places pl
    WHERE NOT EXISTS (SELECT 1 FROM public.product_supplier_links l
                      WHERE l.company_id = _company_id AND l.product_id = pl.product_id AND l.is_active)
  )
  INSERT INTO public.inventory_session_products (company_id, session_id, product_id, location_id, product_supplier_link_id)
  SELECT _company_id, v_id, c.product_id, c.location_id, c.link_id FROM cards c
  ON CONFLICT ON CONSTRAINT inventory_session_products_card_key DO NOTHING;
  GET DIAGNOSTICS v_added = ROW_COUNT;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, auth.uid(), 'inventory_session_full', 'inventory_session', v_id, jsonb_build_object('extra_cards', v_added));
  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.add_card_to_open_inventory(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_catalog_item_to_open_inventory(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_full_general_inventory(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_card_to_open_inventory(uuid, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_catalog_item_to_open_inventory(uuid, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_full_general_inventory(uuid, uuid, text) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public._link_active_list_usage(_company_id uuid, _link_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  SELECT jsonb_agg(x ORDER BY x->>'created_at')
    FROM (
      SELECT DISTINCT jsonb_build_object(
               'list_id', s.id, 'name', s.name, 'number', s.number,
               'created_at', s.created_at, 'status', s.status) AS x
        FROM public.shopping_list_item_suppliers a
        JOIN public.shopping_list_items i ON i.id = a.item_id AND i.company_id = _company_id
        JOIN public.shopping_lists s ON s.id = i.list_id AND s.company_id = _company_id
       WHERE a.product_supplier_link_id = _link_id
         AND a.company_id = _company_id
         AND s.status IN ('aperta', 'confermata')
    ) q;
$function$;
REVOKE ALL ON FUNCTION public._link_active_list_usage(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._link_active_list_usage(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public._unit_offered_by_other_links(_company_id uuid, _item_id uuid, _excluded_link_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
-- Confronto per CODICE normalizzato: le U.M. B2B sono del venditore (UUID diversi dall'acquirente).
DECLARE
  v_item record; v_code text; v_stock_code text; v_row_code text; v_link record; v_src record;
BEGIN
  SELECT i.id, i.product_id, i.unit_id, i.unit_code, i.decided_unit_id, i.decided_unit_code
    INTO v_item FROM public.shopping_list_items i
   WHERE i.id = _item_id AND i.company_id = _company_id;
  IF v_item.id IS NULL THEN RETURN true; END IF;
  v_code := upper(btrim(regexp_replace(COALESCE(NULLIF(btrim(v_item.decided_unit_code), ''),
              (SELECT u.code FROM public.units_of_measure u WHERE u.id = v_item.decided_unit_id), ''), '\s+', ' ', 'g')));
  IF v_code = '' THEN RETURN true; END IF;
  SELECT upper(btrim(regexp_replace(COALESCE(u.code, ''), '\s+', ' ', 'g'))) INTO v_stock_code
    FROM public.units_of_measure u WHERE u.id = public.shopping_item_stock_unit_id(_item_id);
  v_row_code := upper(btrim(regexp_replace(COALESCE(NULLIF(btrim(v_item.unit_code), ''),
              (SELECT u.code FROM public.units_of_measure u WHERE u.id = v_item.unit_id), ''), '\s+', ' ', 'g')));
  IF v_code = COALESCE(v_stock_code, '') OR v_code = v_row_code THEN RETURN true; END IF;
  FOR v_link IN
    SELECT l.id FROM public.product_supplier_links l
     WHERE l.company_id = _company_id AND l.product_id = v_item.product_id
       AND l.is_active AND l.id <> _excluded_link_id
  LOOP
    SELECT * INTO v_src FROM public.shopping_link_b2b_source(_company_id, v_link.id);
    IF COALESCE(v_src.is_b2b, false) THEN
      IF EXISTS (SELECT 1 FROM public.product_sale_units su JOIN public.units_of_measure um ON um.id = su.unit_id
                  WHERE v_src.source_product_id IS NOT NULL AND su.product_id = v_src.source_product_id
                    AND su.is_active AND su.is_customer_visible
                    AND upper(btrim(regexp_replace(um.code, '\s+', ' ', 'g'))) = v_code) THEN
        RETURN true;
      END IF;
    ELSE
      IF EXISTS (SELECT 1 FROM public.product_supplier_link_units lu JOIN public.units_of_measure um ON um.id = lu.unit_id
                  WHERE lu.link_id = v_link.id AND lu.is_active
                    AND upper(btrim(regexp_replace(um.code, '\s+', ' ', 'g'))) = v_code) THEN
        RETURN true;
      END IF;
    END IF;
  END LOOP;
  RETURN false;
END;
$function$;
REVOKE ALL ON FUNCTION public._unit_offered_by_other_links(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._unit_offered_by_other_links(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.unlink_supplier_preview(_company_id uuid, _link_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_link record; v_blocked jsonb; v_warning jsonb; v_units jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;
  SELECT l.id, l.product_id, l.is_active INTO v_link
    FROM public.product_supplier_links l WHERE l.id = _link_id AND l.company_id = _company_id;
  IF v_link.id IS NULL THEN RAISE EXCEPTION 'Collegamento non trovato'; END IF;
  v_blocked := public._link_active_list_usage(_company_id, _link_id);
  SELECT jsonb_agg(DISTINCT jsonb_build_object('list_id', s.id, 'name', s.name, 'number', s.number,
                                               'created_at', s.created_at))
    INTO v_warning
    FROM public.shopping_list_items i
    JOIN public.shopping_lists s ON s.id = i.list_id AND s.company_id = _company_id
   WHERE i.company_id = _company_id AND i.product_id = v_link.product_id AND s.status = 'aperta'
     AND NOT EXISTS (SELECT 1 FROM public.shopping_list_item_suppliers a
                      WHERE a.item_id = i.id AND a.product_supplier_link_id = _link_id);
  SELECT jsonb_agg(jsonb_build_object('list_id', s.id, 'list_name', s.name, 'list_number', s.number,
                                      'item_id', i.id, 'product_id', i.product_id, 'product_name', p.description,
                                      'unit_code', COALESCE(i.decided_unit_code, um.code)))
    INTO v_units
    FROM public.shopping_list_items i
    JOIN public.shopping_lists s ON s.id = i.list_id AND s.company_id = _company_id
    JOIN public.products p ON p.id = i.product_id
    LEFT JOIN public.units_of_measure um ON um.id = i.decided_unit_id
   WHERE i.company_id = _company_id AND i.product_id = v_link.product_id AND s.status = 'aperta'
     AND (i.decided_unit_id IS NOT NULL OR NULLIF(btrim(COALESCE(i.decided_unit_code, '')), '') IS NOT NULL)
     AND NOT public._unit_offered_by_other_links(_company_id, i.id, _link_id);
  RETURN jsonb_build_object('link_id', _link_id, 'is_active', v_link.is_active,
    'blocked_lists', COALESCE(v_blocked, '[]'::jsonb),
    'warning_lists', COALESCE(v_warning, '[]'::jsonb),
    'unit_warnings', COALESCE(v_units, '[]'::jsonb));
END;
$function$;
REVOKE ALL ON FUNCTION public.unlink_supplier_preview(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlink_supplier_preview(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.unlink_b2b_catalog_item(_company_id uuid, _link_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_link record; v_lists jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;
  SELECT l.id, l.product_id, l.is_active, l.is_preferred, l.b2b_item_id, l.supplier_company_id
    INTO v_link FROM public.product_supplier_links l
   WHERE l.id = _link_id AND l.company_id = _company_id
   FOR NO KEY UPDATE;
  IF v_link.id IS NULL THEN RAISE EXCEPTION 'Collegamento non trovato'; END IF;
  IF v_link.b2b_item_id IS NULL THEN
    RAISE EXCEPTION 'Questo collegamento non riguarda un articolo B2B: usa la gestione fornitori del prodotto';
  END IF;
  IF NOT v_link.is_active THEN
    RETURN jsonb_build_object('status', 'already_unlinked', 'link_id', _link_id);
  END IF;
  v_lists := public._link_active_list_usage(_company_id, _link_id);
  IF v_lists IS NOT NULL THEN
    IF v_lists @> '[{"status":"confermata"}]'::jsonb THEN
      RAISE EXCEPTION 'La Lista è confermata: il fornitore potrà essere scollegato dopo la chiusura della Lista'
        USING DETAIL = v_lists::text, ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'Togli prima il fornitore da questa Lista'
      USING DETAIL = v_lists::text, ERRCODE = 'P0001';
  END IF;
  UPDATE public.product_supplier_links SET is_active = false, is_preferred = false WHERE id = _link_id;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, auth.uid(), 'product_supplier_link.b2b_unlink', 'product_supplier_link', _link_id,
          jsonb_build_object('product_id', v_link.product_id, 'b2b_item_id', v_link.b2b_item_id,
                             'supplier_company_id', v_link.supplier_company_id,
                             'was_preferred', v_link.is_preferred));
  RETURN jsonb_build_object('status', 'unlinked', 'link_id', _link_id, 'product_id', v_link.product_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.unlink_b2b_catalog_item(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlink_b2b_catalog_item(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.unlink_product_supplier(_company_id uuid, _link_id uuid, _item_id uuid DEFAULT NULL::uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_link record; v_lists jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF NOT public.is_company_admin(_company_id) THEN RAISE EXCEPTION 'Permessi insufficienti'; END IF;
  SELECT id, product_id, supplier_record_id, is_preferred INTO v_link
    FROM public.product_supplier_links
   WHERE id = _link_id AND company_id = _company_id
   FOR NO KEY UPDATE;
  IF v_link.id IS NULL THEN RAISE EXCEPTION 'Fornitore non associato a questo prodotto'; END IF;
  IF _item_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.shopping_list_items i
                    WHERE i.id = _item_id AND i.company_id = _company_id AND i.product_id = v_link.product_id) THEN
      RAISE EXCEPTION 'Riga della Lista non valida per questo prodotto';
    END IF;
  END IF;
  v_lists := public._link_active_list_usage(_company_id, _link_id);
  IF v_lists IS NOT NULL THEN
    IF v_lists @> '[{"status":"confermata"}]'::jsonb THEN
      RAISE EXCEPTION 'La Lista è confermata: il fornitore potrà essere scollegato dopo la chiusura della Lista'
        USING DETAIL = v_lists::text, ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'Togli prima il fornitore da questa Lista'
      USING DETAIL = v_lists::text, ERRCODE = 'P0001';
  END IF;
  UPDATE public.product_supplier_links SET is_active = false, is_preferred = false WHERE id = _link_id;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, auth.uid(), 'product_supplier_link.unlink', 'product_supplier_link', _link_id,
          jsonb_build_object('item_id', _item_id, 'removed_assignments', 0, 'was_preferred', v_link.is_preferred));
  RETURN _link_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.manage_product_supplier_link(_company_id uuid, _action text, _link_id uuid DEFAULT NULL::uuid, _product_id uuid DEFAULT NULL::uuid, _supplier_record_id uuid DEFAULT NULL::uuid, _supplier_product_code text DEFAULT NULL::text, _purchase_unit_id uuid DEFAULT NULL::uuid, _conversion_factor numeric DEFAULT NULL::numeric, _conversion_reference_um text DEFAULT NULL::text, _manual_cost numeric DEFAULT NULL::numeric, _min_quantity numeric DEFAULT NULL::numeric, _lead_time_days integer DEFAULT NULL::integer, _notes text DEFAULT NULL::text, _is_preferred boolean DEFAULT NULL::boolean, _supplier_reference_label text DEFAULT NULL::text, _sourcing_priority smallint DEFAULT NULL::smallint, _price_unit_id uuid DEFAULT NULL::uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid; v_product uuid; v_previous_cost numeric;
  v_code text := NULLIF(btrim(COALESCE(_supplier_product_code, '')), '');
  v_label text := NULLIF(btrim(COALESCE(_supplier_reference_label, '')), '');
  v_sup uuid; v_lists jsonb;
BEGIN
  IF NOT public.is_company_admin(_company_id) THEN RAISE EXCEPTION 'Permessi insufficienti'; END IF;
  IF _price_unit_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.units_of_measure WHERE id = _price_unit_id AND company_id = _company_id) THEN
      RAISE EXCEPTION 'U.M. del prezzo non valida';
    END IF;
    SELECT COALESCE(_supplier_record_id, (SELECT supplier_record_id FROM public.product_supplier_links WHERE id = _link_id)) INTO v_sup;
    IF EXISTS (SELECT 1 FROM public.supplier_customer_relations r
                WHERE r.supplier_record_id = v_sup AND r.buyer_company_id = _company_id AND r.status = 'attivo') THEN
      RAISE EXCEPTION 'Fornitore B2B: la U.M. del prezzo arriva dal catalogo del fornitore';
    END IF;
  END IF;
  IF _action = 'create' THEN
    IF _product_id IS NULL OR _supplier_record_id IS NULL THEN RAISE EXCEPTION 'Prodotto e fornitore obbligatori'; END IF;
    SELECT id INTO v_id FROM public.product_supplier_links
    WHERE company_id = _company_id AND product_id = _product_id AND supplier_record_id = _supplier_record_id
      AND ((v_code IS NOT NULL AND supplier_product_code = v_code)
        OR (v_code IS NULL AND supplier_product_code IS NULL
            AND lower(btrim(COALESCE(supplier_reference_label, ''))) = lower(COALESCE(v_label, ''))))
    LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
    INSERT INTO public.product_supplier_links (
      company_id, product_id, supplier_record_id, supplier_product_code, purchase_unit_id,
      conversion_factor, conversion_reference_um, manual_cost, manual_cost_at, min_quantity,
      lead_time_days, notes, origin, created_by, is_preferred,
      supplier_reference_label, sourcing_priority, price_unit_id
    ) VALUES (
      _company_id, _product_id, _supplier_record_id, v_code, _purchase_unit_id,
      _conversion_factor, NULLIF(btrim(_conversion_reference_um), ''), _manual_cost,
      CASE WHEN _manual_cost IS NULL THEN NULL ELSE now() END, _min_quantity,
      _lead_time_days, NULLIF(btrim(_notes), ''), 'manuale', auth.uid(), false,
      v_label, _sourcing_priority, _price_unit_id
    ) RETURNING id, product_id INTO v_id, v_product;
    INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id)
    VALUES (_company_id, auth.uid(), 'product_supplier_link.create', 'product_supplier_link', v_id);
    RETURN v_id;
  END IF;
  IF _link_id IS NULL THEN RAISE EXCEPTION 'Associazione non indicata'; END IF;
  SELECT product_id, manual_cost INTO v_product, v_previous_cost
  FROM public.product_supplier_links WHERE id = _link_id AND company_id = _company_id;
  IF v_product IS NULL THEN RAISE EXCEPTION 'Associazione non trovata'; END IF;
  IF _action = 'update' THEN
    UPDATE public.product_supplier_links SET
      supplier_product_code = v_code, supplier_reference_label = v_label,
      sourcing_priority = _sourcing_priority, purchase_unit_id = _purchase_unit_id,
      conversion_factor = _conversion_factor,
      conversion_reference_um = NULLIF(btrim(_conversion_reference_um), ''),
      manual_cost = _manual_cost, price_unit_id = _price_unit_id,
      manual_cost_at = CASE WHEN _manual_cost IS NULL THEN NULL
        WHEN v_previous_cost IS DISTINCT FROM _manual_cost THEN now() ELSE manual_cost_at END,
      min_quantity = _min_quantity, lead_time_days = _lead_time_days, notes = NULLIF(btrim(_notes), '')
    WHERE id = _link_id;
  ELSIF _action = 'set_priority' THEN
    UPDATE public.product_supplier_links SET sourcing_priority = _sourcing_priority WHERE id = _link_id;
  ELSIF _action = 'activate' THEN
    UPDATE public.product_supplier_links SET is_active = true WHERE id = _link_id;
  ELSIF _action = 'deactivate' THEN
    PERFORM 1 FROM public.product_supplier_links WHERE id = _link_id AND company_id = _company_id FOR NO KEY UPDATE;
    v_lists := public._link_active_list_usage(_company_id, _link_id);
    IF v_lists IS NOT NULL THEN
      IF v_lists @> '[{"status":"confermata"}]'::jsonb THEN
        RAISE EXCEPTION 'La Lista è confermata: il fornitore potrà essere scollegato dopo la chiusura della Lista'
          USING DETAIL = v_lists::text, ERRCODE = 'P0001';
      END IF;
      RAISE EXCEPTION 'Togli prima il fornitore da questa Lista' USING DETAIL = v_lists::text, ERRCODE = 'P0001';
    END IF;
    UPDATE public.product_supplier_links SET is_active = false WHERE id = _link_id;
  ELSIF _action = 'delete_link' THEN
    DELETE FROM public.product_supplier_links WHERE id = _link_id;
  ELSE
    RAISE EXCEPTION 'Azione non valida: %', _action;
  END IF;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id)
  VALUES (_company_id, auth.uid(), 'product_supplier_link.' || _action, 'product_supplier_link', _link_id);
  RETURN _link_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_shopping_list_supplier(_company_id uuid, _item_id uuid, _action text, _link_id uuid DEFAULT NULL::uuid, _assigned_quantity numeric DEFAULT NULL::numeric, _purchase_quantity numeric DEFAULT NULL::numeric, _min_warning_accepted boolean DEFAULT false, _notes text DEFAULT NULL::text, _actor_user_id uuid DEFAULT NULL::uuid, _purchase_unit_id uuid DEFAULT NULL::uuid, _assignment_id uuid DEFAULT NULL::uuid, _manual_unit_code text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_item record; v_stock_unit uuid; v_stock_code text; v_link record; v_src record;
  v_unit_id uuid; v_unit_code text; v_factor numeric; v_ctype public.sale_conversion_type;
  v_qty numeric; v_equiv numeric; v_id uuid; v_manual text; v_ref text;
  v_list_status public.shopping_list_status;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT i.id, i.product_id, i.unit_id, i.unit_code INTO v_item FROM public.shopping_list_items i
   WHERE i.id = _item_id AND i.company_id = _company_id;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Riga non trovata'; END IF;
  v_stock_unit := public.shopping_item_stock_unit_id(_item_id);
  v_stock_code := v_item.unit_code;
  IF _action = 'remove' THEN
    SELECT s.status INTO v_list_status FROM public.shopping_lists s
      JOIN public.shopping_list_items i ON i.list_id = s.id
     WHERE i.id = _item_id AND s.company_id = _company_id;
    IF v_list_status = 'confermata' THEN
      RAISE EXCEPTION 'La Lista è confermata: la ripartizione non può più essere tolta';
    END IF;
    IF _assignment_id IS NOT NULL THEN
      DELETE FROM public.shopping_list_item_suppliers WHERE id = _assignment_id AND item_id = _item_id;
    ELSE
      DELETE FROM public.shopping_list_item_suppliers WHERE item_id = _item_id AND product_supplier_link_id = _link_id;
    END IF;
    RETURN _item_id;
  ELSIF _action <> 'set' THEN
    RAISE EXCEPTION 'Azione non valida';
  END IF;
  SELECT l.* INTO v_link FROM public.product_supplier_links l
   WHERE l.id = _link_id AND l.company_id = _company_id AND l.product_id = v_item.product_id
   FOR SHARE OF l;
  IF v_link.id IS NULL THEN RAISE EXCEPTION 'Fornitore non associato a questo prodotto'; END IF;
  IF NOT v_link.is_active THEN RAISE EXCEPTION 'Associazione fornitore non attiva'; END IF;
  v_qty := _purchase_quantity;
  IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'Quantità d''acquisto non valida'; END IF;
  v_manual := NULLIF(upper(regexp_replace(btrim(COALESCE(_manual_unit_code, '')), '\s+', ' ', 'g')), '');
  IF v_manual IS NOT NULL AND length(v_manual) > 20 THEN RAISE EXCEPTION 'U.M. troppo lunga (massimo 20 caratteri)'; END IF;
  IF _purchase_unit_id IS NULL AND v_manual IS NULL THEN
    RAISE EXCEPTION 'U.M. d''acquisto obbligatoria: sceglila esplicitamente';
  END IF;
  IF _purchase_unit_id IS NOT NULL AND v_manual IS NOT NULL THEN
    RAISE EXCEPTION 'Indica una U.M. esistente oppure un''altra U.M., non entrambe';
  END IF;
  SELECT * INTO v_src FROM public.shopping_link_b2b_source(_company_id, v_link.id);
  IF COALESCE(v_src.is_b2b, false) THEN
    IF v_manual IS NOT NULL THEN RAISE EXCEPTION 'Per i fornitori B2B la U.M. la decide il venditore'; END IF;
    IF v_src.source_product_id IS NULL THEN RAISE EXCEPTION 'Prodotto del fornitore non collegato: U.M. non disponibili'; END IF;
    SELECT um.code, su.conversion_factor, su.conversion_type, su.conversion_reference_um
      INTO v_unit_code, v_factor, v_ctype, v_ref
      FROM public.product_sale_units su JOIN public.units_of_measure um ON um.id = su.unit_id
     WHERE su.product_id = v_src.source_product_id AND su.unit_id = _purchase_unit_id
       AND su.is_active AND su.is_customer_visible;
    IF NOT FOUND THEN RAISE EXCEPTION 'U.M. non pubblicata dal venditore'; END IF;
    v_unit_id := _purchase_unit_id;
    IF lower(btrim(v_unit_code)) = lower(btrim(COALESCE(v_stock_code, ''))) THEN
      v_factor := 1; v_ctype := 'esatta';
    ELSIF v_factor IS NULL OR v_factor <= 0 OR lower(btrim(COALESCE(v_ref, ''))) <> lower(btrim(COALESCE(v_stock_code, '#'))) THEN
      v_factor := NULL; v_ctype := NULL;
    END IF;
  ELSIF v_manual IS NOT NULL THEN
    v_unit_id := NULL; v_unit_code := v_manual; v_factor := NULL; v_ctype := NULL;
  ELSIF _purchase_unit_id = v_stock_unit THEN
    v_unit_id := v_stock_unit;
    SELECT code INTO v_unit_code FROM public.units_of_measure WHERE id = v_unit_id;
    v_factor := 1; v_ctype := 'esatta';
  ELSE
    SELECT um.code, lu.conversion_factor, lu.conversion_type INTO v_unit_code, v_factor, v_ctype
      FROM public.product_supplier_link_units lu JOIN public.units_of_measure um ON um.id = lu.unit_id
     WHERE lu.link_id = v_link.id AND lu.unit_id = _purchase_unit_id AND lu.is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'U.M. di acquisto non abilitata per questa referenza'; END IF;
    v_unit_id := _purchase_unit_id;
    IF v_factor IS NULL OR v_factor <= 0 THEN v_factor := NULL; v_ctype := NULL; END IF;
  END IF;
  v_equiv := CASE WHEN v_factor IS NOT NULL THEN round(v_qty * v_factor, 3) END;
  IF _assignment_id IS NOT NULL THEN
    SELECT id INTO v_id FROM public.shopping_list_item_suppliers WHERE id = _assignment_id AND item_id = _item_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Ripartizione non trovata'; END IF;
  ELSIF v_unit_id IS NOT NULL THEN
    SELECT id INTO v_id FROM public.shopping_list_item_suppliers
     WHERE item_id = _item_id AND product_supplier_link_id = v_link.id AND purchase_unit_id = v_unit_id;
  ELSE
    SELECT id INTO v_id FROM public.shopping_list_item_suppliers
     WHERE item_id = _item_id AND product_supplier_link_id = v_link.id AND purchase_unit_id IS NULL
       AND upper(btrim(purchase_unit_code)) = v_unit_code;
  END IF;
  IF v_id IS NOT NULL THEN
    UPDATE public.shopping_list_item_suppliers
       SET product_supplier_link_id = v_link.id, supplier_record_id = v_link.supplier_record_id,
           assigned_quantity = v_equiv, purchase_quantity = v_qty, purchase_unit_id = v_unit_id,
           purchase_unit_code = v_unit_code, conversion_factor = v_factor, conversion_type = v_ctype,
           min_warning_accepted = COALESCE(_min_warning_accepted, false),
           min_warning_accepted_by = CASE WHEN _min_warning_accepted THEN _actor_user_id END,
           min_warning_accepted_at = CASE WHEN _min_warning_accepted THEN now() END,
           notes = _notes
     WHERE id = v_id;
  ELSE
    INSERT INTO public.shopping_list_item_suppliers (
      company_id, item_id, product_supplier_link_id, supplier_record_id,
      assigned_quantity, purchase_quantity, purchase_unit_id, purchase_unit_code, conversion_factor, conversion_type,
      min_warning_accepted, min_warning_accepted_by, min_warning_accepted_at, notes, created_by)
    VALUES (_company_id, _item_id, v_link.id, v_link.supplier_record_id,
      v_equiv, v_qty, v_unit_id, v_unit_code, v_factor, v_ctype,
      COALESCE(_min_warning_accepted, false),
      CASE WHEN _min_warning_accepted THEN _actor_user_id END,
      CASE WHEN _min_warning_accepted THEN now() END,
      _notes, _actor_user_id)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $function$;
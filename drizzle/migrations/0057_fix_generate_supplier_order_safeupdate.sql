CREATE OR REPLACE FUNCTION public.generate_supplier_order(_list_id uuid, _supplier_record_id uuid, _generation_key uuid, _delivery jsonb DEFAULT '{}'::jsonb, _assignment_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_list public.shopping_lists%ROWTYPE; v_ex public.purchase_orders%ROWTYPE;
  v_bad text; v_bad_sup text; v_loc uuid; v_order uuid; v_addr uuid; v_lines int; v_number text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _generation_key IS NULL THEN RAISE EXCEPTION 'Chiave di generazione mancante'; END IF;
  SELECT * INTO v_list FROM public.shopping_lists WHERE id = _list_id FOR UPDATE;
  IF v_list.id IS NULL OR NOT public.is_company_member(v_list.company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_ex FROM public.purchase_orders WHERE company_id = v_list.company_id AND generation_key = _generation_key;
  IF v_ex.id IS NOT NULL THEN
    IF v_ex.shopping_list_id IS DISTINCT FROM _list_id THEN RAISE EXCEPTION 'Chiave di generazione già usata'; END IF;
    RETURN jsonb_build_object('order_id', v_ex.id, 'number', v_ex.number, 'already_exists', true);
  END IF;
  IF v_list.status <> 'aperta' THEN RAISE EXCEPTION 'La lista non è più aperta'; END IF;

  CREATE TEMP TABLE IF NOT EXISTS _gso_cand (assignment_id uuid, residual numeric) ON COMMIT DROP;
  -- Tabella temporanea della sola transazione corrente: WHERE true richiesto dalla protezione safeupdate dell'API.
  DELETE FROM _gso_cand WHERE true;
  INSERT INTO _gso_cand
  SELECT a.id, public._assignment_residual(a.id)
    FROM (SELECT * FROM public.shopping_list_item_suppliers WHERE deselected_at IS NULL) a JOIN public.shopping_list_items i ON i.id = a.item_id
   WHERE i.list_id = _list_id AND a.supplier_record_id = _supplier_record_id
     AND i.excluded_at IS NULL AND i.decided_quantity IS NOT NULL
     AND (_assignment_ids IS NULL OR a.id = ANY(_assignment_ids));
  DELETE FROM _gso_cand WHERE residual IS NULL OR residual <= 0;
  IF NOT EXISTS (SELECT 1 FROM _gso_cand) THEN RAISE EXCEPTION 'Nessuna quantità da ordinare per questo fornitore'; END IF;

  SELECT string_agg(DISTINCT p.description, ', ') INTO v_bad
    FROM _gso_cand c JOIN (SELECT * FROM public.shopping_list_item_suppliers WHERE deselected_at IS NULL) a ON a.id = c.assignment_id
    JOIN public.shopping_list_items i ON i.id = a.item_id JOIN public.products p ON p.id = i.product_id
    JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
   WHERE NOT l.is_active;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Fornitore scollegato dal prodotto: %', v_bad; END IF;
  SELECT string_agg(DISTINCT p.description, ', '), string_agg(DISTINCT COALESCE(sr.legal_name, 'fornitore'), ', ') INTO v_bad, v_bad_sup
    FROM _gso_cand c JOIN (SELECT * FROM public.shopping_list_item_suppliers WHERE deselected_at IS NULL) a ON a.id = c.assignment_id
    JOIN public.shopping_list_items i ON i.id = a.item_id JOIN public.products p ON p.id = i.product_id
    JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
    LEFT JOIN public.supplier_records sr ON sr.id = l.supplier_record_id
   WHERE l.supplier_company_id IS NOT NULL
     AND (l.b2b_item_id IS NULL OR NOT public.b2b_item_purchasable(l.supplier_company_id, v_list.company_id, l.b2b_item_id));
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Il prodotto % non è più disponibile nel Catalogo B2B di %', v_bad, v_bad_sup; END IF;
  SELECT string_agg(DISTINCT p.description, ', ') INTO v_bad
    FROM _gso_cand c JOIN (SELECT * FROM public.shopping_list_item_suppliers WHERE deselected_at IS NULL) a ON a.id = c.assignment_id
    JOIN public.shopping_list_items i ON i.id = a.item_id JOIN public.products p ON p.id = i.product_id
   WHERE a.assigned_quantity IS NULL
     AND (a.coverage_confirmed_at IS NULL OR a.coverage_quantity IS DISTINCT FROM a.purchase_quantity);
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Conferma la copertura: manca la conversione U.M. per %', v_bad; END IF;
  v_addr := COALESCE(NULLIF(_delivery->>'address_id', '')::uuid, v_list.delivery_address_id);
  IF v_addr IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.addresses WHERE id = v_addr AND company_id = v_list.company_id) THEN
    RAISE EXCEPTION 'Indirizzo di consegna non valido';
  END IF;

  v_loc := public.ensure_default_inventory_location(v_list.company_id, v_uid);
  v_number := public.next_document_number(v_list.company_id, 'ORD');
  INSERT INTO public.purchase_orders (company_id, archive_id, supplier_record_id, shopping_list_id, destination_location_id,
    destination_address_id, number, created_by, relation_id, status, send_status, generation_key,
    delivery_date, delivery_time_from, delivery_time_to, delivery_address_text, supplier_notes)
  VALUES (v_list.company_id, v_list.archive_id, _supplier_record_id, _list_id, v_loc, v_addr, v_number, v_uid,
    (SELECT r.id FROM public.supplier_customer_relations r
      WHERE r.supplier_record_id = _supplier_record_id AND r.buyer_company_id = v_list.company_id AND r.status = 'attivo' LIMIT 1),
    'bozza', 'da_inviare', _generation_key,
    COALESCE(NULLIF(_delivery->>'date', '')::date, v_list.delivery_date),
    COALESCE(NULLIF(_delivery->>'time_from', '')::time, v_list.delivery_time_from),
    COALESCE(NULLIF(_delivery->>'time_to', '')::time, v_list.delivery_time_to),
    COALESCE(NULLIF(btrim(COALESCE(_delivery->>'address_text', '')), ''), v_list.delivery_address_text),
    NULLIF(btrim(COALESCE(_delivery->>'notes', '')), ''))
  RETURNING id INTO v_order;

  INSERT INTO public.purchase_order_items (order_id, company_id, product_id, product_supplier_link_id,
    ordered_quantity, unit_id, unit_code, purchase_quantity, purchase_unit_id, purchase_unit_code,
    conversion_factor, conversion_mode, stock_unit_id, package_id, unit_cost, supplier_product_code, source_assignment_id,
    price_unit_id, price_unit_code, product_name, product_code)
  SELECT v_order, v_list.company_id, i.product_id, a.product_supplier_link_id,
         CASE WHEN a.assigned_quantity IS NOT NULL THEN round(a.assigned_quantity * c.residual / a.purchase_quantity, 3) END,
         i.unit_id, i.unit_code, c.residual, a.purchase_unit_id, a.purchase_unit_code,
         a.conversion_factor, a.conversion_mode, a.stock_unit_id, a.package_id, x.cost, l.supplier_product_code, a.id,
         x.unit_id, x.unit_code, bp.description, bp.code
    FROM _gso_cand c
    JOIN (SELECT * FROM public.shopping_list_item_suppliers WHERE deselected_at IS NULL) a ON a.id = c.assignment_id
    JOIN public.shopping_list_items i ON i.id = a.item_id
    JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
    LEFT JOIN public.products bp ON bp.id = i.product_id
    LEFT JOIN public.products sp ON sp.id = l.b2b_item_id AND sp.company_id = l.supplier_company_id
    LEFT JOIN public.units_of_measure su ON su.id = sp.price_unit_id
    CROSS JOIN LATERAL (SELECT
      CASE WHEN l.supplier_company_id IS NULL THEN l.manual_cost
           WHEN sp.id IS NULL THEN NULL
           ELSE (SELECT b.net_price FROM public.applicable_b2b_price(l.supplier_company_id, v_list.company_id, sp.id) b LIMIT 1) END AS cost,
      CASE WHEN l.supplier_company_id IS NULL THEN l.price_unit_id END AS unit_id,
      CASE WHEN l.supplier_company_id IS NULL OR sp.id IS NULL THEN NULL
           ELSE NULLIF(btrim(COALESCE(su.code, sp.danea_um, '')), '') END AS unit_code) x;
  GET DIAGNOSTICS v_lines = ROW_COUNT;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_list.company_id, v_uid, 'purchase_order.generated_from_list', 'purchase_order', v_order,
          jsonb_build_object('list_id', _list_id, 'supplier_record_id', _supplier_record_id, 'lines', v_lines, 'generation_key', _generation_key));
  RETURN jsonb_build_object('order_id', v_order, 'number', v_number, 'already_exists', false, 'lines', v_lines);
END $function$;
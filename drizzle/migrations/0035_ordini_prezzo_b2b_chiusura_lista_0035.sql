CREATE OR REPLACE FUNCTION public.close_shopping_list(_company_id uuid, _list_id uuid, _delivery jsonb DEFAULT '{}'::jsonb, _general_notes text DEFAULT NULL::text, _supplier_overrides jsonb DEFAULT '[]'::jsonb, _direct_notes jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_list public.shopping_lists; v_uid uuid := auth.uid(); v_bad text; v_number text;
  v_loc uuid; v_sup record; v_ov jsonb; v_order uuid; v_ids jsonb := '[]'::jsonb;
  v_date date; v_from time; v_to time; v_addr_id uuid; v_addr_text text;
  v_prices jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_list FROM public.shopping_lists WHERE id = _list_id AND company_id = _company_id FOR UPDATE;
  IF v_list.id IS NULL THEN RAISE EXCEPTION 'Lista non trovata'; END IF;

  IF v_list.status = 'chiusa' AND v_list.number IS NOT NULL THEN
    RETURN jsonb_build_object('list_id', v_list.id, 'number', v_list.number, 'already_closed', true,
      'order_ids', COALESCE((SELECT jsonb_agg(id) FROM public.purchase_orders WHERE shopping_list_id = _list_id), '[]'));
  END IF;
  IF v_list.status <> 'aperta' THEN RAISE EXCEPTION 'La lista non è più aperta'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shopping_list_items WHERE list_id = _list_id) THEN RAISE EXCEPTION 'La lista è vuota'; END IF;

  SELECT string_agg(product_name, ', ' ORDER BY product_name) INTO v_bad
    FROM public._shopping_list_close_plan(_list_id) WHERE kind = 'missing';
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Manca la quantità da acquistare per: %', v_bad; END IF;
  SELECT string_agg(product_name, ', ' ORDER BY product_name) INTO v_bad
    FROM public._shopping_list_close_plan(_list_id) WHERE kind IN ('unassigned','partial','uncertain');
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Righe da assegnare, parziali o da verificare: %', v_bad; END IF;

  v_date := NULLIF(_delivery->>'date', '')::date;
  v_from := NULLIF(_delivery->>'time_from', '')::time;
  v_to := NULLIF(_delivery->>'time_to', '')::time;
  v_addr_id := NULLIF(_delivery->>'address_id', '')::uuid;
  v_addr_text := NULLIF(btrim(COALESCE(_delivery->>'address_text', '')), '');
  IF v_addr_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.addresses WHERE id = v_addr_id AND company_id = _company_id) THEN
    RAISE EXCEPTION 'Indirizzo di consegna non valido';
  END IF;

  PERFORM 1 FROM public.product_supplier_links l
   WHERE l.id IN (SELECT a.product_supplier_link_id FROM public.shopping_list_item_suppliers a
                    JOIN public.shopping_list_items i ON i.id = a.item_id
                   WHERE i.list_id = _list_id)
   ORDER BY l.id
   FOR SHARE;
  SELECT string_agg(DISTINCT p.description, ', ') INTO v_bad
    FROM public.shopping_list_item_suppliers a
    JOIN public.shopping_list_items i ON i.id = a.item_id
    JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
    JOIN public.products p ON p.id = i.product_id
   WHERE i.list_id = _list_id AND NOT l.is_active;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Fornitore scollegato dal prodotto: togli la ripartizione prima di generare gli ordini (%)', v_bad;
  END IF;
  SELECT COALESCE(jsonb_object_agg(a.id::text, jsonb_build_object(
           'cost', x.cost, 'unit_id', x.unit_id, 'unit_code', x.unit_code)), '{}'::jsonb)
    INTO v_prices
    FROM public.shopping_list_item_suppliers a
    JOIN public.shopping_list_items i ON i.id = a.item_id
    JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
    LEFT JOIN public.products sp ON sp.id = l.b2b_item_id AND sp.company_id = l.supplier_company_id
    LEFT JOIN public.units_of_measure su ON su.id = sp.price_unit_id
    CROSS JOIN LATERAL (SELECT
      CASE WHEN l.supplier_company_id IS NULL THEN l.manual_cost
           WHEN sp.id IS NULL THEN NULL
           ELSE (SELECT b.net_price FROM public.applicable_b2b_price(l.supplier_company_id, _company_id, sp.id) b LIMIT 1)
      END AS cost,
      CASE WHEN l.supplier_company_id IS NULL THEN l.price_unit_id END AS unit_id,
      CASE WHEN l.supplier_company_id IS NULL OR sp.id IS NULL THEN NULL
           ELSE NULLIF(btrim(COALESCE(su.code, sp.danea_um, '')), '')
      END AS unit_code) x
   WHERE i.list_id = _list_id;

  v_number := public.next_document_number(_company_id, 'LS');
  UPDATE public.shopping_lists
     SET number = v_number, delivery_date = v_date, delivery_time_from = v_from, delivery_time_to = v_to,
         delivery_address_id = v_addr_id, delivery_address_text = v_addr_text,
         general_notes = NULLIF(btrim(COALESCE(_general_notes, '')), ''),
         status = 'confermata', confirmed_at = now(), confirmed_by = v_uid
   WHERE id = _list_id;

  INSERT INTO public.shopping_list_direct_purchases (company_id, list_id, item_id, product_id, product_name, product_code,
      quantity, unit_id, unit_code, origin, reason, notes, created_by)
  SELECT _company_id, _list_id, p.item_id, p.product_id, p.product_name, p.product_code,
         p.quantity, p.unit_id, p.unit_code, 'esplicito', NULL,
         (SELECT NULLIF(btrim(n->>'notes'), '') FROM jsonb_array_elements(COALESCE(_direct_notes, '[]')) n
           WHERE n->>'item_id' = p.item_id::text LIMIT 1),
         v_uid
    FROM public._shopping_list_close_plan(_list_id) p
   WHERE p.kind = 'direct';

  IF EXISTS (SELECT 1 FROM public.shopping_list_item_suppliers a JOIN public.shopping_list_items i ON i.id = a.item_id
              WHERE i.list_id = _list_id) THEN
    v_loc := public.ensure_default_inventory_location(_company_id, v_uid);
  END IF;

  FOR v_sup IN
    SELECT a.supplier_record_id FROM public.shopping_list_item_suppliers a
      JOIN public.shopping_list_items i ON i.id = a.item_id
     WHERE i.list_id = _list_id
     GROUP BY a.supplier_record_id
  LOOP
    SELECT o INTO v_ov FROM jsonb_array_elements(COALESCE(_supplier_overrides, '[]')) o
     WHERE o->>'supplier_record_id' = v_sup.supplier_record_id::text LIMIT 1;

    INSERT INTO public.purchase_orders (company_id, archive_id, supplier_record_id, shopping_list_id,
      destination_location_id, destination_address_id, number, created_by, relation_id, send_status,
      delivery_date, delivery_time_from, delivery_time_to, delivery_address_text, supplier_notes)
    VALUES (_company_id, v_list.archive_id, v_sup.supplier_record_id, _list_id, v_loc,
      CASE WHEN NULLIF(btrim(COALESCE(v_ov->>'address_text', '')), '') IS NULL THEN v_addr_id END,
      public.next_document_number(_company_id, 'ORD'), v_uid,
      (SELECT r.id FROM public.supplier_customer_relations r
        WHERE r.supplier_record_id = v_sup.supplier_record_id AND r.buyer_company_id = _company_id
          AND r.status = 'attivo' LIMIT 1),
      'da_inviare',
      COALESCE(NULLIF(v_ov->>'date', '')::date, v_date),
      COALESCE(NULLIF(v_ov->>'time_from', '')::time, v_from),
      COALESCE(NULLIF(v_ov->>'time_to', '')::time, v_to),
      COALESCE(NULLIF(btrim(COALESCE(v_ov->>'address_text', '')), ''), v_addr_text),
      NULLIF(btrim(COALESCE(v_ov->>'notes', '')), ''))
    RETURNING id INTO v_order;

    INSERT INTO public.purchase_order_items (order_id, company_id, product_id, product_supplier_link_id,
      ordered_quantity, unit_id, unit_code, purchase_quantity, purchase_unit_id, purchase_unit_code,
      conversion_factor, unit_cost, supplier_product_code, source_assignment_id, price_unit_id, price_unit_code,
      product_name, product_code)
    SELECT v_order, _company_id, i.product_id, a.product_supplier_link_id,
           a.assigned_quantity, i.unit_id, i.unit_code,
           a.purchase_quantity, a.purchase_unit_id, a.purchase_unit_code,
           a.conversion_factor,
           (v_prices -> a.id::text ->> 'cost')::numeric,
           l.supplier_product_code, a.id,
           (v_prices -> a.id::text ->> 'unit_id')::uuid,
           v_prices -> a.id::text ->> 'unit_code',
           bp.description, bp.code
      FROM public.shopping_list_item_suppliers a
      JOIN public.shopping_list_items i ON i.id = a.item_id
      JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
      JOIN public.purchase_orders o ON o.id = v_order
      LEFT JOIN public.products bp ON bp.id = i.product_id
     WHERE i.list_id = _list_id AND a.supplier_record_id = v_sup.supplier_record_id;

    v_ids := v_ids || to_jsonb(v_order);
    INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
    VALUES (_company_id, v_uid, 'purchase_order.created_from_list', 'purchase_order', v_order,
            jsonb_build_object('list_id', _list_id, 'list_number', v_number));
  END LOOP;

  UPDATE public.shopping_lists SET status = 'chiusa', closed_at = now() WHERE id = _list_id;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, v_uid, 'shopping_list.closed', 'shopping_list', _list_id,
          jsonb_build_object('number', v_number, 'orders', jsonb_array_length(v_ids)));

  RETURN jsonb_build_object('list_id', _list_id, 'number', v_number, 'already_closed', false, 'order_ids', v_ids);
END; $function$;

CREATE OR REPLACE FUNCTION public.create_purchase_orders_from_list(_company_id uuid, _list_id uuid, _destination_location_id uuid DEFAULT NULL::uuid, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_list public.shopping_lists;
  v_loc uuid;
  v_sup record;
  v_order uuid;
  v_ids jsonb := '[]'::jsonb;
  v_bad text;
  v_prices jsonb;
  v_number text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_list FROM public.shopping_lists WHERE id = _list_id AND company_id = _company_id FOR UPDATE;
  IF v_list.id IS NULL THEN RAISE EXCEPTION 'Lista non trovata'; END IF;
  IF v_list.status <> 'confermata' THEN RAISE EXCEPTION 'La lista deve essere confermata prima di generare gli ordini'; END IF;
  IF EXISTS (SELECT 1 FROM public.purchase_orders WHERE shopping_list_id = _list_id) THEN
    RAISE EXCEPTION 'Ordini già generati per questa lista';
  END IF;

  SELECT string_agg(product_name, ', ' ORDER BY product_name) INTO v_bad
    FROM public._shopping_list_close_plan(_list_id) WHERE kind = 'missing';
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Manca la quantità da acquistare per: %', v_bad; END IF;
  SELECT string_agg(product_name, ', ' ORDER BY product_name) INTO v_bad
    FROM public._shopping_list_close_plan(_list_id) WHERE kind IN ('unassigned','partial','uncertain');
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Righe da assegnare, parziali o da verificare: %', v_bad; END IF;

  PERFORM 1 FROM public.product_supplier_links l
   WHERE l.id IN (SELECT a.product_supplier_link_id FROM public.shopping_list_item_suppliers a
                    JOIN public.shopping_list_items i ON i.id = a.item_id
                   WHERE i.list_id = _list_id)
   ORDER BY l.id
   FOR SHARE;
  SELECT string_agg(DISTINCT p.description, ', ') INTO v_bad
    FROM public.shopping_list_item_suppliers a
    JOIN public.shopping_list_items i ON i.id = a.item_id
    JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
    JOIN public.products p ON p.id = i.product_id
   WHERE i.list_id = _list_id AND NOT l.is_active;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Fornitore scollegato dal prodotto: togli la ripartizione prima di generare gli ordini (%)', v_bad;
  END IF;
  SELECT COALESCE(jsonb_object_agg(a.id::text, jsonb_build_object(
           'cost', x.cost, 'unit_id', x.unit_id, 'unit_code', x.unit_code)), '{}'::jsonb)
    INTO v_prices
    FROM public.shopping_list_item_suppliers a
    JOIN public.shopping_list_items i ON i.id = a.item_id
    JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
    LEFT JOIN public.products sp ON sp.id = l.b2b_item_id AND sp.company_id = l.supplier_company_id
    LEFT JOIN public.units_of_measure su ON su.id = sp.price_unit_id
    CROSS JOIN LATERAL (SELECT
      CASE WHEN l.supplier_company_id IS NULL THEN l.manual_cost
           WHEN sp.id IS NULL THEN NULL
           ELSE (SELECT b.net_price FROM public.applicable_b2b_price(l.supplier_company_id, _company_id, sp.id) b LIMIT 1)
      END AS cost,
      CASE WHEN l.supplier_company_id IS NULL THEN l.price_unit_id END AS unit_id,
      CASE WHEN l.supplier_company_id IS NULL OR sp.id IS NULL THEN NULL
           ELSE NULLIF(btrim(COALESCE(su.code, sp.danea_um, '')), '')
      END AS unit_code) x
   WHERE i.list_id = _list_id;

  IF NOT EXISTS (SELECT 1 FROM public.shopping_list_item_suppliers a
                   JOIN public.shopping_list_items i ON i.id = a.item_id
                  WHERE i.list_id = _list_id)
     AND NOT EXISTS (SELECT 1 FROM public._shopping_list_close_plan(_list_id) p WHERE p.kind = 'direct') THEN
    RAISE EXCEPTION 'Nessuna assegnazione fornitore né acquisto diretto nella lista';
  END IF;

  v_loc := COALESCE(_destination_location_id, public.ensure_default_inventory_location(_company_id, _actor_user_id));
  IF NOT EXISTS (SELECT 1 FROM public.inventory_locations WHERE id = v_loc AND company_id = _company_id) THEN
    RAISE EXCEPTION 'Destinazione di ricezione non valida';
  END IF;

  FOR v_sup IN
    SELECT a.supplier_record_id
      FROM public.shopping_list_item_suppliers a
      JOIN public.shopping_list_items i ON i.id = a.item_id
     WHERE i.list_id = _list_id
     GROUP BY a.supplier_record_id
  LOOP
    INSERT INTO public.purchase_orders (company_id, archive_id, supplier_record_id, shopping_list_id,
      destination_location_id, number, created_by, relation_id)
    VALUES (_company_id, v_list.archive_id, v_sup.supplier_record_id, _list_id, v_loc,
      public.next_document_number(_company_id, 'ORD'), _actor_user_id,
      (SELECT r.id FROM public.supplier_customer_relations r
        WHERE r.supplier_record_id = v_sup.supplier_record_id AND r.buyer_company_id = _company_id
          AND r.status = 'attivo' LIMIT 1))
    RETURNING id INTO v_order;

    INSERT INTO public.purchase_order_items (order_id, company_id, product_id, product_supplier_link_id,
      ordered_quantity, unit_id, unit_code, purchase_quantity, purchase_unit_id, purchase_unit_code,
      conversion_factor, unit_cost, supplier_product_code, source_assignment_id, price_unit_id, price_unit_code)
    SELECT v_order, _company_id, i.product_id, a.product_supplier_link_id,
           a.assigned_quantity, i.unit_id, i.unit_code,
           a.purchase_quantity, a.purchase_unit_id, a.purchase_unit_code,
           a.conversion_factor,
           (v_prices -> a.id::text ->> 'cost')::numeric,
           l.supplier_product_code, a.id,
           (v_prices -> a.id::text ->> 'unit_id')::uuid,
           v_prices -> a.id::text ->> 'unit_code'
      FROM public.shopping_list_item_suppliers a
      JOIN public.shopping_list_items i ON i.id = a.item_id
      JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
      JOIN public.purchase_orders o ON o.id = v_order
     WHERE i.list_id = _list_id
       AND a.supplier_record_id = v_sup.supplier_record_id;

    v_ids := v_ids || to_jsonb(v_order);
    INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
    VALUES (_company_id, _actor_user_id, 'purchase_order.created_from_list', 'purchase_order', v_order,
            jsonb_build_object('list_id', _list_id));
  END LOOP;

  INSERT INTO public.shopping_list_direct_purchases (company_id, list_id, item_id, product_id, product_name, product_code,
      quantity, unit_id, unit_code, origin, reason, notes, created_by)
  SELECT _company_id, _list_id, p.item_id, p.product_id, p.product_name, p.product_code,
         p.quantity, p.unit_id, p.unit_code, 'esplicito', NULL, NULL, _actor_user_id
    FROM public._shopping_list_close_plan(_list_id) p
   WHERE p.kind = 'direct';

  v_number := COALESCE(v_list.number, public.next_document_number(_company_id, 'LS'));
  UPDATE public.shopping_lists
     SET status = 'chiusa', closed_at = now(), number = v_number
   WHERE id = _list_id AND status = 'confermata';
  IF NOT FOUND THEN RAISE EXCEPTION 'La lista non è più confermata'; END IF;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, _actor_user_id, 'shopping_list.closed', 'shopping_list', _list_id,
          jsonb_build_object('number', v_number, 'orders', jsonb_array_length(v_ids),
                             'via', 'create_purchase_orders_from_list'));
  RETURN v_ids;
END; $function$;
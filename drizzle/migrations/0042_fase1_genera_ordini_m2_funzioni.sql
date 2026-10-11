-- M2 Fase 1 «Genera ordini»: funzioni nuove. Nessuna funzione esistente modificata.

-- Residuo ordinabile di una ripartizione, in U.M. d'acquisto (ordini non annullati).
CREATE OR REPLACE FUNCTION public._assignment_residual(_assignment_id uuid, _exclude_line_id uuid DEFAULT NULL)
 RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT a.purchase_quantity - COALESCE((
    SELECT sum(oi.purchase_quantity) FROM public.purchase_order_items oi
      JOIN public.purchase_orders o ON o.id = oi.order_id
     WHERE oi.source_assignment_id = a.id AND o.status <> 'annullato'
       AND (_exclude_line_id IS NULL OR oi.id <> _exclude_line_id)), 0)
    FROM public.shopping_list_item_suppliers a WHERE a.id = _assignment_id;
$$;
REVOKE ALL ON FUNCTION public._assignment_residual(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._assignment_residual(uuid, uuid) TO service_role;

-- Controllo unico di completamento: chiude la Lista (numero LS una sola volta) solo se tutto è gestito.
CREATE OR REPLACE FUNCTION public._shopping_list_try_complete(_list_id uuid, _actor uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_list public.shopping_lists%ROWTYPE; v_number text;
BEGIN
  SELECT * INTO v_list FROM public.shopping_lists WHERE id = _list_id FOR UPDATE;
  IF v_list.id IS NULL OR v_list.status <> 'aperta' THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shopping_list_items WHERE list_id = _list_id) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.purchase_orders WHERE shopping_list_id = _list_id AND status = 'bozza') THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM public.shopping_list_items i
     CROSS JOIN LATERAL public.shopping_list_item_state(i.id) st
     WHERE i.list_id = _list_id AND i.excluded_at IS NULL
       AND NOT (
         i.decided_quantity IS NOT NULL
         AND (st.status = 'assegnata'
              OR (st.status = 'da_verificare' AND st.untranslatable > 0
                  AND NOT EXISTS (SELECT 1 FROM public.shopping_list_item_suppliers a
                                   WHERE a.item_id = i.id AND a.assigned_quantity IS NULL
                                     AND (a.coverage_confirmed_at IS NULL OR a.coverage_quantity IS DISTINCT FROM a.purchase_quantity))))
         AND NOT EXISTS (SELECT 1 FROM public.shopping_list_item_suppliers a
                          WHERE a.item_id = i.id AND public._assignment_residual(a.id) > 0)
         AND (i.manual_purchase_quantity IS NULL OR i.manual_purchase_done_at IS NOT NULL)
       )
  ) THEN RETURN false; END IF;
  v_number := COALESCE(v_list.number, public.next_document_number(v_list.company_id, 'LS'));
  UPDATE public.shopping_lists
     SET number = v_number, status = 'chiusa', closed_at = now(),
         confirmed_at = COALESCE(confirmed_at, now()), confirmed_by = COALESCE(confirmed_by, _actor)
   WHERE id = _list_id;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_list.company_id, _actor, 'shopping_list.closed', 'shopping_list', _list_id,
          jsonb_build_object('number', v_number, 'mode', 'automatica'));
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public._shopping_list_try_complete(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._shopping_list_try_complete(uuid, uuid) TO service_role;

-- Generazione bozza per un fornitore: idempotente sulla chiave, solo quantità residue.
CREATE OR REPLACE FUNCTION public.generate_supplier_order(_list_id uuid, _supplier_record_id uuid, _generation_key uuid,
  _delivery jsonb DEFAULT '{}'::jsonb, _assignment_ids uuid[] DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
  DELETE FROM _gso_cand;
  INSERT INTO _gso_cand
  SELECT a.id, public._assignment_residual(a.id)
    FROM public.shopping_list_item_suppliers a JOIN public.shopping_list_items i ON i.id = a.item_id
   WHERE i.list_id = _list_id AND a.supplier_record_id = _supplier_record_id
     AND i.excluded_at IS NULL AND i.decided_quantity IS NOT NULL
     AND (_assignment_ids IS NULL OR a.id = ANY(_assignment_ids));
  DELETE FROM _gso_cand WHERE residual IS NULL OR residual <= 0;
  IF NOT EXISTS (SELECT 1 FROM _gso_cand) THEN RAISE EXCEPTION 'Nessuna quantità da ordinare per questo fornitore'; END IF;

  SELECT string_agg(DISTINCT p.description, ', ') INTO v_bad
    FROM _gso_cand c JOIN public.shopping_list_item_suppliers a ON a.id = c.assignment_id
    JOIN public.shopping_list_items i ON i.id = a.item_id JOIN public.products p ON p.id = i.product_id
    JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
   WHERE NOT l.is_active;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Fornitore scollegato dal prodotto: %', v_bad; END IF;
  SELECT string_agg(DISTINCT p.description, ', '), string_agg(DISTINCT COALESCE(sr.legal_name, 'fornitore'), ', ') INTO v_bad, v_bad_sup
    FROM _gso_cand c JOIN public.shopping_list_item_suppliers a ON a.id = c.assignment_id
    JOIN public.shopping_list_items i ON i.id = a.item_id JOIN public.products p ON p.id = i.product_id
    JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
    LEFT JOIN public.supplier_records sr ON sr.id = l.supplier_record_id
   WHERE l.supplier_company_id IS NOT NULL
     AND (l.b2b_item_id IS NULL OR NOT public.b2b_item_purchasable(l.supplier_company_id, v_list.company_id, l.b2b_item_id));
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Il prodotto % non è più disponibile nel Catalogo B2B di %', v_bad, v_bad_sup; END IF;
  SELECT string_agg(DISTINCT p.description, ', ') INTO v_bad
    FROM _gso_cand c JOIN public.shopping_list_item_suppliers a ON a.id = c.assignment_id
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
    JOIN public.shopping_list_item_suppliers a ON a.id = c.assignment_id
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
END $$;
REVOKE ALL ON FUNCTION public.generate_supplier_order(uuid, uuid, uuid, jsonb, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_supplier_order(uuid, uuid, uuid, jsonb, uuid[]) TO authenticated, service_role;

-- Modifica bozza: quantità (mai oltre il residuo), righe tolte, consegna. Tracciata in purchase_order_changes.
CREATE OR REPLACE FUNCTION public.update_draft_order(_order_id uuid, _lines jsonb DEFAULT '[]'::jsonb, _delivery jsonb DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_o public.purchase_orders%ROWTYPE; v_list_status public.shopping_list_status;
  ln jsonb; v_line public.purchase_order_items%ROWTYPE; v_qty numeric; v_max numeric; v_seller uuid; v_n int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = _order_id;
  IF v_o.id IS NULL OR NOT public.is_company_member(v_o.company_id) THEN RAISE EXCEPTION 'Ordine non trovato'; END IF;
  IF v_o.shopping_list_id IS NOT NULL THEN
    SELECT status INTO v_list_status FROM public.shopping_lists WHERE id = v_o.shopping_list_id FOR UPDATE;
    IF v_list_status <> 'aperta' THEN RAISE EXCEPTION 'La lista non è più aperta'; END IF;
  END IF;
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = _order_id FOR UPDATE;
  IF v_o.status <> 'bozza' THEN RAISE EXCEPTION 'Solo le bozze sono modificabili'; END IF;
  SELECT r.seller_company_id INTO v_seller FROM public.supplier_customer_relations r WHERE r.id = v_o.relation_id;

  FOR ln IN SELECT * FROM jsonb_array_elements(COALESCE(_lines, '[]'::jsonb)) LOOP
    SELECT * INTO v_line FROM public.purchase_order_items WHERE id = (ln->>'line_id')::uuid AND order_id = _order_id;
    IF v_line.id IS NULL THEN RAISE EXCEPTION 'Riga non presente in questa bozza'; END IF;
    v_qty := NULLIF(ln->>'purchase_quantity', '')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      DELETE FROM public.purchase_order_items WHERE id = v_line.id;
    ELSE
      IF v_line.source_assignment_id IS NOT NULL THEN
        v_max := public._assignment_residual(v_line.source_assignment_id, v_line.id);
        IF v_qty > v_max THEN
          RAISE EXCEPTION 'Quantità superiore al residuo da ordinare per % (massimo % %)', v_line.product_name, v_max, v_line.purchase_unit_code;
        END IF;
      END IF;
      UPDATE public.purchase_order_items
         SET purchase_quantity = v_qty,
             ordered_quantity = CASE WHEN conversion_factor IS NOT NULL THEN round(v_qty * conversion_factor, 3) END
       WHERE id = v_line.id;
    END IF;
    INSERT INTO public.purchase_order_changes (order_id, buyer_company_id, seller_company_id, item_id, field, label, old_value, new_value, changed_by)
    VALUES (_order_id, v_o.company_id, v_seller, v_line.id, 'purchase_quantity', v_line.product_name,
            v_line.purchase_quantity::text, COALESCE(v_qty::text, 'rimossa'), v_uid);
    v_n := v_n + 1;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.purchase_order_items WHERE order_id = _order_id) THEN
    RAISE EXCEPTION 'La bozza non può restare senza righe: annullala';
  END IF;
  IF _delivery IS NOT NULL THEN
    UPDATE public.purchase_orders SET
      delivery_date = NULLIF(_delivery->>'date', '')::date,
      delivery_time_from = NULLIF(_delivery->>'time_from', '')::time,
      delivery_time_to = NULLIF(_delivery->>'time_to', '')::time,
      delivery_address_text = NULLIF(btrim(COALESCE(_delivery->>'address_text', '')), ''),
      supplier_notes = NULLIF(btrim(COALESCE(_delivery->>'notes', '')), '')
     WHERE id = _order_id;
    INSERT INTO public.purchase_order_changes (order_id, buyer_company_id, seller_company_id, field, label, new_value, changed_by)
    VALUES (_order_id, v_o.company_id, v_seller, 'delivery', 'Consegna', _delivery::text, v_uid);
  END IF;
  RETURN jsonb_build_object('order_id', _order_id, 'lines_changed', v_n);
END $$;
REVOKE ALL ON FUNCTION public.update_draft_order(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_draft_order(uuid, jsonb, jsonb) TO authenticated, service_role;

-- Cambio fornitore di una bozza: annulla, sposta le quantità sul nuovo fornitore, genera la nuova bozza. Tutto o niente.
CREATE OR REPLACE FUNCTION public.change_draft_supplier(_order_id uuid, _new_supplier_record_id uuid, _generation_key uuid,
  _purchase_unit_id uuid DEFAULT NULL, _manual_unit_code text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_o public.purchase_orders%ROWTYPE; v_list public.shopping_lists%ROWTYPE;
  v_ex uuid; v_line record; v_link uuid; v_n int; v_unit uuid; v_manual text; v_a public.shopping_list_item_suppliers%ROWTYPE;
  v_other numeric; v_target uuid; v_target_q numeric; v_new_ids uuid[] := '{}'; v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _generation_key IS NULL THEN RAISE EXCEPTION 'Chiave di generazione mancante'; END IF;
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = _order_id;
  IF v_o.id IS NULL OR NOT public.is_company_member(v_o.company_id) THEN RAISE EXCEPTION 'Ordine non trovato'; END IF;
  SELECT id INTO v_ex FROM public.purchase_orders WHERE company_id = v_o.company_id AND generation_key = _generation_key;
  IF v_ex IS NOT NULL THEN
    RETURN jsonb_build_object('order_id', v_ex, 'already_exists', true, 'cancelled_order_id', _order_id);
  END IF;
  IF v_o.shopping_list_id IS NULL THEN RAISE EXCEPTION 'Ordine non collegato a una Lista'; END IF;
  SELECT * INTO v_list FROM public.shopping_lists WHERE id = v_o.shopping_list_id FOR UPDATE;
  IF v_list.status <> 'aperta' THEN RAISE EXCEPTION 'La lista non è più aperta'; END IF;
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = _order_id FOR UPDATE;
  IF v_o.status <> 'bozza' THEN RAISE EXCEPTION 'Solo le bozze possono cambiare fornitore'; END IF;
  IF v_o.supplier_record_id = _new_supplier_record_id THEN RAISE EXCEPTION 'Il fornitore è già questo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supplier_records WHERE id = _new_supplier_record_id AND company_id = v_o.company_id) THEN
    RAISE EXCEPTION 'Fornitore non valido';
  END IF;

  UPDATE public.purchase_orders SET status = 'annullato', cancelled_at = now(), cancelled_by = v_uid,
         cancel_reason = 'Cambio fornitore'
   WHERE id = _order_id;

  FOR v_line IN SELECT oi.* , i.id AS item_id FROM public.purchase_order_items oi
      JOIN public.shopping_list_item_suppliers a ON a.id = oi.source_assignment_id
      JOIN public.shopping_list_items i ON i.id = a.item_id
     WHERE oi.order_id = _order_id LOOP
    SELECT count(*), min(l.id::text)::uuid INTO v_n, v_link FROM public.product_supplier_links l
     WHERE l.company_id = v_o.company_id AND l.product_id = v_line.product_id
       AND l.supplier_record_id = _new_supplier_record_id AND l.is_active;
    IF v_n <> 1 THEN RAISE EXCEPTION 'Il prodotto % non ha un unico collegamento attivo con il nuovo fornitore', v_line.product_name; END IF;
    v_unit := COALESCE(_purchase_unit_id, CASE WHEN _manual_unit_code IS NULL THEN v_line.purchase_unit_id END);
    v_manual := COALESCE(_manual_unit_code, CASE WHEN _purchase_unit_id IS NULL AND v_line.purchase_unit_id IS NULL THEN v_line.purchase_unit_code END);
    SELECT * INTO v_a FROM public.shopping_list_item_suppliers WHERE id = v_line.source_assignment_id FOR UPDATE;
    -- quantità della ripartizione ancora impegnata in altri ordini attivi
    v_other := v_a.purchase_quantity - public._assignment_residual(v_a.id) ;
    SELECT id, purchase_quantity INTO v_target, v_target_q FROM public.shopping_list_item_suppliers
     WHERE item_id = v_line.item_id AND product_supplier_link_id = v_link
       AND ((v_unit IS NOT NULL AND purchase_unit_id = v_unit)
         OR (v_unit IS NULL AND purchase_unit_id IS NULL AND upper(btrim(purchase_unit_code)) = upper(btrim(v_manual))));
    IF v_other <= 0 AND v_a.purchase_quantity <= v_line.purchase_quantity AND v_target IS NULL THEN
      -- ripartizione interamente spostata: la stessa riga passa al nuovo fornitore
      v_target := public.assign_shopping_list_supplier(v_o.company_id, v_line.item_id, 'set', v_link, NULL, v_line.purchase_quantity,
                    false, v_a.notes, v_uid, v_unit, v_a.id, v_manual);
    ELSE
      IF v_a.purchase_quantity - v_line.purchase_quantity <= 0 THEN
        RAISE EXCEPTION 'Il nuovo fornitore ha già una ripartizione per %: modifica dalla Lista', v_line.product_name;
      END IF;
      UPDATE public.shopping_list_item_suppliers
         SET purchase_quantity = purchase_quantity - v_line.purchase_quantity,
             assigned_quantity = CASE WHEN conversion_factor IS NOT NULL THEN round((purchase_quantity - v_line.purchase_quantity) * conversion_factor, 3) END
       WHERE id = v_a.id;
      v_target := public.assign_shopping_list_supplier(v_o.company_id, v_line.item_id, 'set', v_link, NULL,
                    COALESCE(v_target_q, 0) + v_line.purchase_quantity, false, NULL, v_uid, v_unit, v_target, v_manual);
    END IF;
    v_new_ids := v_new_ids || v_target;
  END LOOP;
  IF cardinality(v_new_ids) = 0 THEN RAISE EXCEPTION 'Bozza senza righe collegate alla Lista'; END IF;

  v_res := public.generate_supplier_order(v_o.shopping_list_id, _new_supplier_record_id, _generation_key,
    jsonb_build_object('date', v_o.delivery_date, 'time_from', to_char(v_o.delivery_time_from, 'HH24:MI'),
      'time_to', to_char(v_o.delivery_time_to, 'HH24:MI'), 'address_id', v_o.destination_address_id,
      'address_text', v_o.delivery_address_text, 'notes', v_o.supplier_notes), v_new_ids);
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_o.company_id, v_uid, 'purchase_order.supplier_changed', 'purchase_order', _order_id,
          jsonb_build_object('old_supplier', v_o.supplier_record_id, 'new_supplier', _new_supplier_record_id, 'new_order_id', v_res->>'order_id'));
  RETURN v_res || jsonb_build_object('cancelled_order_id', _order_id);
END $$;
REVOKE ALL ON FUNCTION public.change_draft_supplier(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_draft_supplier(uuid, uuid, uuid, uuid, text) TO authenticated, service_role;

-- Esclusione / ripresa di righe («Procedi comunque»), solo con Lista aperta e senza ordini attivi.
CREATE OR REPLACE FUNCTION public.manage_shopping_list_exclusion(_list_id uuid, _item_ids uuid[], _action text, _reason text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_list public.shopping_lists%ROWTYPE; v_n int; v_bad text; v_closed boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_list FROM public.shopping_lists WHERE id = _list_id FOR UPDATE;
  IF v_list.id IS NULL OR NOT public.is_company_member(v_list.company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF v_list.status <> 'aperta' THEN RAISE EXCEPTION 'La lista non è più aperta'; END IF;
  IF _item_ids IS NULL OR cardinality(_item_ids) = 0 THEN RAISE EXCEPTION 'Nessuna riga indicata'; END IF;
  IF (SELECT count(*) FROM public.shopping_list_items WHERE list_id = _list_id AND id = ANY(_item_ids)) <> cardinality(_item_ids) THEN
    RAISE EXCEPTION 'Riga non presente in questa Lista';
  END IF;
  IF _action = 'exclude' THEN
    SELECT string_agg(p.description, ', ') INTO v_bad FROM public.shopping_list_items i JOIN public.products p ON p.id = i.product_id
     WHERE i.id = ANY(_item_ids) AND (i.manual_purchase_done_at IS NOT NULL OR EXISTS (
       SELECT 1 FROM public.purchase_order_items oi JOIN public.purchase_orders o ON o.id = oi.order_id
         JOIN public.shopping_list_item_suppliers a ON a.id = oi.source_assignment_id
        WHERE a.item_id = i.id AND o.status <> 'annullato'));
    IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Righe già ordinate o acquistate: %', v_bad; END IF;
    UPDATE public.shopping_list_items SET excluded_at = now(), excluded_by = v_uid,
           exclusion_reason = NULLIF(btrim(COALESCE(_reason, '')), '')
     WHERE id = ANY(_item_ids) AND excluded_at IS NULL;
  ELSIF _action = 'restore' THEN
    UPDATE public.shopping_list_items SET excluded_at = NULL, excluded_by = NULL, exclusion_reason = NULL
     WHERE id = ANY(_item_ids) AND excluded_at IS NOT NULL;
  ELSE RAISE EXCEPTION 'Azione non valida';
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_list.company_id, v_uid, 'shopping_list.items_' || _action, 'shopping_list', _list_id,
          jsonb_build_object('items', to_jsonb(_item_ids), 'changed', v_n, 'reason', _reason));
  IF _action = 'exclude' THEN v_closed := public._shopping_list_try_complete(_list_id, v_uid); END IF;
  RETURN jsonb_build_object('changed', v_n, 'list_closed', v_closed);
END $$;
REVOKE ALL ON FUNCTION public.manage_shopping_list_exclusion(uuid, uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_shopping_list_exclusion(uuid, uuid[], text, text) TO authenticated, service_role;

-- Registrazione esplicita dell'acquisto diretto (una sola volta per riga).
CREATE OR REPLACE FUNCTION public.register_direct_purchase(_item_id uuid, _notes text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_item public.shopping_list_items%ROWTYPE; v_list public.shopping_lists%ROWTYPE;
  v_dp uuid; v_closed boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_item FROM public.shopping_list_items WHERE id = _item_id;
  IF v_item.id IS NULL OR NOT public.is_company_member(v_item.company_id) THEN RAISE EXCEPTION 'Riga non trovata'; END IF;
  SELECT * INTO v_list FROM public.shopping_lists WHERE id = v_item.list_id FOR UPDATE;
  SELECT * INTO v_item FROM public.shopping_list_items WHERE id = _item_id FOR UPDATE;
  IF v_item.manual_purchase_done_at IS NOT NULL THEN
    RETURN jsonb_build_object('item_id', _item_id, 'direct_purchase_id', v_item.direct_purchase_id, 'already_registered', true);
  END IF;
  IF v_list.status <> 'aperta' THEN RAISE EXCEPTION 'La lista non è più aperta'; END IF;
  IF v_item.excluded_at IS NOT NULL THEN RAISE EXCEPTION 'Riga esclusa: riprendila prima'; END IF;
  IF v_item.manual_purchase_quantity IS NULL THEN RAISE EXCEPTION 'Nessuna quota di acquisto diretto per questa riga'; END IF;
  INSERT INTO public.shopping_list_direct_purchases (company_id, list_id, item_id, product_id, product_name, product_code,
      quantity, unit_id, unit_code, origin, notes, created_by)
  SELECT v_item.company_id, v_item.list_id, v_item.id, v_item.product_id, p.description, p.code,
         v_item.manual_purchase_quantity, v_item.manual_purchase_unit_id, v_item.manual_purchase_unit_code, 'esplicito',
         NULLIF(btrim(COALESCE(_notes, '')), ''), v_uid
    FROM public.products p WHERE p.id = v_item.product_id
  RETURNING id INTO v_dp;
  UPDATE public.shopping_list_items SET manual_purchase_done_at = now(), manual_purchase_done_by = v_uid, direct_purchase_id = v_dp
   WHERE id = _item_id;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_item.company_id, v_uid, 'shopping_list.direct_purchase_registered', 'shopping_list_item', _item_id,
          jsonb_build_object('direct_purchase_id', v_dp, 'quantity', v_item.manual_purchase_quantity, 'unit_code', v_item.manual_purchase_unit_code));
  v_closed := public._shopping_list_try_complete(v_item.list_id, v_uid);
  RETURN jsonb_build_object('item_id', _item_id, 'direct_purchase_id', v_dp, 'already_registered', false, 'list_closed', v_closed);
END $$;
REVOKE ALL ON FUNCTION public.register_direct_purchase(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_direct_purchase(uuid, text) TO authenticated, service_role;

-- Conferma tracciata della copertura quando manca la conversione U.M. (nessuna equivalenza calcolata).
CREATE OR REPLACE FUNCTION public.confirm_assignment_coverage(_assignment_id uuid, _confirm boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_a public.shopping_list_item_suppliers%ROWTYPE; v_list public.shopping_lists%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_a FROM public.shopping_list_item_suppliers WHERE id = _assignment_id;
  IF v_a.id IS NULL OR NOT public.is_company_member(v_a.company_id) THEN RAISE EXCEPTION 'Ripartizione non trovata'; END IF;
  SELECT l.* INTO v_list FROM public.shopping_lists l JOIN public.shopping_list_items i ON i.list_id = l.id
   WHERE i.id = v_a.item_id FOR UPDATE OF l;
  IF v_list.status <> 'aperta' THEN RAISE EXCEPTION 'La lista non è più aperta'; END IF;
  SELECT * INTO v_a FROM public.shopping_list_item_suppliers WHERE id = _assignment_id FOR UPDATE;
  IF v_a.assigned_quantity IS NOT NULL THEN RAISE EXCEPTION 'Conversione presente: conferma non necessaria'; END IF;
  IF _confirm THEN
    UPDATE public.shopping_list_item_suppliers SET coverage_confirmed_at = now(), coverage_confirmed_by = v_uid,
           coverage_quantity = purchase_quantity, coverage_unit_code = purchase_unit_code
     WHERE id = _assignment_id;
  ELSE
    IF public._assignment_residual(_assignment_id) < v_a.purchase_quantity THEN
      RAISE EXCEPTION 'Quantità già ordinata: conferma non revocabile';
    END IF;
    UPDATE public.shopping_list_item_suppliers SET coverage_confirmed_at = NULL, coverage_confirmed_by = NULL,
           coverage_quantity = NULL, coverage_unit_code = NULL
     WHERE id = _assignment_id;
  END IF;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_a.company_id, v_uid, CASE WHEN _confirm THEN 'shopping_list.coverage_confirmed' ELSE 'shopping_list.coverage_revoked' END,
          'shopping_list_item_supplier', _assignment_id,
          jsonb_build_object('item_id', v_a.item_id, 'quantity', v_a.purchase_quantity, 'unit_code', v_a.purchase_unit_code));
  RETURN jsonb_build_object('assignment_id', _assignment_id, 'confirmed', _confirm);
END $$;
REVOKE ALL ON FUNCTION public.confirm_assignment_coverage(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_assignment_coverage(uuid, boolean) TO authenticated, service_role;
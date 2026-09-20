-- pulizia alias residuo nella creazione ordini
CREATE OR REPLACE FUNCTION public.create_purchase_orders_from_list(
  _company_id uuid, _list_id uuid, _destination_location_id uuid DEFAULT NULL, _actor_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_list public.shopping_lists;
  v_loc uuid;
  v_sup record;
  v_order uuid;
  v_ids jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_list FROM public.shopping_lists WHERE id = _list_id AND company_id = _company_id;
  IF v_list.id IS NULL THEN RAISE EXCEPTION 'Lista non trovata'; END IF;
  IF v_list.status <> 'confermata' THEN RAISE EXCEPTION 'La lista deve essere confermata prima di generare gli ordini'; END IF;
  IF EXISTS (SELECT 1 FROM public.purchase_orders WHERE shopping_list_id = _list_id) THEN
    RAISE EXCEPTION 'Ordini già generati per questa lista';
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
      conversion_factor, unit_cost, supplier_product_code)
    SELECT v_order, _company_id, i.product_id, a.product_supplier_link_id,
           sum(a.assigned_quantity), i.unit_id, i.unit_code,
           NULLIF(sum(COALESCE(a.purchase_quantity, 0)), 0), a.purchase_unit_id, a.purchase_unit_code,
           a.conversion_factor, l.manual_cost, l.supplier_product_code
      FROM public.shopping_list_item_suppliers a
      JOIN public.shopping_list_items i ON i.id = a.item_id
      JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
     WHERE i.list_id = _list_id AND a.supplier_record_id = v_sup.supplier_record_id
     GROUP BY i.product_id, a.product_supplier_link_id, i.unit_id, i.unit_code,
              a.purchase_unit_id, a.purchase_unit_code, a.conversion_factor, l.manual_cost, l.supplier_product_code;

    v_ids := v_ids || to_jsonb(v_order);

    INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
    VALUES (_company_id, _actor_user_id, 'purchase_order.created_from_list', 'purchase_order', v_order,
            jsonb_build_object('list_id', _list_id));
  END LOOP;

  IF jsonb_array_length(v_ids) = 0 THEN RAISE EXCEPTION 'Nessuna assegnazione fornitore nella lista'; END IF;
  RETURN v_ids;
END; $$;

-- azioni sull'ordine
CREATE OR REPLACE FUNCTION public.manage_purchase_order(
  _order_id uuid, _action text, _destination_location_id uuid DEFAULT NULL,
  _notes text DEFAULT NULL, _actor_user_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_o public.purchase_orders;
BEGIN
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = _order_id;
  IF v_o.id IS NULL OR NOT public.is_company_member(v_o.company_id) THEN RAISE EXCEPTION 'Ordine non trovato'; END IF;

  IF _action = 'send' THEN
    IF v_o.status <> 'bozza' THEN RAISE EXCEPTION 'Ordine già inviato'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.purchase_order_items WHERE order_id = _order_id) THEN
      RAISE EXCEPTION 'Ordine senza righe'; END IF;
    UPDATE public.purchase_orders SET status = 'inviato', sent_at = now() WHERE id = _order_id;
  ELSIF _action = 'set_destination' THEN
    IF v_o.status <> 'bozza' THEN RAISE EXCEPTION 'Destinazione modificabile solo in bozza'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.inventory_locations WHERE id = _destination_location_id AND company_id = v_o.company_id) THEN
      RAISE EXCEPTION 'Destinazione non valida'; END IF;
    UPDATE public.purchase_orders SET destination_location_id = _destination_location_id WHERE id = _order_id;
  ELSIF _action = 'notes' THEN
    UPDATE public.purchase_orders SET notes = _notes WHERE id = _order_id;
  ELSIF _action = 'cancel' THEN
    IF v_o.status NOT IN ('bozza','inviato') THEN RAISE EXCEPTION 'Ordine non annullabile'; END IF;
    IF EXISTS (SELECT 1 FROM public.goods_receipts WHERE order_id = _order_id AND status = 'confermato') THEN
      RAISE EXCEPTION 'Ordine con carichi confermati: non annullabile'; END IF;
    UPDATE public.purchase_orders SET status = 'annullato', closed_at = now() WHERE id = _order_id;
  ELSIF _action = 'close' THEN
    UPDATE public.purchase_orders SET status = 'chiuso', closed_at = now() WHERE id = _order_id;
  ELSE
    RAISE EXCEPTION 'Azione non valida';
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_o.company_id, _actor_user_id, 'purchase_order.' || _action, 'purchase_order', _order_id, NULL);
  RETURN _order_id;
END; $$;

-- apertura consegna
CREATE OR REPLACE FUNCTION public.open_purchase_delivery(
  _order_id uuid, _origin public.purchase_delivery_origin DEFAULT 'operatore_interno',
  _declared_by_name text DEFAULT NULL, _actor_user_id uuid DEFAULT NULL, _skip_access_check boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_o public.purchase_orders; v_id uuid; v_seq integer;
BEGIN
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = _order_id;
  IF v_o.id IS NULL THEN RAISE EXCEPTION 'Ordine non trovato'; END IF;
  IF NOT _skip_access_check AND NOT public.is_company_member(v_o.company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF v_o.status NOT IN ('inviato','parzialmente_consegnato') THEN
    RAISE EXCEPTION 'L''ordine deve essere inviato prima di registrare una consegna'; END IF;
  IF EXISTS (SELECT 1 FROM public.purchase_deliveries WHERE order_id = _order_id AND status = 'bozza') THEN
    SELECT id INTO v_id FROM public.purchase_deliveries WHERE order_id = _order_id AND status = 'bozza' LIMIT 1;
    RETURN v_id;
  END IF;

  SELECT COALESCE(max(sequence), 0) + 1 INTO v_seq FROM public.purchase_deliveries WHERE order_id = _order_id;
  INSERT INTO public.purchase_deliveries (company_id, order_id, sequence, origin, declared_by, declared_by_name)
  VALUES (v_o.company_id, _order_id, v_seq, _origin,
          CASE WHEN _origin = 'fornitore_link_esterno' THEN NULL ELSE _actor_user_id END, _declared_by_name)
  RETURNING id INTO v_id;

  INSERT INTO public.purchase_delivery_items (company_id, delivery_id, order_item_id, product_id,
    declared_quantity, unit_id, unit_code)
  SELECT v_o.company_id, v_id, oi.id, oi.product_id,
         greatest(0, oi.ordered_quantity - COALESCE((
            SELECT sum(x.declared_quantity) FROM public.purchase_delivery_items x
              JOIN public.purchase_deliveries xd ON xd.id = x.delivery_id
             WHERE x.order_item_id = oi.id AND xd.status <> 'bozza'), 0)),
         oi.unit_id, oi.unit_code
    FROM public.purchase_order_items oi
   WHERE oi.order_id = _order_id;

  RETURN v_id;
END; $$;

-- modifica riga dichiarata
CREATE OR REPLACE FUNCTION public.set_purchase_delivery_item(
  _delivery_item_id uuid, _declared_quantity numeric DEFAULT NULL, _declared_weight numeric DEFAULT NULL,
  _declared_producer text DEFAULT NULL, _declared_producer_lot text DEFAULT NULL,
  _declared_expiry date DEFAULT NULL, _line_notes text DEFAULT NULL, _missing_reason text DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL, _actor_label text DEFAULT NULL, _skip_access_check boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_it public.purchase_delivery_items; v_status public.purchase_delivery_status; v_prev numeric;
BEGIN
  SELECT * INTO v_it FROM public.purchase_delivery_items WHERE id = _delivery_item_id;
  IF v_it.id IS NULL THEN RAISE EXCEPTION 'Riga non trovata'; END IF;
  IF NOT _skip_access_check AND NOT public.is_company_member(v_it.company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT status INTO v_status FROM public.purchase_deliveries WHERE id = v_it.delivery_id;
  IF v_status <> 'bozza' THEN RAISE EXCEPTION 'Consegna già dichiarata: usare la contestazione'; END IF;

  v_prev := v_it.declared_quantity;
  UPDATE public.purchase_delivery_items
     SET declared_quantity = COALESCE(_declared_quantity, declared_quantity),
         declared_weight = COALESCE(_declared_weight, declared_weight),
         declared_producer = COALESCE(_declared_producer, declared_producer),
         declared_producer_lot = COALESCE(_declared_producer_lot, declared_producer_lot),
         declared_expiry = COALESCE(_declared_expiry, declared_expiry),
         line_notes = COALESCE(_line_notes, line_notes),
         missing_reason = COALESCE(_missing_reason, missing_reason)
   WHERE id = _delivery_item_id;

  INSERT INTO public.purchase_delivery_line_events (company_id, delivery_item_id, event_type,
    previous_quantity, new_quantity, notes, actor_user_id, actor_label)
  VALUES (v_it.company_id, _delivery_item_id, 'modificata', v_prev,
          COALESCE(_declared_quantity, v_prev), _line_notes, _actor_user_id, _actor_label);
  RETURN _delivery_item_id;
END; $$;

-- riga aggiunta dal fornitore / sostituzione
CREATE OR REPLACE FUNCTION public.add_purchase_delivery_extra_item(
  _delivery_id uuid, _product_id uuid, _declared_quantity numeric,
  _line_type public.purchase_delivery_line_type DEFAULT 'aggiunta_fornitore',
  _replaces_order_item_id uuid DEFAULT NULL, _unit_id uuid DEFAULT NULL, _unit_code text DEFAULT NULL,
  _declared_producer text DEFAULT NULL, _declared_producer_lot text DEFAULT NULL,
  _line_notes text DEFAULT NULL, _actor_user_id uuid DEFAULT NULL, _actor_label text DEFAULT NULL,
  _skip_access_check boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_d public.purchase_deliveries; v_id uuid;
BEGIN
  SELECT * INTO v_d FROM public.purchase_deliveries WHERE id = _delivery_id;
  IF v_d.id IS NULL THEN RAISE EXCEPTION 'Consegna non trovata'; END IF;
  IF NOT _skip_access_check AND NOT public.is_company_member(v_d.company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF v_d.status <> 'bozza' THEN RAISE EXCEPTION 'Consegna già dichiarata'; END IF;
  IF _line_type = 'ordinata' THEN RAISE EXCEPTION 'Tipo riga non valido'; END IF;

  INSERT INTO public.purchase_delivery_items (company_id, delivery_id, order_item_id, product_id,
    line_type, replaces_order_item_id, declared_quantity, unit_id, unit_code,
    declared_producer, declared_producer_lot, line_notes)
  VALUES (v_d.company_id, _delivery_id, NULL, _product_id, _line_type, _replaces_order_item_id,
    _declared_quantity, _unit_id, _unit_code, _declared_producer, _declared_producer_lot, _line_notes)
  RETURNING id INTO v_id;

  INSERT INTO public.purchase_delivery_line_events (company_id, delivery_item_id, event_type,
    previous_quantity, new_quantity, notes, actor_user_id, actor_label)
  VALUES (v_d.company_id, v_id, 'dichiarata', NULL, _declared_quantity, _line_notes, _actor_user_id, _actor_label);
  RETURN v_id;
END; $$;

-- invio dichiarazione
CREATE OR REPLACE FUNCTION public.submit_purchase_delivery(
  _delivery_id uuid, _notes text DEFAULT NULL, _actor_user_id uuid DEFAULT NULL,
  _actor_label text DEFAULT NULL, _skip_access_check boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_d public.purchase_deliveries;
BEGIN
  SELECT * INTO v_d FROM public.purchase_deliveries WHERE id = _delivery_id;
  IF v_d.id IS NULL THEN RAISE EXCEPTION 'Consegna non trovata'; END IF;
  IF NOT _skip_access_check AND NOT public.is_company_member(v_d.company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF v_d.status <> 'bozza' THEN RETURN _delivery_id; END IF;

  UPDATE public.purchase_deliveries
     SET status = 'dichiarata', declared_at = now(), notes = COALESCE(_notes, notes),
         declared_by_name = COALESCE(_actor_label, declared_by_name)
   WHERE id = _delivery_id;

  INSERT INTO public.purchase_delivery_line_events (company_id, delivery_item_id, event_type,
    new_quantity, actor_user_id, actor_label)
  SELECT v_d.company_id, di.id, 'dichiarata', di.declared_quantity, _actor_user_id, _actor_label
    FROM public.purchase_delivery_items di WHERE di.delivery_id = _delivery_id;

  UPDATE public.purchase_orders SET status = 'parzialmente_consegnato'
   WHERE id = v_d.order_id AND status = 'inviato';

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_d.company_id, _actor_user_id, 'purchase_delivery.declared', 'purchase_delivery', _delivery_id,
          jsonb_build_object('origin', v_d.origin));
  RETURN _delivery_id;
END; $$;

-- accettazione consegna
CREATE OR REPLACE FUNCTION public.accept_purchase_delivery(_delivery_id uuid, _actor_user_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_d public.purchase_deliveries; v_open integer; v_ref integer;
BEGIN
  SELECT * INTO v_d FROM public.purchase_deliveries WHERE id = _delivery_id;
  IF v_d.id IS NULL OR NOT public.is_company_member(v_d.company_id) THEN RAISE EXCEPTION 'Consegna non trovata'; END IF;
  IF v_d.status NOT IN ('dichiarata','in_contestazione') THEN RAISE EXCEPTION 'Consegna non accettabile'; END IF;

  SELECT count(*) INTO v_open FROM public.purchase_delivery_disputes dd
    JOIN public.purchase_delivery_items di ON di.id = dd.delivery_item_id
   WHERE di.delivery_id = _delivery_id AND dd.status = 'aperta';
  IF v_open > 0 THEN RAISE EXCEPTION 'Contestazioni ancora aperte: risolverle prima di accettare'; END IF;

  UPDATE public.purchase_delivery_items
     SET status = 'accettata', accepted_quantity = COALESCE(accepted_quantity, declared_quantity),
         decided_by = _actor_user_id, decided_at = now()
   WHERE delivery_id = _delivery_id AND status IN ('dichiarata','rettificata');

  INSERT INTO public.purchase_delivery_line_events (company_id, delivery_item_id, event_type, new_quantity, actor_user_id)
  SELECT v_d.company_id, di.id, 'accettata', di.accepted_quantity, _actor_user_id
    FROM public.purchase_delivery_items di WHERE di.delivery_id = _delivery_id AND di.status = 'accettata';

  SELECT count(*) INTO v_ref FROM public.purchase_delivery_items
   WHERE delivery_id = _delivery_id AND status = 'rifiutata';

  UPDATE public.purchase_deliveries
     SET status = CASE WHEN v_ref > 0 THEN 'chiusa_con_rifiuti' ELSE 'accettata' END,
         accepted_by = _actor_user_id, accepted_at = now()
   WHERE id = _delivery_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_d.company_id, _actor_user_id, 'purchase_delivery.accepted', 'purchase_delivery', _delivery_id, NULL);
  RETURN _delivery_id;
END; $$;

-- contestazione riga
CREATE OR REPLACE FUNCTION public.dispute_purchase_delivery_item(
  _delivery_item_id uuid, _reason public.purchase_dispute_reason, _notes text DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_it public.purchase_delivery_items; v_id uuid; v_dstatus public.purchase_delivery_status;
BEGIN
  SELECT * INTO v_it FROM public.purchase_delivery_items WHERE id = _delivery_item_id;
  IF v_it.id IS NULL OR NOT public.is_company_member(v_it.company_id) THEN RAISE EXCEPTION 'Riga non trovata'; END IF;
  SELECT status INTO v_dstatus FROM public.purchase_deliveries WHERE id = v_it.delivery_id;
  IF v_dstatus NOT IN ('dichiarata','in_contestazione') THEN RAISE EXCEPTION 'Consegna non contestabile'; END IF;

  INSERT INTO public.purchase_delivery_disputes (company_id, delivery_item_id, reason, notes, opened_by)
  VALUES (v_it.company_id, _delivery_item_id, _reason, _notes, _actor_user_id)
  RETURNING id INTO v_id;

  UPDATE public.purchase_delivery_items SET status = 'contestata' WHERE id = _delivery_item_id;
  UPDATE public.purchase_deliveries SET status = 'in_contestazione' WHERE id = v_it.delivery_id;

  INSERT INTO public.purchase_delivery_line_events (company_id, delivery_item_id, event_type,
    previous_quantity, new_quantity, reason, notes, actor_user_id)
  VALUES (v_it.company_id, _delivery_item_id, 'contestata', v_it.declared_quantity, v_it.declared_quantity,
          _reason::text, _notes, _actor_user_id);

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_it.company_id, _actor_user_id, 'purchase_delivery.disputed', 'purchase_delivery_item',
          _delivery_item_id, jsonb_build_object('reason', _reason));
  RETURN v_id;
END; $$;

-- risoluzione contestazione
CREATE OR REPLACE FUNCTION public.resolve_purchase_delivery_dispute(
  _dispute_id uuid, _resolution text, _accepted_quantity numeric DEFAULT NULL,
  _notes text DEFAULT NULL, _actor_user_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dd public.purchase_delivery_disputes; v_it public.purchase_delivery_items;
        v_new public.purchase_delivery_line_status; v_qty numeric; v_st public.purchase_dispute_status;
BEGIN
  SELECT * INTO v_dd FROM public.purchase_delivery_disputes WHERE id = _dispute_id;
  IF v_dd.id IS NULL OR NOT public.is_company_member(v_dd.company_id) THEN RAISE EXCEPTION 'Contestazione non trovata'; END IF;
  IF v_dd.status <> 'aperta' THEN RAISE EXCEPTION 'Contestazione già risolta'; END IF;
  SELECT * INTO v_it FROM public.purchase_delivery_items WHERE id = v_dd.delivery_item_id;

  IF _resolution = 'accettata' THEN
    v_new := 'accettata'; v_qty := COALESCE(_accepted_quantity, v_it.declared_quantity); v_st := 'risolta_accettata';
  ELSIF _resolution = 'rettificata' THEN
    IF _accepted_quantity IS NULL THEN RAISE EXCEPTION 'Quantità rettificata obbligatoria'; END IF;
    v_new := 'rettificata'; v_qty := _accepted_quantity; v_st := 'risolta_rettificata';
  ELSIF _resolution = 'rifiutata' THEN
    v_new := 'rifiutata'; v_qty := 0; v_st := 'risolta_rifiutata';
  ELSE
    RAISE EXCEPTION 'Esito non valido';
  END IF;

  UPDATE public.purchase_delivery_disputes
     SET status = v_st, resolved_by = _actor_user_id, resolved_at = now(), resolution_notes = _notes
   WHERE id = _dispute_id;

  UPDATE public.purchase_delivery_items
     SET status = v_new, accepted_quantity = v_qty, decided_by = _actor_user_id, decided_at = now()
   WHERE id = v_it.id;

  INSERT INTO public.purchase_delivery_line_events (company_id, delivery_item_id, event_type,
    previous_quantity, new_quantity, reason, notes, actor_user_id)
  VALUES (v_dd.company_id, v_it.id,
          CASE WHEN _resolution = 'rettificata' THEN 'rettificata'
               WHEN _resolution = 'rifiutata' THEN 'rifiutata' ELSE 'accettata' END::public.delivery_line_event_type,
          v_it.declared_quantity, v_qty, _resolution, _notes, _actor_user_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.purchase_delivery_disputes dd
      JOIN public.purchase_delivery_items di ON di.id = dd.delivery_item_id
     WHERE di.delivery_id = v_it.delivery_id AND dd.status = 'aperta') THEN
    UPDATE public.purchase_deliveries SET status = 'dichiarata'
     WHERE id = v_it.delivery_id AND status = 'in_contestazione';
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_dd.company_id, _actor_user_id, 'purchase_delivery.dispute_' || _resolution,
          'purchase_delivery_item', v_it.id, jsonb_build_object('quantity', v_qty));
  RETURN _dispute_id;
END; $$;

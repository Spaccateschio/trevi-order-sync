-- apertura carico merce
CREATE OR REPLACE FUNCTION public.open_goods_receipt(
  _delivery_id uuid, _actor_user_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_d public.purchase_deliveries; v_o public.purchase_orders; v_id uuid;
BEGIN
  SELECT * INTO v_d FROM public.purchase_deliveries WHERE id = _delivery_id;
  IF v_d.id IS NULL OR NOT public.is_company_member(v_d.company_id) THEN RAISE EXCEPTION 'Consegna non trovata'; END IF;
  IF v_d.status NOT IN ('accettata','chiusa_con_rifiuti') THEN
    RAISE EXCEPTION 'La consegna deve essere accettata prima del carico merce'; END IF;
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = v_d.order_id;

  SELECT id INTO v_id FROM public.goods_receipts WHERE delivery_id = _delivery_id LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.goods_receipts (company_id, archive_id, order_id, delivery_id, supplier_record_id,
    location_id, number, created_by)
  VALUES (v_o.company_id, v_o.archive_id, v_o.id, _delivery_id, v_o.supplier_record_id,
    v_o.destination_location_id, public.next_document_number(v_o.company_id, 'CAR'), _actor_user_id)
  RETURNING id INTO v_id;

  INSERT INTO public.goods_receipt_items (company_id, receipt_id, delivery_item_id, order_item_id, product_id,
    verified_quantity, unit_id, unit_code, unit_cost, producer_name, producer_lot_code, expiry_date)
  SELECT v_o.company_id, v_id, di.id, di.order_item_id, di.product_id,
         COALESCE(di.accepted_quantity, di.declared_quantity), di.unit_id, di.unit_code,
         oi.unit_cost, di.declared_producer, di.declared_producer_lot, di.declared_expiry
    FROM public.purchase_delivery_items di
    LEFT JOIN public.purchase_order_items oi ON oi.id = di.order_item_id
   WHERE di.delivery_id = _delivery_id
     AND di.status <> 'rifiutata'
     AND COALESCE(di.accepted_quantity, di.declared_quantity) > 0;

  RETURN v_id;
END; $$;

-- correzione riga di carico
CREATE OR REPLACE FUNCTION public.set_goods_receipt_item(
  _receipt_item_id uuid, _verified_quantity numeric DEFAULT NULL, _producer_name text DEFAULT NULL,
  _producer_lot_code text DEFAULT NULL, _expiry_date date DEFAULT NULL, _unit_cost numeric DEFAULT NULL,
  _notes text DEFAULT NULL, _actor_user_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_it public.goods_receipt_items; v_status public.goods_receipt_status;
BEGIN
  SELECT * INTO v_it FROM public.goods_receipt_items WHERE id = _receipt_item_id;
  IF v_it.id IS NULL OR NOT public.is_company_member(v_it.company_id) THEN RAISE EXCEPTION 'Riga non trovata'; END IF;
  SELECT status INTO v_status FROM public.goods_receipts WHERE id = v_it.receipt_id;
  IF v_status <> 'bozza' THEN RAISE EXCEPTION 'Carico già confermato: non modificabile'; END IF;
  IF _verified_quantity IS NOT NULL AND _verified_quantity < 0 THEN RAISE EXCEPTION 'Quantità non valida'; END IF;

  UPDATE public.goods_receipt_items
     SET verified_quantity = COALESCE(_verified_quantity, verified_quantity),
         producer_name = COALESCE(_producer_name, producer_name),
         producer_lot_code = COALESCE(_producer_lot_code, producer_lot_code),
         expiry_date = COALESCE(_expiry_date, expiry_date),
         unit_cost = COALESCE(_unit_cost, unit_cost),
         notes = COALESCE(_notes, notes)
   WHERE id = _receipt_item_id;
  RETURN _receipt_item_id;
END; $$;

-- conferma carico: unico evento che crea lotti e movimenti (idempotente)
CREATE OR REPLACE FUNCTION public.confirm_goods_receipt(_receipt_id uuid, _actor_user_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r public.goods_receipts; v_it record; v_lot uuid; v_n integer := 0; v_ordered numeric; v_recv numeric;
BEGIN
  SELECT * INTO v_r FROM public.goods_receipts WHERE id = _receipt_id;
  IF v_r.id IS NULL OR NOT public.is_company_member(v_r.company_id) THEN RAISE EXCEPTION 'Carico non trovato'; END IF;
  IF v_r.status = 'confermato' THEN RETURN _receipt_id; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.goods_receipt_items WHERE receipt_id = _receipt_id AND verified_quantity > 0) THEN
    RAISE EXCEPTION 'Nessuna quantità da caricare';
  END IF;

  FOR v_it IN SELECT * FROM public.goods_receipt_items WHERE receipt_id = _receipt_id AND verified_quantity > 0
  LOOP
    v_n := v_n + 1;
    IF EXISTS (SELECT 1 FROM public.stock_lots WHERE goods_receipt_item_id = v_it.id) THEN CONTINUE; END IF;

    INSERT INTO public.stock_lots (company_id, archive_id, product_id, location_id, goods_receipt_item_id,
      supplier_record_id, internal_code, producer_name, producer_lot_code, unit_cost, unit_id, unit_code,
      initial_quantity, entered_at, expiry_date)
    VALUES (v_r.company_id, v_r.archive_id, v_it.product_id, v_r.location_id, v_it.id,
      v_r.supplier_record_id, v_r.number || '-' || lpad(v_n::text, 3, '0'),
      v_it.producer_name, v_it.producer_lot_code, v_it.unit_cost, v_it.unit_id, v_it.unit_code,
      v_it.verified_quantity, v_r.received_at, v_it.expiry_date)
    RETURNING id INTO v_lot;

    INSERT INTO public.inventory_movements (company_id, archive_id, product_id, location_id, stock_lot_id,
      movement_type, quantity, unit_id, unit_code, source_table, source_id, created_by)
    VALUES (v_r.company_id, v_r.archive_id, v_it.product_id, v_r.location_id, v_lot,
      'entrata_acquisto', v_it.verified_quantity, v_it.unit_id, v_it.unit_code,
      'goods_receipt_items', v_it.id, _actor_user_id);
  END LOOP;

  UPDATE public.goods_receipts SET status = 'confermato', confirmed_by = _actor_user_id, confirmed_at = now()
   WHERE id = _receipt_id AND status = 'bozza';

  SELECT COALESCE(sum(ordered_quantity), 0) INTO v_ordered FROM public.purchase_order_items WHERE order_id = v_r.order_id;
  SELECT COALESCE(sum(ri.verified_quantity), 0) INTO v_recv
    FROM public.goods_receipt_items ri JOIN public.goods_receipts r ON r.id = ri.receipt_id
   WHERE r.order_id = v_r.order_id AND r.status = 'confermato';
  UPDATE public.purchase_orders
     SET status = CASE WHEN v_recv >= v_ordered THEN 'consegnato' ELSE 'parzialmente_consegnato' END
   WHERE id = v_r.order_id AND status IN ('inviato','parzialmente_consegnato');

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_r.company_id, _actor_user_id, 'goods_receipt.confirmed', 'goods_receipt', _receipt_id, NULL);
  RETURN _receipt_id;
END; $$;

-- riconciliazione conteggio fisico <-> provenienze (mai automatica)
CREATE OR REPLACE FUNCTION public.open_lot_reconciliation(
  _product_id uuid, _location_id uuid, _notes text DEFAULT NULL, _actor_user_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid; v_archive uuid; v_diff numeric; v_id uuid;
BEGIN
  SELECT company_id, archive_id INTO v_company, v_archive FROM public.products WHERE id = _product_id;
  IF v_company IS NULL OR NOT public.is_company_member(v_company) THEN RAISE EXCEPTION 'Prodotto non trovato'; END IF;
  SELECT difference INTO v_diff FROM public.product_lot_reconciliation(_product_id, _location_id) LIMIT 1;
  IF v_diff IS NULL OR v_diff = 0 THEN RAISE EXCEPTION 'Nessuna differenza da riconciliare'; END IF;

  SELECT id INTO v_id FROM public.stock_lot_reconciliations
   WHERE product_id = _product_id AND location_id = _location_id AND status = 'aperta' LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE public.stock_lot_reconciliations SET detected_difference = v_diff WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.stock_lot_reconciliations (company_id, archive_id, product_id, location_id,
    detected_difference, notes)
  VALUES (v_company, v_archive, _product_id, _location_id, v_diff, _notes)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.resolve_lot_reconciliation(
  _reconciliation_id uuid, _action text, _stock_lot_id uuid DEFAULT NULL, _quantity numeric DEFAULT NULL,
  _notes text DEFAULT NULL, _actor_user_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rec public.stock_lot_reconciliations; v_lot public.stock_lots;
BEGIN
  SELECT * INTO v_rec FROM public.stock_lot_reconciliations WHERE id = _reconciliation_id;
  IF v_rec.id IS NULL OR NOT public.is_company_member(v_rec.company_id) THEN RAISE EXCEPTION 'Riconciliazione non trovata'; END IF;
  IF v_rec.status <> 'aperta' THEN RAISE EXCEPTION 'Riconciliazione già chiusa'; END IF;

  IF _action = 'ignore' THEN
    UPDATE public.stock_lot_reconciliations
       SET status = 'ignorata', notes = COALESCE(_notes, notes), decided_by = _actor_user_id, decided_at = now()
     WHERE id = _reconciliation_id;
  ELSIF _action = 'attribute' THEN
    IF _stock_lot_id IS NULL OR _quantity IS NULL OR _quantity = 0 THEN
      RAISE EXCEPTION 'Provenienza e quantità obbligatorie'; END IF;
    SELECT * INTO v_lot FROM public.stock_lots WHERE id = _stock_lot_id;
    IF v_lot.id IS NULL OR v_lot.company_id <> v_rec.company_id
       OR v_lot.product_id <> v_rec.product_id OR v_lot.location_id <> v_rec.location_id THEN
      RAISE EXCEPTION 'Provenienza non compatibile'; END IF;

    INSERT INTO public.inventory_movements (company_id, archive_id, product_id, location_id, stock_lot_id,
      movement_type, quantity, unit_id, unit_code, source_table, source_id, notes, created_by)
    VALUES (v_rec.company_id, v_rec.archive_id, v_rec.product_id, v_rec.location_id, _stock_lot_id,
      'rettifica', _quantity, v_lot.unit_id, v_lot.unit_code,
      'stock_lot_reconciliations', _reconciliation_id, _notes, _actor_user_id);

    UPDATE public.stock_lot_reconciliations
       SET attributed_quantity = attributed_quantity + _quantity,
           status = CASE WHEN abs(attributed_quantity + _quantity - detected_difference) < 0.0001
                         THEN 'riconciliata' ELSE 'aperta' END,
           notes = COALESCE(_notes, notes), decided_by = _actor_user_id, decided_at = now()
     WHERE id = _reconciliation_id;
  ELSE
    RAISE EXCEPTION 'Azione non valida';
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_rec.company_id, _actor_user_id, 'lot_reconciliation.' || _action, 'stock_lot_reconciliation',
          _reconciliation_id, NULL);
  RETURN _reconciliation_id;
END; $$;

-- link esterno
CREATE OR REPLACE FUNCTION public.create_order_share_link(
  _order_id uuid, _token_hash text, _expires_at timestamptz, _recipient_label text DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_o public.purchase_orders; v_id uuid;
BEGIN
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = _order_id;
  IF v_o.id IS NULL OR NOT public.is_company_member(v_o.company_id) THEN RAISE EXCEPTION 'Ordine non trovato'; END IF;
  IF v_o.status NOT IN ('inviato','parzialmente_consegnato') THEN
    RAISE EXCEPTION 'Condivisibile solo dopo l''invio dell''ordine'; END IF;

  UPDATE public.purchase_order_share_links SET revoked_at = now()
   WHERE order_id = _order_id AND revoked_at IS NULL;

  INSERT INTO public.purchase_order_share_links (company_id, order_id, token_hash, recipient_label,
    expires_at, created_by)
  VALUES (v_o.company_id, _order_id, _token_hash, _recipient_label, _expires_at, _actor_user_id)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_o.company_id, _actor_user_id, 'purchase_order.share_link_created', 'purchase_order', _order_id, NULL);
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.revoke_order_share_link(_link_id uuid, _actor_user_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_l public.purchase_order_share_links;
BEGIN
  SELECT * INTO v_l FROM public.purchase_order_share_links WHERE id = _link_id;
  IF v_l.id IS NULL OR NOT public.is_company_member(v_l.company_id) THEN RAISE EXCEPTION 'Link non trovato'; END IF;
  UPDATE public.purchase_order_share_links SET revoked_at = now() WHERE id = _link_id AND revoked_at IS NULL;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_l.company_id, _actor_user_id, 'purchase_order.share_link_revoked', 'purchase_order', v_l.order_id, NULL);
  RETURN _link_id;
END; $$;

-- risoluzione token (solo lato server, nessun accesso diretto alle tabelle)
CREATE OR REPLACE FUNCTION public.resolve_order_share_token(_token_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_l public.purchase_order_share_links;
BEGIN
  SELECT * INTO v_l FROM public.purchase_order_share_links WHERE token_hash = _token_hash;
  IF v_l.id IS NULL THEN RAISE EXCEPTION 'Codice non valido'; END IF;
  IF v_l.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Codice revocato'; END IF;
  IF v_l.expires_at <= now() THEN RAISE EXCEPTION 'Codice scaduto'; END IF;
  UPDATE public.purchase_order_share_links
     SET access_count = access_count + 1, last_access_at = now() WHERE id = v_l.id;
  RETURN v_l.order_id;
END; $$;

CREATE OR REPLACE FUNCTION public.external_order_snapshot(_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order uuid; v_o public.purchase_orders;
BEGIN
  v_order := public.resolve_order_share_token(_token_hash);
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = v_order;
  RETURN jsonb_build_object(
    'order_id', v_o.id,
    'number', v_o.number,
    'status', v_o.status,
    'buyer', (SELECT legal_name FROM public.companies WHERE id = v_o.company_id),
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'order_item_id', oi.id, 'code', p.code, 'description', p.description,
        'ordered_quantity', oi.ordered_quantity, 'unit_code', oi.unit_code,
        'supplier_product_code', oi.supplier_product_code) ORDER BY p.code)
      FROM public.purchase_order_items oi JOIN public.products p ON p.id = oi.product_id
     WHERE oi.order_id = v_o.id), '[]'::jsonb));
END; $$;

-- solo il service role può usare le funzioni del link esterno
REVOKE EXECUTE ON FUNCTION public.resolve_order_share_token(text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.external_order_snapshot(text) FROM anon, authenticated, public;

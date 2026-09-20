CREATE OR REPLACE FUNCTION public.next_document_number(_company_id uuid, _prefix text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_n integer; v_year text := to_char(now(), 'YYYY');
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_company_id::text || _prefix, 0));
  IF _prefix = 'ORD' THEN
    SELECT COALESCE(max(NULLIF(regexp_replace(number, '^.*-', ''), '')::integer), 0) + 1 INTO v_n
      FROM public.purchase_orders
     WHERE company_id = _company_id AND number LIKE _prefix || '-' || v_year || '-%';
  ELSE
    SELECT COALESCE(max(NULLIF(regexp_replace(number, '^.*-', ''), '')::integer), 0) + 1 INTO v_n
      FROM public.goods_receipts
     WHERE company_id = _company_id AND number LIKE _prefix || '-' || v_year || '-%';
  END IF;
  RETURN _prefix || '-' || v_year || '-' || lpad(v_n::text, 5, '0');
END; $function$;

CREATE OR REPLACE FUNCTION public.confirm_goods_receipt(_receipt_id uuid, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_r public.goods_receipts; v_it record; v_lot uuid; v_n integer := 0; v_ordered numeric; v_recv numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_receipt_id::text, 0));
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
     SET status = (CASE WHEN v_recv >= v_ordered THEN 'consegnato' ELSE 'parzialmente_consegnato' END)::public.purchase_order_status
   WHERE id = v_r.order_id AND status IN ('inviato','parzialmente_consegnato');

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_r.company_id, _actor_user_id, 'goods_receipt.confirmed', 'goods_receipt', _receipt_id, NULL);
  RETURN _receipt_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.resolve_lot_reconciliation(_reconciliation_id uuid, _action text, _stock_lot_id uuid DEFAULT NULL::uuid, _quantity numeric DEFAULT NULL::numeric, _notes text DEFAULT NULL::text, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    IF sign(_quantity) <> sign(v_rec.detected_difference) THEN
      RAISE EXCEPTION 'La rettifica deve avere lo stesso segno della differenza rilevata'; END IF;
    IF abs(v_rec.attributed_quantity + _quantity) > abs(v_rec.detected_difference) + 0.0001 THEN
      RAISE EXCEPTION 'La rettifica supera la differenza rilevata'; END IF;
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
           status = (CASE WHEN abs(attributed_quantity + _quantity - detected_difference) < 0.0001
                         THEN 'riconciliata' ELSE 'aperta' END)::public.lot_reconciliation_status,
           notes = COALESCE(_notes, notes), decided_by = _actor_user_id, decided_at = now()
     WHERE id = _reconciliation_id;
  ELSE
    RAISE EXCEPTION 'Azione non valida';
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_rec.company_id, _actor_user_id, 'lot_reconciliation.' || _action, 'stock_lot_reconciliation',
          _reconciliation_id, NULL);
  RETURN _reconciliation_id;
END; $function$;

REVOKE ALL ON FUNCTION public.next_document_number(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_goods_receipt(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_lot_reconciliation(uuid, text, uuid, numeric, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_document_number(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_goods_receipt(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_lot_reconciliation(uuid, text, uuid, numeric, text, uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  _order_id uuid, _lines jsonb, _request_key uuid, _order_version timestamptz,
  _delivery_id uuid DEFAULT NULL, _delivery_version timestamptz DEFAULT NULL, _notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_o public.purchase_orders; v_d public.purchase_deliveries; v_di public.purchase_delivery_items;
  v_oi public.purchase_order_items; v_ri public.goods_receipt_items; v_p public.products;
  v_line jsonb; v_id uuid; v_receipt uuid; v_dispute uuid; v_unit uuid; v_code text;
  v_qty numeric; v_arrived numeric; v_verified numeric; v_declared numeric; v_base numeric;
  v_outcome text; v_reason public.purchase_dispute_reason; v_basis numeric; v_seen jsonb;
  v_new boolean; v_editable boolean; v_price_id uuid; v_replacement uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = _order_id AND public.is_company_member(company_id) FOR UPDATE;
  IF v_o.id IS NULL THEN RAISE EXCEPTION 'Ordine non trovato nell’azienda acquirente'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('receive_purchase_order:' || _order_id::text, 0));
  IF _request_key IS NULL THEN RAISE EXCEPTION 'Chiave di conferma obbligatoria'; END IF;
  SELECT jsonb_build_object('receipt_id', entity_id, 'delivery_id', detail->>'delivery_id', 'duplicate', true)
    INTO v_seen FROM public.audit_events WHERE company_id = v_o.company_id
    AND action = 'purchase_order.received_atomic' AND detail->>'order_id' = _order_id::text
    AND detail->>'request_key' = _request_key::text LIMIT 1;
  IF v_seen IS NOT NULL THEN RETURN v_seen; END IF;
  IF v_o.updated_at IS DISTINCT FROM _order_version THEN RAISE EXCEPTION 'L’ordine è cambiato: riapri la ricezione prima di confermare'; END IF;
  IF v_o.status NOT IN ('inviato','parzialmente_consegnato') THEN RAISE EXCEPTION 'L’ordine non è in attesa merce'; END IF;
  IF jsonb_typeof(_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(_lines) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Righe della ricezione non valide'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_lines) x WHERE (x->>'verified_quantity')::numeric > 0 OR (x->>'substitute_quantity')::numeric > 0) THEN
    RAISE EXCEPTION 'Nessuna merce da caricare: indica almeno una quantità arrivata. Non è stato registrato nulla';
  END IF;
  v_new := _delivery_id IS NULL;
  IF NOT v_new THEN
    SELECT * INTO v_d FROM public.purchase_deliveries WHERE id = _delivery_id AND order_id = _order_id AND company_id = v_o.company_id FOR UPDATE;
    IF v_d.id IS NULL OR v_d.updated_at IS DISTINCT FROM _delivery_version THEN RAISE EXCEPTION 'La consegna è cambiata: riapri la ricezione'; END IF;
    IF v_d.status = 'bozza' AND v_d.origin <> 'operatore_interno' THEN RAISE EXCEPTION 'Il fornitore sta ancora compilando la consegna: attendi il suo dichiarato'; END IF;
    IF EXISTS (SELECT 1 FROM public.goods_receipts WHERE delivery_id = v_d.id AND status = 'confermato') THEN RAISE EXCEPTION 'Consegna già caricata'; END IF;
    PERFORM 1 FROM public.purchase_delivery_items WHERE delivery_id = v_d.id FOR UPDATE;
    IF jsonb_array_length(_lines) <> (SELECT count(*) FROM public.purchase_delivery_items WHERE delivery_id = v_d.id) THEN RAISE EXCEPTION 'Controlla tutte le righe della consegna'; END IF;
  ELSIF EXISTS (SELECT 1 FROM public.purchase_deliveries d WHERE d.order_id = _order_id AND NOT EXISTS (SELECT 1 FROM public.goods_receipts r WHERE r.delivery_id = d.id AND r.status = 'confermato')) THEN
    RAISE EXCEPTION 'C’è già una consegna da completare: riapri la ricezione';
  END IF;
  PERFORM 1 FROM public.purchase_order_items WHERE order_id = _order_id FOR UPDATE;
  IF (SELECT count(DISTINCT COALESCE(x->>'delivery_item_id', x->>'order_item_id')) FROM jsonb_array_elements(_lines) x) <> jsonb_array_length(_lines) THEN RAISE EXCEPTION 'Riga duplicata nella ricezione'; END IF;
  -- Validate caller-owned identities, versions, outcomes and quantities before the first write.
  FOR v_line IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    v_outcome := v_line->>'outcome'; v_qty := (v_line->>'quantity')::numeric;
    v_arrived := (v_line->>'arrived_quantity')::numeric; v_verified := (v_line->>'verified_quantity')::numeric;
    v_declared := (v_line->>'declared_stock_quantity')::numeric;
    IF v_outcome IS NULL OR v_outcome NOT IN ('ok','parziale','mancante','danneggiato') OR v_qty IS NULL OR v_arrived IS NULL OR v_verified IS NULL OR v_qty < 0 OR v_arrived < 0 OR v_verified < 0 OR v_declared < 0 OR v_qty > v_arrived THEN RAISE EXCEPTION 'Esito o quantità non valida'; END IF;
    IF v_qty::text IN ('NaN','Infinity','-Infinity') OR v_arrived::text IN ('NaN','Infinity','-Infinity') OR v_verified::text IN ('NaN','Infinity','-Infinity') OR v_declared::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Quantità non valida'; END IF;
    IF (v_line->>'unit_cost')::numeric < 0 OR (v_line->>'price_quantity')::numeric <= 0 THEN RAISE EXCEPTION 'Prezzo o quantità del prezzo non valida'; END IF;
    PERFORM (v_line->>'expiry')::date;
    v_reason := (v_line->>'reason')::public.purchase_dispute_reason;
    IF v_reason IS NULL THEN RAISE EXCEPTION 'Motivo della contestazione non valido'; END IF;
    IF v_outcome = 'mancante' AND (v_qty <> 0 OR v_verified <> 0 OR NULLIF(btrim(v_line->>'missing_reason'), '') IS NULL) THEN RAISE EXCEPTION 'Indica il motivo della mancanza'; END IF;
    IF v_qty > 0 AND v_verified <= 0 THEN RAISE EXCEPTION 'Indica la quantità effettivamente verificata in magazzino'; END IF;
    IF v_qty = 0 AND v_verified <> 0 THEN RAISE EXCEPTION 'Una riga non arrivata non può generare giacenza'; END IF;
    IF v_new THEN
      SELECT * INTO v_oi FROM public.purchase_order_items WHERE id = (v_line->>'order_item_id')::uuid AND order_id = _order_id;
      IF v_oi.id IS NULL OR v_oi.updated_at IS DISTINCT FROM (v_line->>'version')::timestamptz OR v_line->>'delivery_item_id' IS NOT NULL THEN RAISE EXCEPTION 'Riga non appartenente all’ordine o modificata'; END IF;
      SELECT GREATEST(0, COALESCE(v_oi.purchase_quantity, v_oi.ordered_quantity, 0) - COALESCE(sum(CASE WHEN v_oi.purchase_quantity IS NOT NULL THEN di.accepted_purchase_quantity ELSE ri.verified_quantity END),0)) INTO v_base
        FROM public.goods_receipt_items ri JOIN public.goods_receipts r ON r.id = ri.receipt_id LEFT JOIN public.purchase_delivery_items di ON di.id = ri.delivery_item_id
        WHERE ri.order_item_id = v_oi.id AND r.status = 'confermato';
      v_code := COALESCE(v_oi.purchase_unit_code, v_oi.unit_code);
      IF v_oi.unit_code IS NULL THEN RAISE EXCEPTION 'La riga non contiene l’unità di magazzino: impossibile registrare la giacenza'; END IF;
    ELSE
      SELECT * INTO v_di FROM public.purchase_delivery_items WHERE id = (v_line->>'delivery_item_id')::uuid AND delivery_id = v_d.id;
      IF v_di.id IS NULL OR v_di.updated_at IS DISTINCT FROM (v_line->>'version')::timestamptz OR v_di.order_item_id IS DISTINCT FROM (v_line->>'order_item_id')::uuid THEN RAISE EXCEPTION 'Riga non appartenente alla consegna o modificata'; END IF;
      v_base := COALESCE(v_di.declared_purchase_quantity, v_di.declared_quantity, 0);
      v_code := COALESCE(v_di.purchase_unit_code, v_di.unit_code);
      IF v_di.unit_code IS NULL THEN RAISE EXCEPTION 'La riga non contiene l’unità di magazzino'; END IF;
      IF v_d.status IN ('accettata','chiusa_con_rifiuti') THEN
        v_base := COALESCE(v_di.accepted_purchase_quantity, v_di.accepted_quantity, v_base);
        IF v_qty <> v_base THEN RAISE EXCEPTION 'Consegna già accettata: completa il carico senza cambiare la decisione già registrata'; END IF;
      END IF;
      IF v_d.status <> 'bozza' AND v_declared IS DISTINCT FROM v_di.declared_quantity THEN RAISE EXCEPTION 'Il dichiarato del fornitore non può essere sovrascritto'; END IF;
    END IF;
    IF v_arrived > v_base OR (v_outcome = 'ok' AND v_arrived <> v_base) THEN RAISE EXCEPTION 'La quantità supera quella da ricevere o l’esito OK non coincide'; END IF;
    IF v_outcome = 'parziale' AND (v_arrived <= 0 OR v_arrived >= v_base) THEN RAISE EXCEPTION 'Indica una quantità parziale'; END IF;
    IF lower(v_code) = lower(CASE WHEN v_new THEN v_oi.unit_code ELSE v_di.unit_code END) AND v_verified <> v_qty THEN RAISE EXCEPTION 'Quantità incoerenti nella stessa unità'; END IF;
    IF (v_new OR v_d.status = 'bozza') AND v_declared IS NOT NULL AND v_verified > v_declared THEN RAISE EXCEPTION 'Quantità buona superiore alla quantità arrivata'; END IF;
    IF v_line->>'substitute_product_id' IS NOT NULL THEN
      IF v_outcome <> 'mancante' OR (NOT v_new AND v_d.status <> 'bozza') OR v_line->>'order_item_id' IS NULL OR (v_line->>'substitute_quantity')::numeric <= 0 THEN RAISE EXCEPTION 'Sostituzione non valida'; END IF;
      SELECT * INTO v_p FROM public.products WHERE id = (v_line->>'substitute_product_id')::uuid AND company_id = v_o.company_id AND archive_id = v_o.archive_id;
      IF v_p.id IS NULL OR v_p.stock_unit_id IS NULL THEN RAISE EXCEPTION 'Prodotto sostitutivo non disponibile nell’archivio o senza unità di magazzino'; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.product_supplier_links WHERE company_id = v_o.company_id AND product_id = v_p.id AND supplier_record_id = v_o.supplier_record_id AND is_active) THEN RAISE EXCEPTION 'Collega prima il fornitore al prodotto sostitutivo'; END IF;
    END IF;
  END LOOP;
  IF v_new THEN
    IF EXISTS (SELECT 1 FROM public.purchase_order_items oi WHERE oi.order_id = _order_id AND COALESCE(oi.purchase_quantity,oi.ordered_quantity,0) > COALESCE((SELECT sum(CASE WHEN oi.purchase_quantity IS NOT NULL THEN di.accepted_purchase_quantity ELSE ri.verified_quantity END) FROM public.goods_receipt_items ri JOIN public.goods_receipts r ON r.id=ri.receipt_id LEFT JOIN public.purchase_delivery_items di ON di.id=ri.delivery_item_id WHERE ri.order_item_id=oi.id AND r.status='confermato'),0) AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_lines) x WHERE (x->>'order_item_id')::uuid=oi.id)) THEN RAISE EXCEPTION 'Controlla tutte le righe da ricevere'; END IF;
    v_id := public.open_purchase_delivery(_order_id, 'operatore_interno', NULL);
    SELECT * INTO v_d FROM public.purchase_deliveries WHERE id = v_id;
    -- Already received rows created by the legacy opener remain zero in this delivery.
    FOR v_di IN SELECT * FROM public.purchase_delivery_items WHERE delivery_id = v_id LOOP
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_lines) x WHERE (x->>'order_item_id')::uuid=v_di.order_item_id) THEN
        PERFORM public._delivery_set_item_core(v_di.id, 0, NULL, NULL, NULL, NULL, NULL, NULL, auth.uid(), NULL, 0);
      END IF;
    END LOOP;
  END IF;
  v_id := v_d.id; v_editable := v_d.status = 'bozza';
  FOR v_line IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    SELECT * INTO v_di FROM public.purchase_delivery_items WHERE delivery_id = v_id AND
      ((v_new AND order_item_id = (v_line->>'order_item_id')::uuid) OR (NOT v_new AND id = (v_line->>'delivery_item_id')::uuid));
    IF v_editable THEN
      PERFORM public._delivery_set_item_core(v_di.id, (v_line->>'declared_stock_quantity')::numeric, NULL,
        v_line->>'producer', v_line->>'lot', (v_line->>'expiry')::date, v_line->>'notes', v_line->>'missing_reason', auth.uid(), NULL, (v_line->>'arrived_quantity')::numeric);
      IF v_line->>'substitute_product_id' IS NOT NULL THEN
        SELECT * INTO v_p FROM public.products WHERE id=(v_line->>'substitute_product_id')::uuid;
        SELECT code INTO v_code FROM public.units_of_measure WHERE id=v_p.stock_unit_id;
        v_replacement := public.add_purchase_delivery_extra_item(v_id, v_p.id, (v_line->>'substitute_quantity')::numeric,
          'sostituzione', v_di.order_item_id, v_p.stock_unit_id, v_code, v_line->>'producer', v_line->>'lot', 'Sostituzione al ricevimento', NULL);
      END IF;
    END IF;
  END LOOP;
  IF v_editable THEN PERFORM public.submit_purchase_delivery(v_id, _notes, NULL); END IF;
  IF v_d.status NOT IN ('accettata','chiusa_con_rifiuti') THEN
    FOR v_line IN SELECT value FROM jsonb_array_elements(_lines) LOOP
      SELECT * INTO v_di FROM public.purchase_delivery_items WHERE delivery_id = v_id AND
        ((v_new AND order_item_id = (v_line->>'order_item_id')::uuid) OR (NOT v_new AND id = (v_line->>'delivery_item_id')::uuid));
      v_qty := (v_line->>'quantity')::numeric;
      v_basis := CASE WHEN v_di.declared_quantity IS NULL AND v_di.purchase_unit_id IS NOT NULL THEN v_qty ELSE (v_line->>'verified_quantity')::numeric END;
      IF v_line->>'outcome' = 'danneggiato' OR v_basis IS DISTINCT FROM COALESCE(v_di.declared_quantity,v_di.declared_purchase_quantity) OR EXISTS (SELECT 1 FROM public.purchase_delivery_disputes WHERE delivery_item_id=v_di.id AND status='aperta') THEN
        SELECT id INTO v_dispute FROM public.purchase_delivery_disputes WHERE delivery_item_id=v_di.id AND status='aperta' ORDER BY opened_at LIMIT 1;
        IF v_dispute IS NULL THEN
          v_reason := CASE WHEN v_line->>'outcome'='danneggiato' THEN (v_line->>'reason')::public.purchase_dispute_reason WHEN v_qty=0 THEN 'non_consegnato'::public.purchase_dispute_reason WHEN v_basis > COALESCE(v_di.declared_quantity,v_di.declared_purchase_quantity,0) THEN 'quantita_superiore'::public.purchase_dispute_reason ELSE 'quantita_inferiore'::public.purchase_dispute_reason END;
          v_dispute := public.dispute_purchase_delivery_item(v_di.id, v_reason, COALESCE(v_line->>'notes',v_line->>'missing_reason'), auth.uid());
        END IF;
        PERFORM public.resolve_purchase_delivery_dispute(v_dispute, CASE WHEN v_qty=0 THEN 'rifiutata' ELSE 'rettificata' END, v_basis, COALESCE(v_line->>'notes',v_line->>'missing_reason'), auth.uid());
      END IF;
      -- Purchase units are an independent verified value; never infer them from stock quantities.
      UPDATE public.purchase_delivery_items SET accepted_purchase_quantity = CASE WHEN purchase_unit_id IS NOT NULL THEN v_qty ELSE accepted_purchase_quantity END WHERE id=v_di.id;
    END LOOP;
    PERFORM public.accept_purchase_delivery(v_id, auth.uid());
  END IF;
  v_receipt := public.open_goods_receipt(v_id, auth.uid());
  FOR v_line IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    SELECT * INTO v_di FROM public.purchase_delivery_items WHERE delivery_id = v_id AND
      ((v_new AND order_item_id = (v_line->>'order_item_id')::uuid) OR (NOT v_new AND id = (v_line->>'delivery_item_id')::uuid));
    v_verified := (v_line->>'verified_quantity')::numeric;
    SELECT * INTO v_ri FROM public.goods_receipt_items WHERE receipt_id=v_receipt AND delivery_item_id=v_di.id;
    IF v_ri.id IS NULL AND v_verified > 0 THEN
      -- No stock equivalent in the declaration: insert only the weight explicitly measured by the receiver.
      INSERT INTO public.goods_receipt_items(company_id,receipt_id,delivery_item_id,order_item_id,product_id,verified_quantity,unit_id,unit_code,stock_unit_id)
      VALUES(v_o.company_id,v_receipt,v_di.id,v_di.order_item_id,v_di.product_id,v_verified,v_di.unit_id,v_di.unit_code,v_di.unit_id) RETURNING * INTO v_ri;
    END IF;
    IF v_ri.id IS NOT NULL THEN
      SELECT id INTO v_price_id FROM public.units_of_measure WHERE company_id=v_o.company_id AND status='attivo' AND lower(code)=lower(v_line->>'price_unit_code') ORDER BY created_at LIMIT 1;
      PERFORM public.set_goods_receipt_item(v_ri.id, v_verified, v_line->>'producer', v_line->>'lot', (v_line->>'expiry')::date,
        (v_line->>'unit_cost')::numeric, v_line->>'notes', auth.uid(), v_price_id, v_line->>'price_unit_code', (v_line->>'price_quantity')::numeric,
        v_line->>'price_unit_code' IS NULL, v_line->>'price_quantity' IS NULL);
      -- Explicit clearing must not resurrect the order's indicative price through COALESCE.
      UPDATE public.goods_receipt_items SET unit_cost=(v_line->>'unit_cost')::numeric, producer_name=v_line->>'producer',
        producer_lot_code=v_line->>'lot', expiry_date=(v_line->>'expiry')::date WHERE id=v_ri.id;
    END IF;
  END LOOP;
  PERFORM public.confirm_goods_receipt(v_receipt, auth.uid());
  INSERT INTO public.audit_events(company_id,actor_user_id,action,entity_type,entity_id,detail)
    VALUES(v_o.company_id,auth.uid(),'purchase_order.received_atomic','goods_receipt',v_receipt,
      jsonb_build_object('order_id',_order_id,'delivery_id',v_id,'request_key',_request_key));
  RETURN jsonb_build_object('receipt_id',v_receipt,'delivery_id',v_id,'duplicate',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid,jsonb,uuid,timestamptz,uuid,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid,jsonb,uuid,timestamptz,uuid,timestamptz,text) TO authenticated;
COMMENT ON FUNCTION public.receive_purchase_order(uuid,jsonb,uuid,timestamptz,uuid,timestamptz,text) IS 'Authenticated buyer-only atomic receipt; no declaration writes on page open, separate purchase/stock/price quantities, idempotent request key, existing receipt and inventory functions preserved.';
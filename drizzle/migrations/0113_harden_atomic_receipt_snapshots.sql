DO $migration$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.receive_purchase_order(uuid,jsonb,uuid,timestamptz,uuid,timestamptz,text)'::regprocedure) INTO d;
  IF position('v_replacement uuid;' IN d) = 0 OR position('LIMIT 1;' IN d) = 0 THEN RAISE EXCEPTION 'Versione della conferma non riconosciuta'; END IF;
  d := replace(d, 'v_replacement uuid;', 'v_replacement uuid; v_replacements jsonb := ''{}''::jsonb; v_receipt_version timestamptz; v_receipt_record public.goods_receipts; v_fingerprint text;');
  d := replace(d, 'IF v_seen IS NOT NULL THEN RETURN v_seen; END IF;', $r$
  v_fingerprint := md5(jsonb_build_object('lines',_lines,'delivery_id',_delivery_id,'notes',_notes)::text);
  IF v_seen IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM public.audit_events WHERE entity_id=(v_seen->>'receipt_id')::uuid AND action='purchase_order.received_atomic' AND detail->>'request_key'=_request_key::text AND detail->>'fingerprint' IS NOT NULL AND detail->>'fingerprint'<>v_fingerprint) THEN RAISE EXCEPTION 'Chiave di conferma già utilizzata con quantità diverse'; END IF;
    RETURN v_seen;
  END IF;
  $r$);
  d := replace(d, 'v_reason := (v_line->>''reason'')::public.purchase_dispute_reason;', $r$
    IF v_outcome IN ('ok','parziale') AND v_qty <> v_arrived THEN RAISE EXCEPTION 'Quantità arrivata e accettata incoerenti'; END IF;
    IF v_outcome='mancante' AND v_arrived<>0 THEN RAISE EXCEPTION 'Una riga mancante deve avere quantità arrivata zero'; END IF;
    IF (v_line->>'unit_cost')::numeric::text IN ('NaN','Infinity','-Infinity') OR (v_line->>'price_quantity')::numeric::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Prezzo non valido'; END IF;
    IF v_line->>'substitute_product_id' IS NOT NULL AND ((v_line->>'substitute_quantity')::numeric IS NULL OR (v_line->>'substitute_quantity')::numeric <= 0 OR (v_line->>'substitute_quantity')::numeric::text IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Quantità sostitutiva non valida'; END IF;
    IF v_line->>'substitute_product_id' IS NULL AND v_line->>'substitute_quantity' IS NOT NULL THEN RAISE EXCEPTION 'Prodotto sostitutivo mancante'; END IF;
    v_reason := (v_line->>'reason')::public.purchase_dispute_reason;
  $r$);
  d := replace(d, 'IF v_line->>''substitute_product_id'' IS NOT NULL THEN', $r$
    -- Existing CAR and every item carry their own optimistic snapshot, not only delivery versions.
    SELECT * INTO v_receipt_record FROM public.goods_receipts WHERE delivery_id=v_d.id FOR UPDATE;
    IF v_receipt_record.id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(v_receipt_record.id::text,0));
      SELECT * INTO v_receipt_record FROM public.goods_receipts WHERE id=v_receipt_record.id;
    END IF;
    IF v_receipt_record.id IS DISTINCT FROM (v_line->>'receipt_id')::uuid OR v_receipt_record.updated_at IS DISTINCT FROM (v_line->>'receipt_version')::timestamptz THEN RAISE EXCEPTION 'Il carico in bozza è cambiato: riapri la ricezione'; END IF;
    SELECT * INTO v_ri FROM public.goods_receipt_items WHERE receipt_id=v_receipt_record.id AND delivery_item_id=(v_line->>'delivery_item_id')::uuid FOR UPDATE;
    IF v_ri.id IS DISTINCT FROM (v_line->>'receipt_item_id')::uuid OR v_ri.updated_at IS DISTINCT FROM (v_line->>'receipt_item_version')::timestamptz THEN RAISE EXCEPTION 'Una riga del carico è cambiata: riapri la ricezione'; END IF;
    IF v_line->>'substitute_product_id' IS NOT NULL THEN
  $r$);
  -- The replacement block above occurs twice: remove snapshot checks from the post-write occurrence.
  d := replace(d, $r$
      -- Existing CAR and every item carry their own optimistic snapshot, not only delivery versions.
  $r$, $r$
      -- Existing CAR and every item carry their own optimistic snapshot, not only delivery versions.
  $r$);
  d := replace(d, $r$
          'sostituzione', v_di.order_item_id, v_p.stock_unit_id, v_code, v_line->>'producer', v_line->>'lot', 'Sostituzione al ricevimento', NULL);
  $r$, $r$
          'sostituzione', v_di.order_item_id, v_p.stock_unit_id, v_code, v_line->>'producer', v_line->>'lot', 'Sostituzione al ricevimento', NULL);
        v_replacements := v_replacements || jsonb_build_object(v_di.id::text, v_replacement);
  $r$);
  d := replace(d, $r$
        PERFORM public.resolve_purchase_delivery_dispute(v_dispute, CASE WHEN v_qty=0 THEN 'rifiutata' ELSE 'rettificata' END, v_basis, COALESCE(v_line->>'notes',v_line->>'missing_reason'), auth.uid());
  $r$, $r$
        FOR v_dispute IN SELECT id FROM public.purchase_delivery_disputes WHERE delivery_item_id=v_di.id AND status='aperta' ORDER BY opened_at FOR UPDATE LOOP
          PERFORM public.resolve_purchase_delivery_dispute(v_dispute, CASE WHEN v_qty=0 THEN 'rifiutata' ELSE 'rettificata' END, v_basis, COALESCE(v_line->>'notes',v_line->>'missing_reason'), auth.uid());
        END LOOP;
  $r$);
  d := replace(d, 'IF v_ri.id IS NULL AND v_verified > 0 THEN', $r$
    IF v_ri.id IS NULL AND v_verified > 0 THEN
      IF v_di.status='rifiutata' OR v_di.accepted_quantity IS NOT NULL OR v_di.declared_quantity IS NOT NULL OR v_di.purchase_unit_id IS NULL OR COALESCE(v_di.accepted_purchase_quantity,0)<=0 THEN RAISE EXCEPTION 'Riga non ammessa al carico: quantità accettata o unità incoerenti'; END IF;
  $r$);
  d := replace(d, 'PERFORM public.confirm_goods_receipt(v_receipt, auth.uid());', $r$
  -- Explicitly finalize substitute rows and retain their original-order supplier context.
  FOR v_line IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    SELECT * INTO v_di FROM public.purchase_delivery_items WHERE delivery_id=v_id AND ((v_new AND order_item_id=(v_line->>'order_item_id')::uuid) OR (NOT v_new AND id=(v_line->>'delivery_item_id')::uuid));
    v_replacement := (v_replacements->>v_di.id::text)::uuid;
    IF v_replacement IS NOT NULL THEN
      SELECT * INTO v_ri FROM public.goods_receipt_items WHERE receipt_id=v_receipt AND delivery_item_id=v_replacement;
      IF v_ri.id IS NULL THEN RAISE EXCEPTION 'Riga sostitutiva non presente nel carico'; END IF;
      UPDATE public.goods_receipt_items SET order_item_id=(v_line->>'order_item_id')::uuid WHERE id=v_ri.id;
      PERFORM public.set_goods_receipt_item(v_ri.id,(v_line->>'substitute_quantity')::numeric,v_line->>'producer',v_line->>'lot',(v_line->>'expiry')::date,NULL,'Sostituzione al ricevimento',auth.uid(),NULL,NULL,NULL,true,true);
      UPDATE public.goods_receipt_items SET unit_cost=NULL,expiry_date=(v_line->>'expiry')::date WHERE id=v_ri.id;
    END IF;
  END LOOP;
  PERFORM public.confirm_goods_receipt(v_receipt, auth.uid());
  IF v_replacements <> '{}'::jsonb THEN
    -- Original missing goods remain outstanding; a substitute's different units never close them.
    UPDATE public.purchase_orders SET status='parzialmente_consegnato' WHERE id=_order_id;
  END IF;
  $r$);
  d := replace(d, '''request_key'',_request_key)', '''request_key'',_request_key,''fingerprint'',v_fingerprint)');
  -- Remove the second inserted snapshot block (after delivery writes), retaining validation only.
  DECLARE marker text := '    -- Existing CAR and every item carry their own optimistic snapshot, not only delivery versions.'; first_pos integer; second_pos integer; end_pos integer;
  BEGIN
    first_pos := strpos(d,marker);
    second_pos := CASE WHEN first_pos>0 THEN strpos(substr(d,first_pos+length(marker)),marker) ELSE 0 END;
    IF second_pos>0 THEN
      second_pos := first_pos+length(marker)+second_pos-1;
      end_pos := second_pos+strpos(substr(d,second_pos),'    IF v_line->>''substitute_product_id'' IS NOT NULL THEN')-1;
      d := substr(d,1,second_pos-1)||substr(d,end_pos);
    END IF;
  END;
  EXECUTE d;
END;
$migration$;
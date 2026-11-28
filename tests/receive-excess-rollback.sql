-- Authorized 3 EMME test fixtures only. No real order is changed, no supplier message.
-- Fixture setup uses the tool session; every receipt invocation runs as authenticated.
-- Every scenario (including a successful receipt) is rolled back by a subtransaction.
DO $test$
DECLARE
  v_company uuid := '052667cd-c742-43b4-87f9-02ef0527a1d5';
  v_actor uuid := 'b9db9303-4b9d-4135-a8d5-94bfb6fa5758';
  v_archive uuid; v_location uuid; v_product uuid; v_kg uuid; v_pz uuid;
  v_seller uuid; v_supplier uuid; v_relation uuid; v_order uuid; v_item uuid; v_doc uuid;
  v_delivery uuid; v_delivery_item uuid; v_key uuid; v_version timestamptz; v_delivery_version timestamptz;
  v_line jsonb; v_lines jsonb; v_result jsonb; v_duplicate jsonb; v_error text;
  v_before jsonb := '{}'::jsonb; v_after jsonb := '{}'::jsonb; v_hash text; v_table record;
  v_case integer; v_passed integer := 0; v_qty numeric; v_receipt uuid; v_expected text;
  v_fixture_tables integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=v_company AND legal_name='3 EMME ROMA SRL')
    OR NOT EXISTS(SELECT 1 FROM public.company_members WHERE company_id=v_company AND user_id=v_actor AND status='attivo') THEN
    RAISE EXCEPTION 'Azienda/account di prova non disponibili';
  END IF;
  SELECT p.id,p.archive_id,p.stock_unit_id INTO v_product,v_archive,v_kg
    FROM public.products p JOIN public.units_of_measure u ON u.id=p.stock_unit_id
    WHERE p.company_id=v_company AND lower(u.code)='kg' LIMIT 1;
  SELECT id INTO v_pz FROM public.units_of_measure WHERE company_id=v_company AND lower(code)='pz' AND status='attivo' LIMIT 1;
  SELECT id INTO v_location FROM public.inventory_locations WHERE company_id=v_company LIMIT 1;
  IF v_product IS NULL OR v_kg IS NULL OR v_pz IS NULL OR v_location IS NULL THEN RAISE EXCEPTION 'Configurazione prova incompleta'; END IF;
  -- Snapshot every company_id base table (including document counters) without reading other companies.
  FOR v_table IN SELECT DISTINCT c.table_name FROM information_schema.columns c JOIN information_schema.tables t
      ON t.table_schema=c.table_schema AND t.table_name=c.table_name
      WHERE c.table_schema='public' AND c.column_name='company_id' AND t.table_type='BASE TABLE' ORDER BY c.table_name LOOP
    EXECUTE format('SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,''[]'')) FROM public.%I t WHERE company_id=$1',v_table.table_name) INTO v_hash USING v_company;
    v_before := v_before || jsonb_build_object(v_table.table_name,v_hash);
  END LOOP;
  v_before := v_before || jsonb_build_object('documents',(SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM public.supplier_delivery_documents t WHERE buyer_company_id=v_company),
    'company',(SELECT md5(to_jsonb(c)::text) FROM public.companies c WHERE id=v_company),
    'suppliers',(SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM public.supplier_records t WHERE buyer_company_id=v_company),
    'relations',(SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM public.supplier_customer_relations t WHERE buyer_company_id=v_company));
  SELECT count(*) INTO v_fixture_tables FROM public.companies WHERE legal_name LIKE 'ROLLBACK ECCEDENZA %';
  FOR v_case IN 1..12 LOOP
    v_error := NULL; v_delivery := NULL; v_delivery_version := NULL; v_qty := CASE WHEN v_case=6 THEN 1.60 ELSE 1.55 END;
    BEGIN
      -- All these rows are temporary and rolled back, never copies of operational orders.
      INSERT INTO public.companies(legal_name,created_by,can_buy) VALUES('ROLLBACK ECCEDENZA '||gen_random_uuid(),v_actor,true) RETURNING id INTO v_seller;
      INSERT INTO public.supplier_records(buyer_company_id,archive_id,legal_name) VALUES(v_company,v_archive,'Fornitore prova rollback') RETURNING id INTO v_supplier;
      INSERT INTO public.supplier_customer_relations(seller_company_id,buyer_company_id,supplier_record_id,status,seller_enabled,buyer_enabled)
        VALUES(v_seller,v_company,v_supplier,'in_attesa',false,false) RETURNING id INTO v_relation;
      INSERT INTO public.purchase_orders(company_id,archive_id,supplier_record_id,relation_id,destination_location_id,number,created_by)
        VALUES(v_company,v_archive,v_supplier,v_relation,v_location,'TEST-EXCESS-'||gen_random_uuid(),v_actor) RETURNING id INTO v_order;
      INSERT INTO public.purchase_order_items(company_id,order_id,product_id,ordered_quantity,unit_id,unit_code,purchase_quantity,purchase_unit_id,purchase_unit_code,stock_unit_id,conversion_mode,supplier_product_code,price_unit_id,price_unit_code,unit_cost)
        VALUES(v_company,v_order,v_product,1,CASE WHEN v_case=4 THEN v_pz ELSE v_kg END,CASE WHEN v_case=4 THEN 'pz' ELSE 'kg' END,1,CASE WHEN v_case=4 THEN v_pz ELSE v_kg END,CASE WHEN v_case=4 THEN 'pz' WHEN v_case=9 THEN 'cs' ELSE 'kg' END,v_kg,'stessa','TEST-KG',v_kg,'kg',99) RETURNING id,updated_at INTO v_item,v_version;
      -- Local fixture status only; no send RPC, export or external endpoint.
      UPDATE public.purchase_orders SET status='inviato' WHERE id=v_order;
      INSERT INTO public.supplier_delivery_documents(source,external_id,seller_company_id,doc_type,purchase_order_id,buyer_company_id,link_status,doc_number,lines)
        VALUES('trevi_incassi','rollback-'||gen_random_uuid(),CASE WHEN v_case=11 THEN v_company ELSE v_seller END,CASE WHEN v_case=12 THEN 'preventivo' ELSE 'ddt' END,v_order,CASE WHEN v_case=7 THEN v_seller ELSE v_company END,'collegato','TEST-DDT',
          CASE WHEN v_case=10 THEN '[{"code":"TEST-KG","qty":1.55,"um":"kg","price":3.5},{"code":"TEST-KG","qty":1.55,"um":"kg","price":3.5}]'::jsonb ELSE '[{"code":"TEST-KG","qty":1.55,"um":"kg","price":3.5}]'::jsonb END) RETURNING id INTO v_doc;
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
      PERFORM set_config('role','authenticated',true);
      IF v_case=5 THEN
        v_delivery := public.open_purchase_delivery(v_order,'operatore_interno',NULL);
        PERFORM public.submit_purchase_delivery(v_delivery,NULL,NULL);
        -- Change only the newly-created fixture's origin, not any real declaration.
        PERFORM set_config('role','none',true);
        UPDATE public.purchase_deliveries SET origin='fornitore_b2b' WHERE id=v_delivery;
        PERFORM set_config('role','authenticated',true);
        SELECT id,updated_at INTO v_delivery_item,v_version FROM public.purchase_delivery_items WHERE delivery_id=v_delivery;
        SELECT updated_at INTO v_delivery_version FROM public.purchase_deliveries WHERE id=v_delivery;
      END IF;
      v_line := jsonb_build_object('order_item_id',v_item,'delivery_item_id',CASE WHEN v_case=5 THEN v_delivery_item ELSE NULL END,'version',v_version,
        'receipt_id',NULL,'receipt_version',NULL,'receipt_item_id',NULL,'receipt_item_version',NULL,
        'outcome',CASE WHEN v_case=2 THEN 'ok' ELSE 'eccedenza' END,'quantity',v_qty,'arrived_quantity',v_qty,'verified_quantity',v_qty,
        'declared_stock_quantity',CASE WHEN v_case=5 THEN 1 ELSE v_qty END,'excess_confirmed',v_case<>3,'ddt_document_id',v_doc,
        'unit_cost',3.5,'price_unit_code','kg','price_quantity',v_qty,'reason','qualita','substitute_product_id',NULL,'substitute_quantity',NULL);
      v_lines := jsonb_build_array(v_line); v_key := gen_random_uuid();
      SELECT updated_at INTO v_version FROM public.purchase_orders WHERE id=v_order;
      IF current_user <> 'authenticated' OR auth.uid() IS DISTINCT FROM v_actor THEN RAISE EXCEPTION 'Ruolo di prova non autenticato'; END IF;
      BEGIN
        v_result := public.receive_purchase_order(v_order,v_lines,v_key,v_version,v_delivery,v_delivery_version,NULL);
      EXCEPTION WHEN OTHERS THEN v_error := SQLERRM;
      END;
      IF v_case IN (1,8) THEN
        IF v_error IS NOT NULL THEN RAISE EXCEPTION 'Caso %: carico valido rifiutato: %',v_case,v_error; END IF;
        v_receipt := (v_result->>'receipt_id')::uuid;
        IF NOT EXISTS(SELECT 1 FROM public.goods_receipts WHERE id=v_receipt AND status='confermato') THEN RAISE EXCEPTION 'Carico non confermato'; END IF;
        IF NOT EXISTS(SELECT 1 FROM public.goods_receipt_items WHERE receipt_id=v_receipt AND verified_quantity=1.55 AND unit_cost=3.5 AND price_quantity=1.55 AND price_unit_code='kg') THEN RAISE EXCEPTION 'Peso/prezzo carico errato'; END IF;
        IF NOT EXISTS(SELECT 1 FROM public.stock_lots l JOIN public.goods_receipt_items ri ON ri.id=l.goods_receipt_item_id WHERE ri.receipt_id=v_receipt AND l.initial_quantity=1.55 AND l.unit_cost=3.5 AND l.unit_code='kg') THEN RAISE EXCEPTION 'Peso/costo lotto errato'; END IF;
        IF NOT EXISTS(SELECT 1 FROM public.inventory_movements m JOIN public.stock_lots l ON l.id=m.stock_lot_id JOIN public.goods_receipt_items ri ON ri.id=l.goods_receipt_item_id WHERE ri.receipt_id=v_receipt AND m.quantity=1.55 AND m.unit_code='kg') THEN RAISE EXCEPTION 'Movimento errato'; END IF;
        IF NOT EXISTS(SELECT 1 FROM public.purchase_orders WHERE id=v_order AND status='consegnato') THEN RAISE EXCEPTION 'Ordine non consegnato'; END IF;
        IF (SELECT GREATEST(0,oi.purchase_quantity-COALESCE(sum(di.accepted_purchase_quantity),0)) FROM public.purchase_order_items oi JOIN public.purchase_delivery_items di ON di.order_item_id=oi.id WHERE oi.id=v_item GROUP BY oi.purchase_quantity) <> 0 THEN RAISE EXCEPTION 'Residuo non zero'; END IF;
        IF EXISTS(SELECT 1 FROM public.purchase_delivery_disputes dd JOIN public.purchase_delivery_items di ON di.id=dd.delivery_item_id JOIN public.purchase_deliveries d ON d.id=di.delivery_id WHERE d.order_id=v_order) THEN RAISE EXCEPTION 'Contestazione non prevista'; END IF;
        IF NOT EXISTS(SELECT 1 FROM public.audit_events WHERE entity_id=v_receipt AND detail->'excess_lines'->0->>'ddt_document_id'=v_doc::text) THEN RAISE EXCEPTION 'Audit eccedenza assente'; END IF;
        IF v_case=8 THEN
          v_duplicate := public.receive_purchase_order(v_order,v_lines,v_key,v_version,NULL,NULL,NULL);
          IF v_duplicate->>'duplicate' IS DISTINCT FROM 'true' OR v_duplicate->>'receipt_id' IS DISTINCT FROM v_result->>'receipt_id' THEN RAISE EXCEPTION 'Conferma ripetuta non idempotente'; END IF;
          IF (SELECT count(*) FROM public.goods_receipts WHERE order_id=v_order)<>1 THEN RAISE EXCEPTION 'Carico duplicato'; END IF;
        END IF;
      ELSE
        v_expected := CASE v_case WHEN 2 THEN 'esito OK non coincide' WHEN 3 THEN 'conferma esplicita' WHEN 4 THEN 'solo in kg' WHEN 5 THEN 'consegna già dichiarata' WHEN 6 THEN 'superiore al DDT' WHEN 7 THEN 'non appartenente' WHEN 9 THEN 'solo in kg' WHEN 10 THEN 'mancante o ripetuta' WHEN 11 THEN 'non appartenente' WHEN 12 THEN 'non appartenente' END;
        IF v_error IS NULL OR position(v_expected IN v_error)=0 THEN RAISE EXCEPTION 'Caso %: atteso %, ottenuto %',v_case,v_expected,v_error; END IF;
        IF EXISTS(SELECT 1 FROM public.goods_receipts WHERE order_id=v_order) THEN RAISE EXCEPTION 'Carico persistito dopo errore'; END IF;
        IF v_case<>5 AND EXISTS(SELECT 1 FROM public.purchase_deliveries WHERE order_id=v_order) THEN RAISE EXCEPTION 'Scrittura prima della validazione'; END IF;
      END IF;
      RAISE EXCEPTION USING ERRCODE='PZ001',MESSAGE='Intentional scenario rollback';
    EXCEPTION WHEN SQLSTATE 'PZ001' THEN v_passed := v_passed+1;
    END;
    RAISE NOTICE 'PASS SQL case % (rollback)',v_case;
  END LOOP;
  FOR v_table IN SELECT DISTINCT c.table_name FROM information_schema.columns c JOIN information_schema.tables t
      ON t.table_schema=c.table_schema AND t.table_name=c.table_name
      WHERE c.table_schema='public' AND c.column_name='company_id' AND t.table_type='BASE TABLE' ORDER BY c.table_name LOOP
    EXECUTE format('SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,''[]'')) FROM public.%I t WHERE company_id=$1',v_table.table_name) INTO v_hash USING v_company;
    v_after := v_after || jsonb_build_object(v_table.table_name,v_hash);
  END LOOP;
  v_after := v_after || jsonb_build_object('documents',(SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM public.supplier_delivery_documents t WHERE buyer_company_id=v_company),
    'company',(SELECT md5(to_jsonb(c)::text) FROM public.companies c WHERE id=v_company),
    'suppliers',(SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM public.supplier_records t WHERE buyer_company_id=v_company),
    'relations',(SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM public.supplier_customer_relations t WHERE buyer_company_id=v_company));
  IF v_passed<>12 OR v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'Rollback o numero di test errato'; END IF;
  IF (SELECT count(*) FROM public.companies WHERE legal_name LIKE 'ROLLBACK ECCEDENZA %')<>v_fixture_tables THEN RAISE EXCEPTION 'Azienda prova residua'; END IF;
  RAISE NOTICE 'PASS: 12 SQL tests; all company tables, documents, relations, suppliers and company unchanged';
END;
$test$;

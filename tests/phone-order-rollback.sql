-- Authorized 3 EMME test fixtures only (buyer). The seller is a temporary company; every scenario is rolled back.
-- No real Trevi data, no Danea call, no supplier message. RPCs run as authenticated.
DO $test$
DECLARE
  v_company uuid := '052667cd-c742-43b4-87f9-02ef0527a1d5';
  v_actor uuid := 'b9db9303-4b9d-4135-a8d5-94bfb6fa5758';
  v_archive uuid; v_location uuid; v_product uuid; v_seller uuid; v_sarchive uuid; v_sp uuid; v_sp2 uuid; v_supplier uuid;
  v_cr uuid; v_rel uuid; v_link uuid; v_link2 uuid; v_other_link uuid; v_doc uuid; v_order uuid; v_order2 uuid; v_err text; v_pending jsonb;
  v_case int; v_passed int := 0; v_before jsonb := '{}'; v_after jsonb := '{}'; v_hash text; t record; v_user uuid; v_lines jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=v_company AND legal_name='3 EMME ROMA SRL') THEN RAISE EXCEPTION 'Azienda di prova assente'; END IF;
  SELECT p.id,p.archive_id INTO v_product,v_archive FROM public.products p WHERE p.company_id=v_company LIMIT 1;
  FOR t IN SELECT DISTINCT c.table_name FROM information_schema.columns c JOIN information_schema.tables tt ON tt.table_schema=c.table_schema AND tt.table_name=c.table_name
      WHERE c.table_schema='public' AND c.column_name='company_id' AND tt.table_type='BASE TABLE' ORDER BY 1 LOOP
    EXECUTE format('SELECT md5(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,''[]'')) FROM public.%I x WHERE company_id=$1',t.table_name) INTO v_hash USING v_company;
    v_before := v_before || jsonb_build_object(t.table_name,v_hash);
  END LOOP;
  v_before := v_before || jsonb_build_object('docs',(SELECT count(*) FROM public.supplier_delivery_documents),'orders',(SELECT count(*) FROM public.purchase_orders),'relations',(SELECT md5(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'')) FROM public.supplier_customer_relations x));

  -- Danea exclusion is a filter on every export path.
  IF (SELECT count(*) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('danea_orders_export_candidates','danea_export_orders_priced','danea_mark_orders_exported','danea_reserve_order_numbers')
      AND pg_get_functiondef(p.oid) LIKE '%po.origin <> ''telefonico_ddt''%') <> 5 THEN RAISE EXCEPTION 'Filtro Danea mancante'; END IF;
  RAISE NOTICE 'PASS Danea: 5 funzioni di scarico escludono gli ordini telefonici';

  FOR v_case IN 1..8 LOOP
    v_err := NULL;
    BEGIN
      INSERT INTO public.companies(legal_name,created_by,can_buy) VALUES('ROLLBACK TELEFONO '||gen_random_uuid(),v_actor,true) RETURNING id INTO v_seller;
      -- The tester acts as a plain active member of the temporary seller (no admin role) except in cases 3/4.
      IF v_case NOT IN (3,4) THEN
        -- Bootstrap path of the collaboration guard for the temporary seller only (creator = tester), no roles.
        PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
        PERFORM set_config('app.collaboration_mode','bootstrap',true); PERFORM set_config('app.collaboration_company',v_seller::text,true);
        INSERT INTO public.company_members(company_id,user_id) VALUES(v_seller,v_actor);
        PERFORM set_config('app.collaboration_mode','',true); PERFORM set_config('app.collaboration_company','',true);
      END IF;
      INSERT INTO public.danea_archives(company_id,name) VALUES(v_seller,'Prova') RETURNING id INTO v_sarchive;
      INSERT INTO public.products(company_id,archive_id,code,description) VALUES(v_seller,v_sarchive,'TEL-A','Mele prova') RETURNING id INTO v_sp;
      INSERT INTO public.products(company_id,archive_id,code,description) VALUES(v_seller,v_sarchive,'TEL-B','Pere prova') RETURNING id INTO v_sp2;
      INSERT INTO public.supplier_records(buyer_company_id,archive_id,legal_name) VALUES(v_company,v_archive,'Fornitore telefono prova') RETURNING id INTO v_supplier;
      INSERT INTO public.customer_records(seller_company_id,legal_name,internal_reference) VALUES(v_seller,'3 EMME prova','T-0758') RETURNING id INTO v_cr;
      INSERT INTO public.supplier_customer_relations(seller_company_id,buyer_company_id,supplier_record_id,customer_record_id,status,seller_enabled,buyer_enabled)
        VALUES(v_seller,v_company,v_supplier,v_cr,'attivo',true,true) RETURNING id INTO v_rel;
      INSERT INTO public.product_supplier_links(company_id,product_id,supplier_record_id,supplier_company_id,b2b_item_id) VALUES(v_company,v_product,v_supplier,v_seller,v_sp) RETURNING id INTO v_link;
      INSERT INTO public.product_supplier_links(company_id,product_id,supplier_record_id,supplier_company_id,b2b_item_id,supplier_reference_label) VALUES(v_company,v_product,v_supplier,v_seller,v_sp2,'B') RETURNING id INTO v_link2;
      v_lines := CASE v_case
        WHEN 2 THEN '[{"code":"TEL-A","qty":2,"um":"kg","um_normalized":"kg","price":1.5},{"code":"SCONOSCIUTO","qty":1,"um":"pz","um_normalized":"pz","price":3}]'
        WHEN 8 THEN '[{"code":"TEL-A","qty":2,"um":"cs?","um_normalized":null,"price":1.5}]'
        ELSE '[{"code":"TEL-A","qty":2.4,"um":"kg","um_normalized":"kg","price":1.5}]' END::jsonb;
      INSERT INTO public.supplier_delivery_documents(source,external_id,seller_company_id,doc_type,doc_number,doc_date,customer_code,link_status,link_reason,lines)
        VALUES('trevi_incassi','rollback-tel-'||gen_random_uuid(),v_seller,'ddt','TEL-1','2026-11-28','T-0758','da_controllare','riferimento_mancante',v_lines) RETURNING id INTO v_doc;
      IF v_case=6 THEN
        INSERT INTO public.purchase_orders(company_id,archive_id,supplier_record_id,relation_id,destination_location_id,number,status,sent_at,delivery_date)
          VALUES(v_company,v_archive,v_supplier,v_rel,public.ensure_default_inventory_location(v_company,NULL),'TEST-TEL-ESISTENTE','inviato',now(),'2026-11-28');
      END IF;
      -- Read before switching role: RLS would hide another company's link.
      SELECT id INTO v_other_link FROM public.product_supplier_links WHERE company_id<>v_company LIMIT 1;
      IF v_other_link IS NULL THEN RAISE EXCEPTION 'Collegamento esterno di confronto assente'; END IF;
      v_user := CASE WHEN v_case=3 THEN gen_random_uuid() ELSE v_actor END;
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
      PERFORM set_config('role','authenticated',true);
      v_pending := public.incassi_pending_documents();
      BEGIN
        IF v_case=2 THEN
          BEGIN PERFORM public.create_phone_order_from_document(v_doc,'{}'::jsonb); EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
          IF position('Righe da abbinare' IN coalesce(v_err,''))=0 THEN RAISE EXCEPTION 'Caso 2: atteso blocco righe, ottenuto %',v_err; END IF;
          IF EXISTS(SELECT 1 FROM public.purchase_orders WHERE source_document_id=v_doc) THEN RAISE EXCEPTION 'Caso 2: scrittura prima del blocco'; END IF;
          v_err := NULL; v_order := public.create_phone_order_from_document(v_doc, jsonb_build_object('1',v_link2));
        ELSIF v_case=7 THEN
          v_order := public.create_phone_order_from_document(v_doc, jsonb_build_object('0',v_other_link));
        ELSE
          v_order := public.create_phone_order_from_document(v_doc,'{}'::jsonb);
        END IF;
      EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; v_order := NULL;
      END;
      PERFORM set_config('role','postgres',true);
      IF v_case IN (1,2,5,6) THEN
        IF v_err IS NOT NULL THEN RAISE EXCEPTION 'Caso %: errore %',v_case,v_err; END IF;
        IF jsonb_path_query_first(v_pending, '$[*] ? (@.id == $d)', jsonb_build_object('d',v_doc)) IS NULL THEN RAISE EXCEPTION 'Caso %: DDT non visibile al fornitore',v_case; END IF;
        IF NOT EXISTS(SELECT 1 FROM public.purchase_orders WHERE id=v_order AND company_id=v_company AND origin='telefonico_ddt' AND source_document_id=v_doc AND status='inviato' AND relation_id=v_rel AND delivery_date='2026-11-28') THEN RAISE EXCEPTION 'Caso %: ordine errato',v_case; END IF;
        IF NOT EXISTS(SELECT 1 FROM public.supplier_delivery_documents WHERE id=v_doc AND purchase_order_id=v_order AND buyer_company_id=v_company AND link_status='collegato') THEN RAISE EXCEPTION 'Caso %: DDT non collegato',v_case; END IF;
        IF v_case=1 THEN
          IF NOT EXISTS(SELECT 1 FROM public.purchase_order_items WHERE order_id=v_order AND product_supplier_link_id=v_link AND ordered_quantity=2.4 AND unit_code='kg' AND unit_cost=1.5) THEN RAISE EXCEPTION 'Caso 1: riga/prezzo DDT errati'; END IF;
          PERFORM set_config('role','authenticated',true);
          BEGIN PERFORM public.create_phone_order_from_document(v_doc,'{}'::jsonb); v_err := NULL; EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
          PERFORM set_config('role','postgres',true);
          IF position('esiste già' IN coalesce(v_err,''))=0 THEN RAISE EXCEPTION 'Caso 1: secondo ordine non bloccato (%)',v_err; END IF;
          UPDATE public.supplier_delivery_documents SET purchase_order_id=NULL, buyer_company_id=NULL, link_status='da_controllare', link_reason='riferimento_mancante' WHERE id=v_doc;
          IF NOT EXISTS(SELECT 1 FROM public.supplier_delivery_documents WHERE id=v_doc AND purchase_order_id=v_order) THEN RAISE EXCEPTION 'Caso 1: reinvio DDT stacca l''ordine'; END IF;
          IF (SELECT count(*) FROM public.purchase_orders WHERE source_document_id=v_doc)<>1 THEN RAISE EXCEPTION 'Caso 1: più ordini per DDT'; END IF;
        END IF;
        IF v_case=2 AND (SELECT count(*) FROM public.purchase_order_items WHERE order_id=v_order)<>2 THEN RAISE EXCEPTION 'Caso 2: righe mancanti'; END IF;
        IF v_case=6 AND jsonb_path_query_first(v_pending, '$[*] ? (@.id == $d).existing_order_number', jsonb_build_object('d',v_doc)) #>> '{}' <> 'TEST-TEL-ESISTENTE' THEN RAISE EXCEPTION 'Caso 6: avviso ordine esistente assente'; END IF;
      ELSE
        IF v_err IS NULL OR position(CASE v_case WHEN 3 THEN 'Non autorizzato' WHEN 4 THEN 'Non autorizzato' WHEN 7 THEN 'Righe da abbinare' WHEN 8 THEN 'U.M.' END IN v_err)=0 THEN RAISE EXCEPTION 'Caso %: errore atteso non ottenuto (%)',v_case,v_err; END IF;
        IF EXISTS(SELECT 1 FROM public.purchase_orders WHERE source_document_id=v_doc) THEN RAISE EXCEPTION 'Caso %: ordine creato',v_case; END IF;
        IF v_case IN (3,4) AND jsonb_path_query_first(v_pending, '$[*] ? (@.id == $d)', jsonb_build_object('d',v_doc)) IS NOT NULL THEN RAISE EXCEPTION 'Caso %: DDT visibile a chi non è del fornitore',v_case; END IF;
      END IF;
      RAISE EXCEPTION USING ERRCODE='PZ001', MESSAGE='rollback';
    EXCEPTION WHEN SQLSTATE 'PZ001' THEN v_passed := v_passed+1;
    END;
    RAISE NOTICE 'PASS caso % (rollback)', v_case;
  END LOOP;
  FOR t IN SELECT DISTINCT c.table_name FROM information_schema.columns c JOIN information_schema.tables tt ON tt.table_schema=c.table_schema AND tt.table_name=c.table_name
      WHERE c.table_schema='public' AND c.column_name='company_id' AND tt.table_type='BASE TABLE' ORDER BY 1 LOOP
    EXECUTE format('SELECT md5(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,''[]'')) FROM public.%I x WHERE company_id=$1',t.table_name) INTO v_hash USING v_company;
    v_after := v_after || jsonb_build_object(t.table_name,v_hash);
  END LOOP;
  v_after := v_after || jsonb_build_object('docs',(SELECT count(*) FROM public.supplier_delivery_documents),'orders',(SELECT count(*) FROM public.purchase_orders),'relations',(SELECT md5(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'')) FROM public.supplier_customer_relations x));
  IF v_passed<>8 OR v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'Rollback incompleto o test mancanti'; END IF;
  IF EXISTS(SELECT 1 FROM public.companies WHERE legal_name LIKE 'ROLLBACK TELEFONO %') THEN RAISE EXCEPTION 'Azienda prova residua'; END IF;
  RAISE NOTICE 'PASS: 8 casi + filtro Danea; dati 3 EMME, documenti, ordini e collegamenti invariati';
END $test$;

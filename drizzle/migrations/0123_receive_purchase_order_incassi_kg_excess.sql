DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  -- Patch the live definition rather than reverting receipt hardening after 0112.
  v_definition := pg_get_functiondef('public.receive_purchase_order(uuid,jsonb,uuid,timestamptz,uuid,timestamptz,text)'::regprocedure);
  IF position('v_excess_lines' IN v_definition) > 0 THEN RAISE EXCEPTION 'Eccedenza già presente: verificare la definizione'; END IF;
  v_old := 'v_new boolean;';
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Dichiarazioni ricezione non riconosciute'; END IF;
  v_definition := replace(v_definition,v_old,'v_ddt public.supplier_delivery_documents; v_ddt_line jsonb; v_ddt_count integer; v_ddt_qty numeric; v_excess_lines jsonb := ''[]''::jsonb; v_new boolean;');
  v_old := 'v_outcome NOT IN (''ok'',''parziale'',''mancante'',''danneggiato'')';
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Esiti ricezione non riconosciuti'; END IF;
  v_definition := replace(v_definition,v_old,'v_outcome NOT IN (''ok'',''parziale'',''mancante'',''danneggiato'',''eccedenza'')');
  v_old := 'IF v_arrived > v_base OR (v_outcome = ''ok'' AND v_arrived <> v_base) THEN RAISE EXCEPTION ''La quantità supera quella da ricevere o l’esito OK non coincide''; END IF;';
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Limite ricezione non riconosciuto'; END IF;
  v_new := $block$IF (v_arrived > v_base AND v_outcome <> 'eccedenza') OR (v_outcome = 'ok' AND v_arrived <> v_base) THEN RAISE EXCEPTION 'La quantità supera quella da ricevere o l’esito OK non coincide'; END IF;
    IF v_outcome = 'eccedenza' THEN
      IF NOT v_new THEN RAISE EXCEPTION 'Eccedenza non valida: consegna già dichiarata'; END IF;
      IF lower(btrim(COALESCE(v_code,''))) <> 'kg' OR lower(btrim(COALESCE(v_oi.unit_code,''))) <> 'kg' THEN
        RAISE EXCEPTION 'Eccedenza non valida: consentita solo in kg nella stessa unità di magazzino';
      END IF;
      IF v_arrived <= v_base OR v_arrived <= COALESCE(v_oi.purchase_quantity,v_oi.ordered_quantity,0)
        OR v_qty <> v_arrived OR v_verified <> v_arrived OR v_declared IS DISTINCT FROM v_arrived THEN
        RAISE EXCEPTION 'Eccedenza non valida: quantità arrivata, buona e di magazzino devono coincidere e superare l’ordinato';
      END IF;
      IF v_line->'excess_confirmed' IS DISTINCT FROM 'true'::jsonb OR NULLIF(v_line->>'ddt_document_id','') IS NULL THEN
        RAISE EXCEPTION 'Eccedenza non valida: conferma esplicita e documento obbligatori';
      END IF;
      SELECT d.* INTO v_ddt FROM public.supplier_delivery_documents d
        JOIN public.supplier_customer_relations rel ON rel.id=v_o.relation_id
          AND rel.buyer_company_id=v_o.company_id AND rel.supplier_record_id=v_o.supplier_record_id
          AND rel.seller_company_id=d.seller_company_id
        WHERE d.id=(v_line->>'ddt_document_id')::uuid AND d.source='trevi_incassi' AND d.doc_type='ddt'
          AND d.purchase_order_id=_order_id AND d.buyer_company_id=v_o.company_id
          AND d.link_status='collegato' AND d.consegna_stato IS DISTINCT FROM 'non_consegnato'
        FOR SHARE OF d;
      IF v_ddt.id IS NULL THEN RAISE EXCEPTION 'Eccedenza non valida: DDT non appartenente a ordine, azienda e fornitore'; END IF;
      IF (SELECT count(*) FROM public.supplier_delivery_documents d WHERE d.purchase_order_id=_order_id
          AND d.buyer_company_id=v_o.company_id AND d.consegna_stato IS DISTINCT FROM 'non_consegnato') <> 1 THEN
        RAISE EXCEPTION 'Eccedenza non valida: più documenti da controllare';
      END IF;
      IF NULLIF(btrim(v_oi.supplier_product_code),'') IS NULL OR
        (SELECT count(*) FROM public.purchase_order_items oi WHERE oi.order_id=_order_id
          AND upper(btrim(oi.supplier_product_code))=upper(btrim(v_oi.supplier_product_code))) <> 1 THEN
        RAISE EXCEPTION 'Eccedenza non valida: codice articolo mancante o ripetuto nell’ordine';
      END IF;
      SELECT count(*) INTO v_ddt_count FROM jsonb_array_elements(v_ddt.lines) x
        WHERE upper(btrim(x->>'code'))=upper(btrim(v_oi.supplier_product_code));
      IF v_ddt_count <> 1 THEN RAISE EXCEPTION 'Eccedenza non valida: riga DDT mancante o ripetuta'; END IF;
      SELECT x INTO v_ddt_line FROM jsonb_array_elements(v_ddt.lines) x
        WHERE upper(btrim(x->>'code'))=upper(btrim(v_oi.supplier_product_code));
      IF lower(btrim(COALESCE(v_ddt_line->>'um',''))) <> 'kg' OR jsonb_typeof(v_ddt_line->'qty') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'Eccedenza non valida: unità o quantità del DDT da controllare';
      END IF;
      v_ddt_qty := (v_ddt_line->>'qty')::numeric;
      IF v_ddt_qty <= COALESCE(v_oi.purchase_quantity,v_oi.ordered_quantity,0) OR v_arrived > v_ddt_qty THEN
        RAISE EXCEPTION 'Eccedenza non valida: quantità superiore al DDT';
      END IF;
      v_excess_lines := v_excess_lines || jsonb_build_array(jsonb_build_object(
        'order_item_id',v_oi.id,'ordered',COALESCE(v_oi.purchase_quantity,v_oi.ordered_quantity),
        'arrived',v_arrived,'ddt_document_id',v_ddt.id));
    END IF;$block$;
  v_definition := replace(v_definition,v_old,v_new);
  v_old := 'jsonb_build_object(''order_id'',_order_id,''delivery_id'',v_id,''request_key'',_request_key,''fingerprint'',v_fingerprint)';
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Audit ricezione non riconosciuto'; END IF;
  v_definition := replace(v_definition,v_old,v_old || ' || CASE WHEN jsonb_array_length(v_excess_lines)>0 THEN jsonb_build_object(''excess_lines'',v_excess_lines) ELSE ''{}''::jsonb END');
  EXECUTE v_definition;
END;
$migration$;
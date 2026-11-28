ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'cliente';
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_origin_check CHECK (origin IN ('cliente','telefonico_ddt'));
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS source_document_id uuid REFERENCES public.supplier_delivery_documents(id);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_source_document_unique ON public.purchase_orders(source_document_id) WHERE source_document_id IS NOT NULL;

-- Resolve the customer of a DDT only from the document's seller + customer code; never from the browser.
CREATE OR REPLACE FUNCTION public._incassi_doc_relation(_seller uuid, _customer_code text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN count(*) = 1 THEN min(r.id::text)::uuid END
  FROM public.supplier_customer_relations r
  JOIN public.customer_records cr ON cr.id = r.customer_record_id
  WHERE r.seller_company_id = _seller AND r.status = 'attivo' AND r.seller_enabled AND r.buyer_enabled
    AND btrim(coalesce(_customer_code,'')) <> ''
    AND lower(btrim(cr.internal_reference)) = lower(btrim(_customer_code));
$$;
REVOKE ALL ON FUNCTION public._incassi_doc_relation(uuid, text) FROM PUBLIC, anon, authenticated;

-- Auto match: DDT code → seller product code → buyer's active B2B link to that product.
CREATE OR REPLACE FUNCTION public._incassi_auto_link(_seller uuid, _buyer uuid, _code text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN count(*) = 1 THEN min(l.id::text)::uuid END
  FROM public.products sp
  JOIN public.product_supplier_links l ON l.b2b_item_id = sp.id AND l.company_id = _buyer AND l.supplier_company_id = _seller AND l.is_active
  WHERE sp.company_id = _seller AND btrim(coalesce(_code,'')) <> '' AND lower(btrim(sp.code)) = lower(btrim(_code));
$$;
REVOKE ALL ON FUNCTION public._incassi_auto_link(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.incassi_pending_documents()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb := '[]'::jsonb; d record; v_rel uuid; v_buyer uuid; v_lines jsonb; v_cands jsonb; v_existing text; v_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non autorizzato'; END IF;
  FOR d IN
    SELECT * FROM public.supplier_delivery_documents sd
    WHERE public.is_company_member(sd.seller_company_id)
      AND sd.purchase_order_id IS NULL AND sd.doc_type = 'ddt' AND sd.order_ref IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.source_document_id = sd.id)
    ORDER BY sd.doc_date DESC NULLS LAST, sd.received_at DESC
  LOOP
    v_rel := public._incassi_doc_relation(d.seller_company_id, d.customer_code);
    SELECT buyer_company_id INTO v_buyer FROM public.supplier_customer_relations WHERE id = v_rel;
    SELECT legal_name INTO v_name FROM public.companies WHERE id = v_buyer;
    v_existing := NULL; v_cands := '[]'::jsonb;
    IF v_rel IS NOT NULL THEN
      SELECT po.number INTO v_existing FROM public.purchase_orders po
       WHERE po.relation_id = v_rel AND po.delivery_date = d.doc_date AND po.status IN ('inviato','parzialmente_consegnato')
       ORDER BY po.created_at LIMIT 1;
      SELECT coalesce(jsonb_agg(jsonb_build_object('link_id', l.id, 'code', sp.code, 'description', sp.description) ORDER BY sp.description), '[]'::jsonb)
        INTO v_cands
        FROM public.product_supplier_links l JOIN public.products sp ON sp.id = l.b2b_item_id AND sp.company_id = d.seller_company_id
       WHERE l.company_id = v_buyer AND l.supplier_company_id = d.seller_company_id AND l.is_active;
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('idx', e.ord - 1, 'code', e.x->>'code', 'description', e.x->>'description',
             'qty', e.x->'qty', 'um', e.x->>'um', 'um_normalized', e.x->>'um_normalized', 'price', e.x->'price',
             'auto_link_id', CASE WHEN v_rel IS NULL THEN NULL ELSE public._incassi_auto_link(d.seller_company_id, v_buyer, e.x->>'code') END) ORDER BY e.ord), '[]'::jsonb)
      INTO v_lines FROM jsonb_array_elements(d.lines) WITH ORDINALITY e(x, ord);
    v := v || jsonb_build_object('id', d.id, 'doc_number', d.doc_number, 'doc_date', d.doc_date, 'customer_code', d.customer_code,
           'customer_name', CASE WHEN v_rel IS NULL THEN NULL ELSE v_name END, 'existing_order_number', v_existing,
           'lines', v_lines, 'candidates', v_cands);
  END LOOP;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.incassi_pending_documents() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.incassi_pending_documents() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_phone_order_from_document(_document_id uuid, _line_matches jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.supplier_delivery_documents; r public.supplier_customer_relations; v_rel uuid; v_loc uuid; v_archive uuid;
  v_order uuid; v_number text; e record; v_link uuid; l public.product_supplier_links; p public.products; v_qty numeric; v_um text; v_n int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non autorizzato'; END IF;
  SELECT * INTO d FROM public.supplier_delivery_documents WHERE id = _document_id FOR UPDATE;
  IF d.id IS NULL OR NOT public.is_company_member(d.seller_company_id) THEN RAISE EXCEPTION 'Non autorizzato'; END IF;
  IF d.purchase_order_id IS NOT NULL OR EXISTS (SELECT 1 FROM public.purchase_orders WHERE source_document_id = d.id) THEN
    RAISE EXCEPTION 'Per questo DDT esiste già un ordine'; END IF;
  IF d.doc_type <> 'ddt' OR d.order_ref IS NOT NULL THEN RAISE EXCEPTION 'Documento non adatto a un ordine telefonico'; END IF;
  v_rel := public._incassi_doc_relation(d.seller_company_id, d.customer_code);
  IF v_rel IS NULL THEN RAISE EXCEPTION 'Cliente non riconosciuto dal codice del DDT'; END IF;
  SELECT * INTO r FROM public.supplier_customer_relations WHERE id = v_rel FOR SHARE;
  IF r.supplier_record_id IS NULL THEN RAISE EXCEPTION 'Collegamento cliente incompleto: manca la scheda fornitore del cliente'; END IF;
  IF jsonb_array_length(d.lines) = 0 THEN RAISE EXCEPTION 'Il DDT non ha righe'; END IF;

  -- Validate every line before the first write.
  FOR e IN SELECT x, ord - 1 AS idx FROM jsonb_array_elements(d.lines) WITH ORDINALITY t(x, ord) LOOP
    v_qty := NULLIF(e.x->>'qty','')::numeric; v_um := NULLIF(btrim(coalesce(e.x->>'um_normalized','')),'');
    IF v_qty IS NULL OR v_qty <= 0 OR v_um IS NULL THEN RAISE EXCEPTION 'Riga % senza quantità o U.M. riconosciuta', e.idx + 1; END IF;
    v_link := coalesce(NULLIF(_line_matches->>(e.idx::text),'')::uuid, public._incassi_auto_link(d.seller_company_id, r.buyer_company_id, e.x->>'code'));
    IF v_link IS NULL OR NOT EXISTS (SELECT 1 FROM public.product_supplier_links ll WHERE ll.id = v_link AND ll.company_id = r.buyer_company_id
         AND ll.supplier_company_id = d.seller_company_id AND ll.is_active AND ll.b2b_item_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Righe da abbinare: riga %', e.idx + 1; END IF;
  END LOOP;

  v_loc := public.ensure_default_inventory_location(r.buyer_company_id, NULL);
  v_number := public.next_document_number(r.buyer_company_id, 'ORD');
  PERFORM set_config('app.customer_order_edit', 'on', true);
  FOR e IN SELECT x, ord - 1 AS idx FROM jsonb_array_elements(d.lines) WITH ORDINALITY t(x, ord) ORDER BY ord LOOP
    v_link := coalesce(NULLIF(_line_matches->>(e.idx::text),'')::uuid, public._incassi_auto_link(d.seller_company_id, r.buyer_company_id, e.x->>'code'));
    SELECT * INTO l FROM public.product_supplier_links WHERE id = v_link;
    SELECT * INTO p FROM public.products WHERE id = l.product_id;
    IF v_order IS NULL THEN
      v_archive := p.archive_id;
      INSERT INTO public.purchase_orders (company_id, archive_id, supplier_record_id, relation_id, destination_location_id, number, status,
        sent_at, send_channel, seen_by_supplier_at, seen_by_supplier_by, delivery_date, notes, created_by, origin, source_document_id)
      VALUES (r.buyer_company_id, v_archive, r.supplier_record_id, r.id, v_loc, v_number, 'inviato',
        now(), 'piattaforma', now(), auth.uid(), d.doc_date, 'Ordine telefonico · DDT ' || coalesce(d.doc_number, ''), auth.uid(), 'telefonico_ddt', d.id)
      RETURNING id INTO v_order;
    END IF;
    v_um := btrim(e.x->>'um_normalized');
    INSERT INTO public.purchase_order_items (order_id, company_id, product_id, product_supplier_link_id, ordered_quantity, unit_code,
      purchase_quantity, purchase_unit_code, unit_cost, price_unit_code, supplier_product_code, product_name, product_code)
    VALUES (v_order, r.buyer_company_id, l.product_id, l.id, (e.x->>'qty')::numeric, v_um,
      (e.x->>'qty')::numeric, v_um, NULLIF(e.x->>'price','')::numeric, v_um, e.x->>'code', p.description, p.code);
    v_n := v_n + 1;
  END LOOP;
  PERFORM set_config('app.customer_order_edit', 'off', true);

  UPDATE public.supplier_delivery_documents SET purchase_order_id = v_order, buyer_company_id = r.buyer_company_id,
    link_status = 'collegato', link_reason = 'ordine_telefonico', updated_at = now() WHERE id = d.id;
  INSERT INTO public.purchase_order_changes(order_id, buyer_company_id, seller_company_id, field, label, old_value, new_value, changed_by)
  VALUES (v_order, r.buyer_company_id, d.seller_company_id, 'created_phone_order', 'Ordine telefonico creato dal fornitore', NULL,
    'DDT ' || coalesce(d.doc_number, '') || ' · ' || v_n || ' righe', auth.uid());
  INSERT INTO public.notifications(company_id, type, title, body, link, entity_id)
  VALUES (r.buyer_company_id, 'ordine_telefonico', 'Ordine telefonico ' || v_number, 'Inserito dal fornitore dal DDT ' || coalesce(d.doc_number, ''), '/acquisti/ordini', v_order);
  RETURN v_order;
END $$;
REVOKE ALL ON FUNCTION public.create_phone_order_from_document(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_phone_order_from_document(uuid, jsonb) TO authenticated;

-- A re-sent DDT (same external_id) keeps the phone order link created from it.
CREATE OR REPLACE FUNCTION public._keep_phone_order_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.purchase_order_id IS NOT NULL AND NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
     AND EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = OLD.purchase_order_id AND po.source_document_id = OLD.id) THEN
    NEW.purchase_order_id := OLD.purchase_order_id; NEW.buyer_company_id := OLD.buyer_company_id;
    NEW.link_status := OLD.link_status; NEW.link_reason := OLD.link_reason;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_keep_phone_order_link ON public.supplier_delivery_documents;
CREATE TRIGGER trg_keep_phone_order_link BEFORE UPDATE ON public.supplier_delivery_documents FOR EACH ROW EXECUTE FUNCTION public._keep_phone_order_link();

-- Danea: phone orders already exist in Danea, never propose/export them (filter only).
DO $$
DECLARE f record; v_def text; v_new text;
BEGIN
  FOR f IN SELECT p.oid FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('danea_orders_export_candidates','danea_export_orders_priced','danea_mark_orders_exported','danea_reserve_order_numbers')
  LOOP
    v_def := pg_get_functiondef(f.oid);
    v_new := replace(v_def, 'po.sent_at IS NOT NULL', 'po.sent_at IS NOT NULL AND po.origin <> ''telefonico_ddt''');
    IF v_new = v_def THEN RAISE EXCEPTION 'Filtro Danea non applicabile: %', f.oid::regprocedure; END IF;
    EXECUTE v_new;
  END LOOP;
END $$;
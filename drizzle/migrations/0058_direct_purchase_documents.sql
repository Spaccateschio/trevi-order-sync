CREATE TYPE public.direct_purchase_status AS ENUM ('bozza','confermato','annullato');

CREATE TABLE public.direct_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  shopping_list_id uuid REFERENCES public.shopping_lists(id),
  number text NOT NULL,
  status public.direct_purchase_status NOT NULL DEFAULT 'bozza',
  purchased_where text,
  purchase_date date,
  total_paid numeric(12,2) CHECK (total_paid IS NULL OR total_paid >= 0),
  notes text,
  generation_key uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz, confirmed_by uuid,
  cancelled_at timestamptz, cancelled_by uuid,
  CONSTRAINT direct_purchases_company_number_key UNIQUE (company_id, number),
  CONSTRAINT direct_purchases_company_genkey_key UNIQUE (company_id, generation_key)
);

CREATE TABLE public.direct_purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  direct_purchase_id uuid NOT NULL REFERENCES public.direct_purchases(id),
  source_item_id uuid REFERENCES public.shopping_list_items(id),
  -- Prenotazione della quota: valorizzata finché il documento non è annullato. UNIQUE semplice: una quota in un solo documento vivo.
  active_source_item_id uuid UNIQUE REFERENCES public.shopping_list_items(id),
  product_id uuid REFERENCES public.products(id),
  product_code text,
  product_name text NOT NULL,
  planned_quantity numeric,
  planned_unit_id uuid REFERENCES public.units_of_measure(id),
  planned_unit_code text,
  quantity numeric CHECK (quantity IS NULL OR quantity > 0),
  unit_id uuid REFERENCES public.units_of_measure(id),
  unit_price numeric(12,4) CHECK (unit_price IS NULL OR unit_price >= 0),
  price_unit_id uuid REFERENCES public.units_of_measure(id),
  notes text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT direct_purchase_items_price_unit_check CHECK (unit_price IS NULL OR price_unit_id IS NOT NULL)
);
CREATE INDEX direct_purchase_items_doc_idx ON public.direct_purchase_items(direct_purchase_id);
CREATE INDEX direct_purchases_list_idx ON public.direct_purchases(shopping_list_id);

GRANT SELECT ON public.direct_purchases TO authenticated;
GRANT SELECT ON public.direct_purchase_items TO authenticated;
GRANT ALL ON public.direct_purchases TO service_role;
GRANT ALL ON public.direct_purchase_items TO service_role;
ALTER TABLE public.direct_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membri leggono acquisti diretti" ON public.direct_purchases FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY "Membri leggono righe acquisti diretti" ON public.direct_purchase_items FOR SELECT TO authenticated USING (public.is_company_member(company_id));

ALTER TABLE public.shopping_list_direct_purchases
  ADD COLUMN direct_purchase_doc_id uuid REFERENCES public.direct_purchases(id),
  ADD COLUMN direct_purchase_item_id uuid UNIQUE REFERENCES public.direct_purchase_items(id);

CREATE OR REPLACE FUNCTION public.next_document_number(_company_id uuid, _prefix text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_n integer; v_year text := to_char(now(), 'YYYY');
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_company_id::text || _prefix, 0));
  IF _prefix = 'LS' THEN
    SELECT COALESCE(max(NULLIF(regexp_replace(number, '^LS-', ''), '')::integer), 0) + 1 INTO v_n
      FROM public.shopping_lists WHERE company_id = _company_id AND number ~ '^LS-[0-9]+$';
    RETURN 'LS-' || lpad(v_n::text, 6, '0');
  ELSIF _prefix = 'ORD' THEN
    SELECT COALESCE(max(NULLIF(regexp_replace(number, '^.*-', ''), '')::integer), 0) + 1 INTO v_n
      FROM public.purchase_orders
     WHERE company_id = _company_id AND number LIKE _prefix || '-' || v_year || '-%';
  ELSIF _prefix = 'AD' THEN
    SELECT COALESCE(max(NULLIF(regexp_replace(number, '^.*-', ''), '')::integer), 0) + 1 INTO v_n
      FROM public.direct_purchases
     WHERE company_id = _company_id AND number LIKE 'AD-' || v_year || '-%';
  ELSE
    SELECT COALESCE(max(NULLIF(regexp_replace(number, '^.*-', ''), '')::integer), 0) + 1 INTO v_n
      FROM public.goods_receipts
     WHERE company_id = _company_id AND number LIKE _prefix || '-' || v_year || '-%';
  END IF;
  RETURN _prefix || '-' || v_year || '-' || lpad(v_n::text, 5, '0');
END; $function$;

CREATE OR REPLACE FUNCTION public._direct_purchase_actor_ok(_company_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.has_company_role(_company_id, 'amministratore') OR public.has_company_role(_company_id, 'operatore') $$;

CREATE OR REPLACE FUNCTION public._company_unit_active(_company_id uuid, _unit_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.units_of_measure u WHERE u.id = _unit_id AND u.company_id = _company_id AND u.status = 'attivo') $$;

CREATE OR REPLACE FUNCTION public.generate_direct_purchase_draft(_list_id uuid, _generation_key uuid, _item_ids uuid[] DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_list public.shopping_lists%ROWTYPE; v_ex public.direct_purchases%ROWTYPE;
  v_doc uuid; v_number text; v_lines int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _generation_key IS NULL THEN RAISE EXCEPTION 'Chiave di generazione mancante'; END IF;
  SELECT * INTO v_list FROM public.shopping_lists WHERE id = _list_id FOR UPDATE;
  IF v_list.id IS NULL OR NOT public.is_company_member(v_list.company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF NOT public._direct_purchase_actor_ok(v_list.company_id) THEN RAISE EXCEPTION 'Operazione riservata ad amministratore o operatore'; END IF;
  SELECT * INTO v_ex FROM public.direct_purchases WHERE company_id = v_list.company_id AND generation_key = _generation_key;
  IF v_ex.id IS NOT NULL THEN
    IF v_ex.shopping_list_id IS DISTINCT FROM _list_id THEN RAISE EXCEPTION 'Chiave di generazione già usata'; END IF;
    RETURN jsonb_build_object('id', v_ex.id, 'number', v_ex.number, 'already_exists', true);
  END IF;
  IF v_list.status <> 'aperta' THEN RAISE EXCEPTION 'La lista non è più aperta'; END IF;
  SELECT count(*) INTO v_lines FROM public.shopping_list_items i
   WHERE i.list_id = _list_id AND i.excluded_at IS NULL AND i.manual_purchase_quantity IS NOT NULL
     AND i.manual_purchase_done_at IS NULL
     AND (_item_ids IS NULL OR i.id = ANY(_item_ids))
     AND NOT EXISTS (SELECT 1 FROM public.direct_purchase_items d WHERE d.active_source_item_id = i.id);
  IF v_lines = 0 THEN RAISE EXCEPTION 'Nessuna quota di acquisto diretto da inserire in bozza'; END IF;
  v_number := public.next_document_number(v_list.company_id, 'AD');
  INSERT INTO public.direct_purchases (company_id, shopping_list_id, number, generation_key, created_by, purchase_date)
  VALUES (v_list.company_id, _list_id, v_number, _generation_key, v_uid, v_list.delivery_date)
  RETURNING id INTO v_doc;
  INSERT INTO public.direct_purchase_items (company_id, direct_purchase_id, source_item_id, active_source_item_id, product_id, product_code,
      product_name, planned_quantity, planned_unit_id, planned_unit_code, quantity, unit_id, sort_order)
  SELECT v_list.company_id, v_doc, i.id, i.id, i.product_id, p.code, COALESCE(p.description, 'Prodotto'),
         i.manual_purchase_quantity, i.manual_purchase_unit_id, i.manual_purchase_unit_code,
         i.manual_purchase_quantity,
         CASE WHEN public._company_unit_active(v_list.company_id, i.manual_purchase_unit_id) THEN i.manual_purchase_unit_id END,
         row_number() OVER (ORDER BY p.description)
    FROM public.shopping_list_items i LEFT JOIN public.products p ON p.id = i.product_id
   WHERE i.list_id = _list_id AND i.excluded_at IS NULL AND i.manual_purchase_quantity IS NOT NULL
     AND i.manual_purchase_done_at IS NULL
     AND (_item_ids IS NULL OR i.id = ANY(_item_ids))
     AND NOT EXISTS (SELECT 1 FROM public.direct_purchase_items d WHERE d.active_source_item_id = i.id);
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_list.company_id, v_uid, 'direct_purchase.draft_created', 'direct_purchase', v_doc,
          jsonb_build_object('number', v_number, 'list_id', _list_id, 'lines', v_lines));
  RETURN jsonb_build_object('id', v_doc, 'number', v_number, 'already_exists', false);
END $function$;

CREATE OR REPLACE FUNCTION public.update_direct_purchase_draft(_id uuid, _header jsonb, _lines jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_doc public.direct_purchases%ROWTYPE; l jsonb; v_it public.direct_purchase_items%ROWTYPE;
  v_q numeric; v_u uuid; v_p numeric; v_pu uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_doc FROM public.direct_purchases WHERE id = _id FOR UPDATE;
  IF v_doc.id IS NULL OR NOT public.is_company_member(v_doc.company_id) THEN RAISE EXCEPTION 'Documento non trovato'; END IF;
  IF NOT public._direct_purchase_actor_ok(v_doc.company_id) THEN RAISE EXCEPTION 'Operazione riservata ad amministratore o operatore'; END IF;
  IF v_doc.status <> 'bozza' THEN RAISE EXCEPTION 'Il documento non è più in bozza: non è modificabile'; END IF;
  -- Validazione completa prima di qualsiasi scrittura.
  IF (_header->>'total_paid') IS NOT NULL AND (_header->>'total_paid')::numeric < 0 THEN RAISE EXCEPTION 'Totale pagato non valido'; END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(COALESCE(_lines, '[]'::jsonb)) LOOP
    SELECT * INTO v_it FROM public.direct_purchase_items WHERE id = (l->>'line_id')::uuid AND direct_purchase_id = _id;
    IF v_it.id IS NULL THEN RAISE EXCEPTION 'Riga non appartenente al documento'; END IF;
    v_q := (l->>'quantity')::numeric; v_u := (l->>'unit_id')::uuid; v_p := (l->>'unit_price')::numeric; v_pu := (l->>'price_unit_id')::uuid;
    IF v_q IS NOT NULL AND v_q <= 0 THEN RAISE EXCEPTION 'Quantità non valida per %: deve essere maggiore di zero', v_it.product_name; END IF;
    IF v_u IS NOT NULL AND NOT public._company_unit_active(v_doc.company_id, v_u) THEN RAISE EXCEPTION 'U.M. non presente tra quelle attive dell''azienda (%)', v_it.product_name; END IF;
    IF v_p IS NOT NULL AND v_p < 0 THEN RAISE EXCEPTION 'Prezzo non valido per %', v_it.product_name; END IF;
    IF v_p IS NOT NULL AND v_pu IS NULL THEN RAISE EXCEPTION 'Prezzo senza U.M. per %', v_it.product_name; END IF;
    IF v_pu IS NOT NULL AND NOT public._company_unit_active(v_doc.company_id, v_pu) THEN RAISE EXCEPTION 'U.M. del prezzo non presente tra quelle attive dell''azienda (%)', v_it.product_name; END IF;
  END LOOP;
  UPDATE public.direct_purchases SET
    purchased_where = NULLIF(btrim(COALESCE(_header->>'purchased_where', '')), ''),
    purchase_date = (_header->>'purchase_date')::date,
    total_paid = (_header->>'total_paid')::numeric,
    notes = NULLIF(btrim(COALESCE(_header->>'notes', '')), ''),
    updated_at = now()
   WHERE id = _id;
  FOR l IN SELECT * FROM jsonb_array_elements(COALESCE(_lines, '[]'::jsonb)) LOOP
    UPDATE public.direct_purchase_items SET
      quantity = (l->>'quantity')::numeric, unit_id = (l->>'unit_id')::uuid,
      unit_price = (l->>'unit_price')::numeric, price_unit_id = (l->>'price_unit_id')::uuid,
      notes = NULLIF(btrim(COALESCE(l->>'notes', '')), ''), updated_at = now()
     WHERE id = (l->>'line_id')::uuid AND direct_purchase_id = _id;
  END LOOP;
  RETURN jsonb_build_object('ok', true);
END $function$;

CREATE OR REPLACE FUNCTION public.confirm_direct_purchase(_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_doc public.direct_purchases%ROWTYPE; v_list public.shopping_lists%ROWTYPE;
  r record; v_dp uuid; v_closed boolean; v_n int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_doc FROM public.direct_purchases WHERE id = _id;
  IF v_doc.id IS NULL OR NOT public.is_company_member(v_doc.company_id) THEN RAISE EXCEPTION 'Documento non trovato'; END IF;
  IF NOT public._direct_purchase_actor_ok(v_doc.company_id) THEN RAISE EXCEPTION 'Operazione riservata ad amministratore o operatore'; END IF;
  -- Stesso ordine di blocco della Lista: prima la Lista, poi il documento.
  IF v_doc.shopping_list_id IS NOT NULL THEN
    SELECT * INTO v_list FROM public.shopping_lists WHERE id = v_doc.shopping_list_id FOR UPDATE;
  END IF;
  SELECT * INTO v_doc FROM public.direct_purchases WHERE id = _id FOR UPDATE;
  IF v_doc.status = 'confermato' THEN RETURN jsonb_build_object('id', _id, 'already_confirmed', true); END IF;
  IF v_doc.status <> 'bozza' THEN RAISE EXCEPTION 'Documento annullato: non si può confermare'; END IF;
  IF v_list.id IS NOT NULL AND v_list.status <> 'aperta' THEN RAISE EXCEPTION 'La lista non è più aperta'; END IF;
  -- Tutti i controlli prima della prima scrittura.
  FOR r IN SELECT d.*, i.id AS cur_id, i.list_id AS cur_list, i.excluded_at, i.manual_purchase_quantity AS cur_q,
                  i.manual_purchase_unit_id AS cur_u, i.manual_purchase_unit_code AS cur_uc, i.manual_purchase_done_at
             FROM public.direct_purchase_items d LEFT JOIN public.shopping_list_items i ON i.id = d.source_item_id
            WHERE d.direct_purchase_id = _id ORDER BY d.sort_order FOR UPDATE OF d LOOP
    v_n := v_n + 1;
    IF r.quantity IS NULL OR r.quantity <= 0 THEN RAISE EXCEPTION 'Inserisci la quantità effettiva per %', r.product_name; END IF;
    IF r.unit_id IS NULL OR NOT public._company_unit_active(v_doc.company_id, r.unit_id) THEN RAISE EXCEPTION 'U.M. mancante o non attiva per %', r.product_name; END IF;
    IF r.unit_price IS NOT NULL AND (r.price_unit_id IS NULL OR NOT public._company_unit_active(v_doc.company_id, r.price_unit_id)) THEN
      RAISE EXCEPTION 'U.M. del prezzo mancante o non attiva per %', r.product_name; END IF;
    IF r.source_item_id IS NOT NULL THEN
      IF r.cur_id IS NULL OR r.cur_list IS DISTINCT FROM v_doc.shopping_list_id THEN RAISE EXCEPTION 'La riga della Lista di % non esiste più', r.product_name; END IF;
      IF r.excluded_at IS NOT NULL THEN RAISE EXCEPTION '% è stato escluso dalla Lista: annulla la bozza o riprendi la riga', r.product_name; END IF;
      IF r.manual_purchase_done_at IS NOT NULL THEN RAISE EXCEPTION 'La quota diretta di % risulta già registrata', r.product_name; END IF;
      IF r.cur_q IS NULL THEN RAISE EXCEPTION 'La quota diretta di % è stata tolta dalla Lista: annulla la bozza', r.product_name; END IF;
      IF r.cur_q IS DISTINCT FROM r.planned_quantity OR r.cur_u IS DISTINCT FROM r.planned_unit_id OR r.cur_uc IS DISTINCT FROM r.planned_unit_code THEN
        RAISE EXCEPTION 'La quota diretta di % è cambiata nella Lista dopo la bozza: annulla la bozza e generane una nuova', r.product_name; END IF;
    END IF;
  END LOOP;
  IF v_n = 0 THEN RAISE EXCEPTION 'Il documento non ha righe'; END IF;
  FOR r IN SELECT d.* FROM public.direct_purchase_items d WHERE d.direct_purchase_id = _id AND d.source_item_id IS NOT NULL LOOP
    INSERT INTO public.shopping_list_direct_purchases (company_id, list_id, item_id, product_id, product_name, product_code,
        quantity, unit_id, unit_code, origin, notes, created_by, direct_purchase_doc_id, direct_purchase_item_id)
    VALUES (v_doc.company_id, v_doc.shopping_list_id, r.source_item_id, r.product_id, r.product_name, r.product_code,
        r.planned_quantity, r.planned_unit_id, r.planned_unit_code, 'esplicito', 'Acquisto diretto ' || v_doc.number, v_uid, _id, r.id)
    RETURNING id INTO v_dp;
    UPDATE public.shopping_list_items SET manual_purchase_done_at = now(), manual_purchase_done_by = v_uid, direct_purchase_id = v_dp
     WHERE id = r.source_item_id;
  END LOOP;
  UPDATE public.direct_purchases SET status = 'confermato', confirmed_at = now(), confirmed_by = v_uid, updated_at = now() WHERE id = _id;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_doc.company_id, v_uid, 'direct_purchase.confirmed', 'direct_purchase', _id, jsonb_build_object('number', v_doc.number, 'lines', v_n));
  v_closed := CASE WHEN v_doc.shopping_list_id IS NOT NULL THEN public._shopping_list_try_complete(v_doc.shopping_list_id, v_uid) ELSE false END;
  RETURN jsonb_build_object('id', _id, 'already_confirmed', false, 'list_closed', v_closed);
END $function$;

CREATE OR REPLACE FUNCTION public.cancel_direct_purchase(_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_doc public.direct_purchases%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_doc FROM public.direct_purchases WHERE id = _id FOR UPDATE;
  IF v_doc.id IS NULL OR NOT public.is_company_member(v_doc.company_id) THEN RAISE EXCEPTION 'Documento non trovato'; END IF;
  IF NOT public._direct_purchase_actor_ok(v_doc.company_id) THEN RAISE EXCEPTION 'Operazione riservata ad amministratore o operatore'; END IF;
  IF v_doc.status = 'annullato' THEN RETURN jsonb_build_object('id', _id, 'already_cancelled', true); END IF;
  IF v_doc.status <> 'bozza' THEN RAISE EXCEPTION 'Documento confermato: non si può annullare'; END IF;
  UPDATE public.direct_purchase_items SET active_source_item_id = NULL, updated_at = now() WHERE direct_purchase_id = _id;
  UPDATE public.direct_purchases SET status = 'annullato', cancelled_at = now(), cancelled_by = v_uid, updated_at = now() WHERE id = _id;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_doc.company_id, v_uid, 'direct_purchase.cancelled', 'direct_purchase', _id, jsonb_build_object('number', v_doc.number));
  RETURN jsonb_build_object('id', _id, 'already_cancelled', false);
END $function$;

REVOKE ALL ON FUNCTION public.generate_direct_purchase_draft(uuid, uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_direct_purchase_draft(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_direct_purchase(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_direct_purchase(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._direct_purchase_actor_ok(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._company_unit_active(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_direct_purchase_draft(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_direct_purchase_draft(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_direct_purchase(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_direct_purchase(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._direct_purchase_actor_ok(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._company_unit_active(uuid, uuid) TO authenticated;
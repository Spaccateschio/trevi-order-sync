-- 1. Colonne Lista
ALTER TABLE public.shopping_lists
  ADD COLUMN number text,
  ADD COLUMN delivery_date date,
  ADD COLUMN delivery_time_from time,
  ADD COLUMN delivery_time_to time,
  ADD COLUMN delivery_address_id uuid REFERENCES public.addresses(id),
  ADD COLUMN delivery_address_text text,
  ADD COLUMN general_notes text;
CREATE UNIQUE INDEX shopping_lists_company_number_uq ON public.shopping_lists(company_id, number) WHERE number IS NOT NULL;

-- 2. Colonne Ordine
ALTER TABLE public.purchase_orders
  ADD COLUMN send_status text NOT NULL DEFAULT 'da_inviare',
  ADD COLUMN delivery_date date,
  ADD COLUMN delivery_time_from time,
  ADD COLUMN delivery_time_to time,
  ADD COLUMN delivery_address_text text,
  ADD COLUMN supplier_notes text;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_send_status_check CHECK (send_status IN ('da_inviare','inviato','errore_invio'));
UPDATE public.purchase_orders SET send_status = 'inviato' WHERE sent_at IS NOT NULL;

-- 3. Fotografia prodotto sulle righe ordine
ALTER TABLE public.purchase_order_items
  ADD COLUMN product_name text,
  ADD COLUMN product_code text;

-- 4. Acquisti diretti
CREATE TABLE public.shopping_list_direct_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  list_id uuid NOT NULL REFERENCES public.shopping_lists(id),
  item_id uuid REFERENCES public.shopping_list_items(id),
  product_id uuid REFERENCES public.products(id),
  product_name text NOT NULL,
  product_code text,
  quantity numeric(14,3),
  unit_id uuid REFERENCES public.units_of_measure(id),
  unit_code text,
  origin text NOT NULL,
  reason text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT direct_purchases_origin_check CHECK (origin IN ('intero','residuo','da_verificare')),
  CONSTRAINT direct_purchases_qty_check CHECK (
    (origin = 'da_verificare' AND quantity IS NULL) OR (origin <> 'da_verificare' AND quantity > 0))
);
CREATE INDEX shopping_list_direct_purchases_list_idx ON public.shopping_list_direct_purchases(list_id);
GRANT SELECT ON public.shopping_list_direct_purchases TO authenticated;
GRANT ALL ON public.shopping_list_direct_purchases TO service_role;
ALTER TABLE public.shopping_list_direct_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membri leggono acquisti diretti" ON public.shopping_list_direct_purchases
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

-- 5. Numerazione: aggiunto LS (senza anno, 6 cifre), ORD e altri invariati
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
  ELSE
    SELECT COALESCE(max(NULLIF(regexp_replace(number, '^.*-', ''), '')::integer), 0) + 1 INTO v_n
      FROM public.goods_receipts
     WHERE company_id = _company_id AND number LIKE _prefix || '-' || v_year || '-%';
  END IF;
  RETURN _prefix || '-' || v_year || '-' || lpad(v_n::text, 5, '0');
END; $function$;

-- 6. Piano di chiusura (unica fonte per anteprima e chiusura)
CREATE OR REPLACE FUNCTION public._shopping_list_close_plan(_list_id uuid)
 RETURNS TABLE(item_id uuid, product_id uuid, product_name text, product_code text,
               kind text, quantity numeric, unit_id uuid, unit_code text, reason text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT i.id, i.product_id, p.description AS pname, p.code AS pcode, i.purchase_mode,
           (i.purchase_mode = 'manuale' AND i.manual_purchase_quantity IS NOT NULL) AS use_manual,
           i.decided_quantity, i.decided_unit_id, i.decided_unit_code, i.unit_id, i.unit_code,
           i.manual_purchase_quantity, i.manual_purchase_unit_id, i.manual_purchase_unit_code,
           (i.decided_unit_id IS NOT NULL OR i.decided_unit_code IS NOT NULL) AS other_unit
      FROM public.shopping_list_items i
      JOIN public.products p ON p.id = i.product_id
     WHERE i.list_id = _list_id
  ), q AS (
    SELECT b.*,
           CASE WHEN b.use_manual THEN b.manual_purchase_quantity ELSE b.decided_quantity END AS qty,
           CASE WHEN b.use_manual THEN b.manual_purchase_unit_id
                WHEN b.other_unit THEN b.decided_unit_id ELSE b.unit_id END AS uid,
           CASE WHEN b.use_manual THEN b.manual_purchase_unit_code
                WHEN b.other_unit THEN COALESCE(b.decided_unit_code, (SELECT u.code FROM public.units_of_measure u WHERE u.id = b.decided_unit_id))
                ELSE b.unit_code END AS ucode,
           (SELECT count(*) FROM public.shopping_list_item_suppliers a WHERE a.item_id = b.id) AS n_asg,
           (SELECT count(*) FROM public.shopping_list_item_suppliers a WHERE a.item_id = b.id AND a.assigned_quantity IS NULL) AS n_null,
           (SELECT COALESCE(sum(a.assigned_quantity), 0) FROM public.shopping_list_item_suppliers a WHERE a.item_id = b.id) AS s_assigned,
           (SELECT count(*) FROM public.shopping_list_item_suppliers a WHERE a.item_id = b.id
              AND NOT ((b.decided_unit_id IS NOT NULL AND a.purchase_unit_id = b.decided_unit_id)
                       OR (b.decided_unit_id IS NULL AND a.purchase_unit_id IS NULL
                           AND upper(btrim(COALESCE(a.purchase_unit_code,''))) = upper(btrim(COALESCE(b.decided_unit_code,'')))))) AS n_other_unit,
           (SELECT COALESCE(sum(a.purchase_quantity), 0) FROM public.shopping_list_item_suppliers a WHERE a.item_id = b.id) AS s_purchase
      FROM base b
  )
  SELECT q.id, q.product_id, q.pname, q.pcode,
         c.kind, c.qty, CASE WHEN c.kind IN ('direct_whole','direct_residual') THEN q.uid END,
         CASE WHEN c.kind IN ('direct_whole','direct_residual') THEN q.ucode END, c.reason
    FROM q
    CROSS JOIN LATERAL (
      SELECT CASE
               WHEN q.qty IS NULL OR q.qty <= 0 THEN 'missing'
               WHEN q.purchase_mode = 'manuale' OR q.n_asg = 0 THEN 'direct_whole'
               WHEN NOT q.other_unit AND q.n_null > 0 THEN 'uncertain'
               WHEN NOT q.other_unit AND q.qty - q.s_assigned > 0 THEN 'direct_residual'
               WHEN q.other_unit AND q.n_other_unit > 0 THEN 'uncertain'
               WHEN q.other_unit AND q.qty - q.s_purchase > 0 THEN 'direct_residual'
               ELSE 'ordered'
             END AS kind,
             CASE
               WHEN q.qty IS NULL OR q.qty <= 0 THEN NULL
               WHEN q.purchase_mode = 'manuale' OR q.n_asg = 0 THEN q.qty
               WHEN NOT q.other_unit AND q.n_null = 0 AND q.qty - q.s_assigned > 0 THEN q.qty - q.s_assigned
               WHEN q.other_unit AND q.n_other_unit = 0 AND q.qty - q.s_purchase > 0 THEN q.qty - q.s_purchase
             END AS qty,
             CASE
               WHEN (NOT q.other_unit AND q.n_null > 0) OR (q.other_unit AND q.n_other_unit > 0)
                 THEN 'Residuo non calcolabile: U.M. dei fornitori diverse da quella da acquistare'
             END AS reason
    ) c;
$function$;
REVOKE ALL ON FUNCTION public._shopping_list_close_plan(uuid) FROM PUBLIC, anon, authenticated;

-- 7. Anteprima
CREATE OR REPLACE FUNCTION public.shopping_list_close_preview(_list_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_list public.shopping_lists; v_addr record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_list FROM public.shopping_lists WHERE id = _list_id;
  IF v_list.id IS NULL OR NOT public.is_company_member(v_list.company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;

  SELECT a.id, concat_ws(', ', NULLIF(concat_ws(' ', a.address_line, a.street_number), ''),
           NULLIF(concat_ws(' ', a.postal_code, a.city, CASE WHEN a.province IS NOT NULL THEN '(' || a.province || ')' END), '')) AS txt
    INTO v_addr
    FROM public.addresses a
    LEFT JOIN public.address_functions f ON f.address_id = a.id
   WHERE a.company_id = v_list.company_id AND a.customer_record_id IS NULL AND a.supplier_record_id IS NULL
     AND a.status = 'attivo'
   ORDER BY (f.function = 'consegna') DESC NULLS LAST, (f.function = 'sede_operativa') DESC NULLS LAST,
            f.is_default DESC NULLS LAST, a.created_at
   LIMIT 1;

  RETURN jsonb_build_object(
    'list_id', v_list.id, 'status', v_list.status, 'number', v_list.number,
    'items_total', (SELECT count(*) FROM public.shopping_list_items WHERE list_id = _list_id),
    'missing', COALESCE((SELECT jsonb_agg(jsonb_build_object('item_id', p.item_id, 'name', p.product_name, 'code', p.product_code) ORDER BY p.product_name)
                           FROM public._shopping_list_close_plan(_list_id) p WHERE p.kind = 'missing'), '[]'),
    'direct', COALESCE((SELECT jsonb_agg(jsonb_build_object('item_id', p.item_id, 'name', p.product_name, 'code', p.product_code,
                           'quantity', p.quantity, 'unit_code', p.unit_code,
                           'origin', CASE WHEN p.kind = 'direct_whole' THEN 'intero' ELSE 'residuo' END) ORDER BY p.product_name)
                           FROM public._shopping_list_close_plan(_list_id) p WHERE p.kind IN ('direct_whole','direct_residual')), '[]'),
    'uncertain', COALESCE((SELECT jsonb_agg(jsonb_build_object('item_id', p.item_id, 'name', p.product_name, 'code', p.product_code, 'reason', p.reason) ORDER BY p.product_name)
                           FROM public._shopping_list_close_plan(_list_id) p WHERE p.kind = 'uncertain'), '[]'),
    'ordered_products', (SELECT count(DISTINCT i.id) FROM public.shopping_list_items i
                           JOIN public.shopping_list_item_suppliers a ON a.item_id = i.id
                          WHERE i.list_id = _list_id AND i.purchase_mode = 'fornitore'),
    'orders', COALESCE((SELECT jsonb_agg(jsonb_build_object('supplier_record_id', x.sid, 'name', x.name, 'lines', x.n) ORDER BY x.name)
                          FROM (SELECT a.supplier_record_id AS sid, max(s.company_name) AS name, count(*) AS n
                                  FROM public.shopping_list_item_suppliers a
                                  JOIN public.shopping_list_items i ON i.id = a.item_id
                                  JOIN public.supplier_records s ON s.id = a.supplier_record_id
                                 WHERE i.list_id = _list_id AND i.purchase_mode = 'fornitore'
                                 GROUP BY a.supplier_record_id) x), '[]'),
    'default_address', CASE WHEN v_addr.id IS NULL THEN NULL ELSE jsonb_build_object('id', v_addr.id, 'text', v_addr.txt) END
  );
END; $function$;
REVOKE ALL ON FUNCTION public.shopping_list_close_preview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shopping_list_close_preview(uuid) TO authenticated;

-- 8. Chiusura atomica
CREATE OR REPLACE FUNCTION public.close_shopping_list(
  _company_id uuid, _list_id uuid, _delivery jsonb DEFAULT '{}'::jsonb, _general_notes text DEFAULT NULL,
  _supplier_overrides jsonb DEFAULT '[]'::jsonb, _direct_notes jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_list public.shopping_lists; v_uid uuid := auth.uid(); v_bad text; v_number text;
  v_loc uuid; v_sup record; v_ov jsonb; v_order uuid; v_ids jsonb := '[]'::jsonb;
  v_date date; v_from time; v_to time; v_addr_id uuid; v_addr_text text;
BEGIN
  IF v_uid IS NULL OR NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_list FROM public.shopping_lists WHERE id = _list_id AND company_id = _company_id FOR UPDATE;
  IF v_list.id IS NULL THEN RAISE EXCEPTION 'Lista non trovata'; END IF;

  -- Doppio clic: la seconda chiamata restituisce il risultato già salvato
  IF v_list.status = 'chiusa' AND v_list.number IS NOT NULL THEN
    RETURN jsonb_build_object('list_id', v_list.id, 'number', v_list.number, 'already_closed', true,
      'order_ids', COALESCE((SELECT jsonb_agg(id) FROM public.purchase_orders WHERE shopping_list_id = _list_id), '[]'));
  END IF;
  IF v_list.status <> 'aperta' THEN RAISE EXCEPTION 'La lista non è più aperta'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shopping_list_items WHERE list_id = _list_id) THEN RAISE EXCEPTION 'La lista è vuota'; END IF;

  SELECT string_agg(product_name, ', ' ORDER BY product_name) INTO v_bad
    FROM public._shopping_list_close_plan(_list_id) WHERE kind = 'missing';
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Manca la quantità da acquistare per: %', v_bad; END IF;

  v_date := NULLIF(_delivery->>'date', '')::date;
  v_from := NULLIF(_delivery->>'time_from', '')::time;
  v_to := NULLIF(_delivery->>'time_to', '')::time;
  v_addr_id := NULLIF(_delivery->>'address_id', '')::uuid;
  v_addr_text := NULLIF(btrim(COALESCE(_delivery->>'address_text', '')), '');
  IF v_addr_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.addresses WHERE id = v_addr_id AND company_id = _company_id) THEN
    RAISE EXCEPTION 'Indirizzo di consegna non valido';
  END IF;

  v_number := public.next_document_number(_company_id, 'LS');
  UPDATE public.shopping_lists
     SET number = v_number, delivery_date = v_date, delivery_time_from = v_from, delivery_time_to = v_to,
         delivery_address_id = v_addr_id, delivery_address_text = v_addr_text,
         general_notes = NULLIF(btrim(COALESCE(_general_notes, '')), ''),
         status = 'confermata', confirmed_at = now(), confirmed_by = v_uid
   WHERE id = _list_id;

  -- Acquisti diretti (interi, residui certi, residui da verificare)
  INSERT INTO public.shopping_list_direct_purchases (company_id, list_id, item_id, product_id, product_name, product_code,
      quantity, unit_id, unit_code, origin, reason, notes, created_by)
  SELECT _company_id, _list_id, p.item_id, p.product_id, p.product_name, p.product_code,
         p.quantity, p.unit_id, p.unit_code,
         CASE p.kind WHEN 'direct_whole' THEN 'intero' WHEN 'direct_residual' THEN 'residuo' ELSE 'da_verificare' END,
         p.reason,
         (SELECT NULLIF(btrim(n->>'notes'), '') FROM jsonb_array_elements(COALESCE(_direct_notes, '[]')) n
           WHERE n->>'item_id' = p.item_id::text LIMIT 1),
         v_uid
    FROM public._shopping_list_close_plan(_list_id) p
   WHERE p.kind IN ('direct_whole','direct_residual','uncertain');

  -- Ordini per fornitore
  IF EXISTS (SELECT 1 FROM public.shopping_list_item_suppliers a JOIN public.shopping_list_items i ON i.id = a.item_id
              WHERE i.list_id = _list_id AND i.purchase_mode = 'fornitore') THEN
    v_loc := public.ensure_default_inventory_location(_company_id, v_uid);
  END IF;

  FOR v_sup IN
    SELECT a.supplier_record_id FROM public.shopping_list_item_suppliers a
      JOIN public.shopping_list_items i ON i.id = a.item_id
     WHERE i.list_id = _list_id AND i.purchase_mode = 'fornitore'
     GROUP BY a.supplier_record_id
  LOOP
    SELECT o INTO v_ov FROM jsonb_array_elements(COALESCE(_supplier_overrides, '[]')) o
     WHERE o->>'supplier_record_id' = v_sup.supplier_record_id::text LIMIT 1;

    INSERT INTO public.purchase_orders (company_id, archive_id, supplier_record_id, shopping_list_id,
      destination_location_id, destination_address_id, number, created_by, relation_id, send_status,
      delivery_date, delivery_time_from, delivery_time_to, delivery_address_text, supplier_notes)
    VALUES (_company_id, v_list.archive_id, v_sup.supplier_record_id, _list_id, v_loc,
      CASE WHEN NULLIF(btrim(COALESCE(v_ov->>'address_text', '')), '') IS NULL THEN v_addr_id END,
      public.next_document_number(_company_id, 'ORD'), v_uid,
      (SELECT r.id FROM public.supplier_customer_relations r
        WHERE r.supplier_record_id = v_sup.supplier_record_id AND r.buyer_company_id = _company_id
          AND r.status = 'attivo' LIMIT 1),
      'da_inviare',
      COALESCE(NULLIF(v_ov->>'date', '')::date, v_date),
      COALESCE(NULLIF(v_ov->>'time_from', '')::time, v_from),
      COALESCE(NULLIF(v_ov->>'time_to', '')::time, v_to),
      COALESCE(NULLIF(btrim(COALESCE(v_ov->>'address_text', '')), ''), v_addr_text),
      NULLIF(btrim(COALESCE(v_ov->>'notes', '')), ''))
    RETURNING id INTO v_order;

    INSERT INTO public.purchase_order_items (order_id, company_id, product_id, product_supplier_link_id,
      ordered_quantity, unit_id, unit_code, purchase_quantity, purchase_unit_id, purchase_unit_code,
      conversion_factor, unit_cost, supplier_product_code, source_assignment_id, price_unit_id, price_unit_code,
      product_name, product_code)
    SELECT v_order, _company_id, i.product_id, a.product_supplier_link_id,
           a.assigned_quantity, i.unit_id, i.unit_code,
           a.purchase_quantity, a.purchase_unit_id, a.purchase_unit_code,
           a.conversion_factor, l.manual_cost, l.supplier_product_code, a.id,
           CASE WHEN o.relation_id IS NULL THEN l.price_unit_id END,
           CASE WHEN o.relation_id IS NULL THEN NULL ELSE su.code END,
           bp.description, bp.code
      FROM public.shopping_list_item_suppliers a
      JOIN public.shopping_list_items i ON i.id = a.item_id
      JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
      JOIN public.purchase_orders o ON o.id = v_order
      LEFT JOIN public.products bp ON bp.id = i.product_id
      LEFT JOIN public.products sp ON sp.id = bp.created_from_product_id
      LEFT JOIN public.units_of_measure su ON su.id = sp.price_unit_id
     WHERE i.list_id = _list_id AND i.purchase_mode = 'fornitore'
       AND a.supplier_record_id = v_sup.supplier_record_id;

    v_ids := v_ids || to_jsonb(v_order);
    INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
    VALUES (_company_id, v_uid, 'purchase_order.created_from_list', 'purchase_order', v_order,
            jsonb_build_object('list_id', _list_id, 'list_number', v_number));
  END LOOP;

  UPDATE public.shopping_lists SET status = 'chiusa', closed_at = now() WHERE id = _list_id;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, v_uid, 'shopping_list.closed', 'shopping_list', _list_id,
          jsonb_build_object('number', v_number, 'orders', jsonb_array_length(v_ids)));

  RETURN jsonb_build_object('list_id', _list_id, 'number', v_number, 'already_closed', false, 'order_ids', v_ids);
END; $function$;
REVOKE ALL ON FUNCTION public.close_shopping_list(uuid, uuid, jsonb, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_shopping_list(uuid, uuid, jsonb, text, jsonb, jsonb) TO authenticated;
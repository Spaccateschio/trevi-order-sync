ALTER TABLE public.shopping_list_direct_purchases DROP CONSTRAINT direct_purchases_origin_check;
ALTER TABLE public.shopping_list_direct_purchases ADD CONSTRAINT direct_purchases_origin_check
  CHECK (origin = ANY (ARRAY['intero','residuo','da_verificare','esplicito']));

COMMENT ON COLUMN public.shopping_list_items.purchase_mode IS 'Non usato per dedurre acquisti diretti: la quota diretta è solo manual_purchase_*.';
COMMENT ON COLUMN public.shopping_list_items.manual_purchase_quantity IS 'Quota acquisto diretto scelta esplicitamente per questa Lista (scritta solo da set_shopping_list_direct_quota).';

-- Unica fonte dello stato riga: quote fornitore + quota diretta esplicita.
CREATE OR REPLACE FUNCTION public.shopping_list_item_state(_item_id uuid)
 RETURNS TABLE(assigned numeric, remaining numeric, status text, untranslatable integer, under_minimum integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH item AS (
    SELECT i.id, i.decided_quantity,
           (i.decided_unit_id IS NOT NULL OR i.decided_unit_code IS NOT NULL) AS other_unit,
           CASE WHEN i.decided_unit_id IS NOT NULL OR i.decided_unit_code IS NOT NULL THEN i.decided_unit_id ELSE i.unit_id END AS ru_id,
           upper(btrim(COALESCE(CASE WHEN i.decided_unit_id IS NOT NULL OR i.decided_unit_code IS NOT NULL
                 THEN COALESCE(i.decided_unit_code, (SELECT u.code FROM public.units_of_measure u WHERE u.id = i.decided_unit_id))
                 ELSE i.unit_code END, ''))) AS ru_code,
           i.manual_purchase_quantity AS dq, i.manual_purchase_unit_id AS du_id,
           upper(btrim(COALESCE(i.manual_purchase_unit_code, ''))) AS du_code
      FROM public.shopping_list_items i WHERE i.id = _item_id
  ), asg AS (
    SELECT CASE WHEN item.other_unit THEN a.purchase_quantity ELSE a.assigned_quantity END AS amount,
           CASE WHEN item.other_unit THEN
                  a.purchase_quantity > 0 AND (
                    (item.ru_id IS NOT NULL AND a.purchase_unit_id = item.ru_id)
                    OR (item.ru_id IS NULL AND a.purchase_unit_id IS NULL AND upper(btrim(COALESCE(a.purchase_unit_code,''))) = item.ru_code AND item.ru_code <> ''))
                ELSE a.assigned_quantity IS NOT NULL END AS comparable,
           a.assigned_quantity, l.min_quantity, a.min_warning_accepted
      FROM public.shopping_list_item_suppliers a
      JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
      CROSS JOIN item
     WHERE a.item_id = _item_id
  ), agg AS (
    SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE NOT comparable) AS n_bad,
           COALESCE(sum(amount) FILTER (WHERE comparable), 0) AS s,
           COALESCE(sum(assigned_quantity), 0) AS assigned_eq,
           COUNT(*) FILTER (WHERE assigned_quantity IS NULL)::int AS untranslatable,
           COUNT(*) FILTER (WHERE min_quantity IS NOT NULL AND assigned_quantity IS NOT NULL
                              AND assigned_quantity < min_quantity AND NOT min_warning_accepted)::int AS under_minimum
      FROM asg
  ), d AS (
    SELECT item.*,
           (item.dq IS NULL OR (item.du_id IS NOT NULL AND item.du_id = item.ru_id)
             OR (item.du_id IS NULL AND item.du_code <> '' AND item.du_code = item.ru_code)) AS d_ok
      FROM item
  ), t AS (
    SELECT d.*, agg.*, agg.s + COALESCE(d.dq, 0) AS total,
           (agg.n_bad = 0 AND d.d_ok AND d.decided_quantity IS NOT NULL) AS all_ok,
           (agg.n + CASE WHEN d.dq IS NOT NULL THEN 1 ELSE 0 END) AS quotes
      FROM d CROSS JOIN agg
  )
  SELECT t.assigned_eq + CASE WHEN NOT t.other_unit AND t.d_ok THEN COALESCE(t.dq, 0) ELSE 0 END,
         CASE WHEN t.all_ok THEN t.decided_quantity - t.total END,
         CASE
           WHEN t.quotes = 0 THEN 'da_assegnare'
           WHEN NOT t.all_ok THEN 'da_verificare'
           WHEN t.total > t.decided_quantity THEN 'da_verificare'
           WHEN t.total < t.decided_quantity THEN 'parziale'
           ELSE 'assegnata'
         END,
         t.untranslatable, t.under_minimum
    FROM t;
$function$;

-- Piano di chiusura: nessun acquisto diretto dedotto; solo quote esplicite.
CREATE OR REPLACE FUNCTION public._shopping_list_close_plan(_list_id uuid)
 RETURNS TABLE(item_id uuid, product_id uuid, product_name text, product_code text, kind text, quantity numeric, unit_id uuid, unit_code text, reason text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT i.id, i.product_id, p.description, p.code,
         CASE WHEN i.decided_quantity IS NULL THEN 'missing'
              WHEN s.status = 'da_assegnare' THEN 'unassigned'
              WHEN s.status = 'parziale' THEN 'partial'
              WHEN s.status = 'da_verificare' THEN 'uncertain'
              ELSE 'ordered' END,
         CASE WHEN s.status = 'parziale' THEN s.remaining END,
         NULL::uuid, NULL::text,
         CASE WHEN s.status = 'da_verificare' THEN
           CASE WHEN s.remaining IS NOT NULL AND s.remaining < 0 THEN 'Le quote superano la quantità da acquistare'
                ELSE 'U.M. delle quote non confrontabili con quella della riga' END END
    FROM public.shopping_list_items i
    JOIN public.products p ON p.id = i.product_id
    CROSS JOIN LATERAL public.shopping_list_item_state(i.id) s
   WHERE i.list_id = _list_id
  UNION ALL
  SELECT i.id, i.product_id, p.description, p.code, 'direct',
         i.manual_purchase_quantity, i.manual_purchase_unit_id,
         COALESCE(i.manual_purchase_unit_code, (SELECT u.code FROM public.units_of_measure u WHERE u.id = i.manual_purchase_unit_id)),
         NULL
    FROM public.shopping_list_items i
    JOIN public.products p ON p.id = i.product_id
   WHERE i.list_id = _list_id AND i.manual_purchase_quantity IS NOT NULL;
$function$;

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
    'unassigned', COALESCE((SELECT jsonb_agg(jsonb_build_object('item_id', p.item_id, 'name', p.product_name, 'code', p.product_code) ORDER BY p.product_name)
                           FROM public._shopping_list_close_plan(_list_id) p WHERE p.kind = 'unassigned'), '[]'),
    'partial', COALESCE((SELECT jsonb_agg(jsonb_build_object('item_id', p.item_id, 'name', p.product_name, 'code', p.product_code, 'remaining', p.quantity) ORDER BY p.product_name)
                           FROM public._shopping_list_close_plan(_list_id) p WHERE p.kind = 'partial'), '[]'),
    'direct', COALESCE((SELECT jsonb_agg(jsonb_build_object('item_id', p.item_id, 'name', p.product_name, 'code', p.product_code,
                           'quantity', p.quantity, 'unit_code', p.unit_code, 'origin', 'esplicito') ORDER BY p.product_name)
                           FROM public._shopping_list_close_plan(_list_id) p WHERE p.kind = 'direct'), '[]'),
    'uncertain', COALESCE((SELECT jsonb_agg(jsonb_build_object('item_id', p.item_id, 'name', p.product_name, 'code', p.product_code, 'reason', p.reason) ORDER BY p.product_name)
                           FROM public._shopping_list_close_plan(_list_id) p WHERE p.kind = 'uncertain'), '[]'),
    'ordered_products', (SELECT count(DISTINCT i.id) FROM public.shopping_list_items i
                           JOIN public.shopping_list_item_suppliers a ON a.item_id = i.id
                          WHERE i.list_id = _list_id),
    'orders', COALESCE((SELECT jsonb_agg(jsonb_build_object('supplier_record_id', x.sid, 'name', x.name, 'lines', x.n) ORDER BY x.name)
                          FROM (SELECT a.supplier_record_id AS sid, max(s.legal_name) AS name, count(*) AS n
                                  FROM public.shopping_list_item_suppliers a
                                  JOIN public.shopping_list_items i ON i.id = a.item_id
                                  JOIN public.supplier_records s ON s.id = a.supplier_record_id
                                 WHERE i.list_id = _list_id
                                 GROUP BY a.supplier_record_id) x), '[]'),
    'default_address', CASE WHEN v_addr.id IS NULL THEN NULL ELSE jsonb_build_object('id', v_addr.id, 'text', v_addr.txt) END
  );
END; $function$;

CREATE OR REPLACE FUNCTION public.close_shopping_list(_company_id uuid, _list_id uuid, _delivery jsonb DEFAULT '{}'::jsonb, _general_notes text DEFAULT NULL::text, _supplier_overrides jsonb DEFAULT '[]'::jsonb, _direct_notes jsonb DEFAULT '[]'::jsonb)
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

  IF v_list.status = 'chiusa' AND v_list.number IS NOT NULL THEN
    RETURN jsonb_build_object('list_id', v_list.id, 'number', v_list.number, 'already_closed', true,
      'order_ids', COALESCE((SELECT jsonb_agg(id) FROM public.purchase_orders WHERE shopping_list_id = _list_id), '[]'));
  END IF;
  IF v_list.status <> 'aperta' THEN RAISE EXCEPTION 'La lista non è più aperta'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shopping_list_items WHERE list_id = _list_id) THEN RAISE EXCEPTION 'La lista è vuota'; END IF;

  SELECT string_agg(product_name, ', ' ORDER BY product_name) INTO v_bad
    FROM public._shopping_list_close_plan(_list_id) WHERE kind = 'missing';
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Manca la quantità da acquistare per: %', v_bad; END IF;
  SELECT string_agg(product_name, ', ' ORDER BY product_name) INTO v_bad
    FROM public._shopping_list_close_plan(_list_id) WHERE kind IN ('unassigned','partial','uncertain');
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Righe da assegnare, parziali o da verificare: %', v_bad; END IF;

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

  -- Solo quote dirette scelte esplicitamente
  INSERT INTO public.shopping_list_direct_purchases (company_id, list_id, item_id, product_id, product_name, product_code,
      quantity, unit_id, unit_code, origin, reason, notes, created_by)
  SELECT _company_id, _list_id, p.item_id, p.product_id, p.product_name, p.product_code,
         p.quantity, p.unit_id, p.unit_code, 'esplicito', NULL,
         (SELECT NULLIF(btrim(n->>'notes'), '') FROM jsonb_array_elements(COALESCE(_direct_notes, '[]')) n
           WHERE n->>'item_id' = p.item_id::text LIMIT 1),
         v_uid
    FROM public._shopping_list_close_plan(_list_id) p
   WHERE p.kind = 'direct';

  IF EXISTS (SELECT 1 FROM public.shopping_list_item_suppliers a JOIN public.shopping_list_items i ON i.id = a.item_id
              WHERE i.list_id = _list_id) THEN
    v_loc := public.ensure_default_inventory_location(_company_id, v_uid);
  END IF;

  FOR v_sup IN
    SELECT a.supplier_record_id FROM public.shopping_list_item_suppliers a
      JOIN public.shopping_list_items i ON i.id = a.item_id
     WHERE i.list_id = _list_id
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
     WHERE i.list_id = _list_id AND a.supplier_record_id = v_sup.supplier_record_id;

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

CREATE OR REPLACE FUNCTION public.set_shopping_list_direct_quota(_company_id uuid, _item_id uuid, _quantity numeric, _unit_id uuid DEFAULT NULL, _unit_code text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_item public.shopping_list_items; v_list public.shopping_lists;
        v_uid_u uuid; v_code text; v_state record; v_old numeric;
BEGIN
  IF v_uid IS NULL OR NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_item FROM public.shopping_list_items WHERE id = _item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Riga non trovata'; END IF;
  SELECT * INTO v_list FROM public.shopping_lists WHERE id = v_item.list_id AND company_id = _company_id FOR UPDATE;
  IF v_list.id IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF v_list.status <> 'aperta' THEN RAISE EXCEPTION 'La lista non è più aperta'; END IF;
  IF _quantity IS NOT NULL AND _quantity < 0 THEN RAISE EXCEPTION 'Quantità non valida'; END IF;
  v_old := v_item.manual_purchase_quantity;

  IF _quantity IS NULL OR _quantity = 0 THEN
    UPDATE public.shopping_list_items SET manual_purchase_quantity = NULL, manual_purchase_unit_id = NULL,
           manual_purchase_unit_code = NULL, updated_at = now() WHERE id = _item_id;
  ELSE
    v_code := NULLIF(btrim(COALESCE(_unit_code, '')), '');
    v_uid_u := _unit_id;
    IF v_uid_u IS NULL AND v_code IS NULL THEN
      IF v_item.decided_unit_id IS NOT NULL OR v_item.decided_unit_code IS NOT NULL THEN
        v_uid_u := v_item.decided_unit_id; v_code := v_item.decided_unit_code;
      ELSE
        v_uid_u := v_item.unit_id; v_code := v_item.unit_code;
      END IF;
    END IF;
    IF v_uid_u IS NOT NULL THEN
      SELECT u.code INTO v_code FROM public.units_of_measure u
       WHERE u.id = v_uid_u AND (u.company_id = _company_id OR u.company_id IS NULL);
      IF v_code IS NULL THEN RAISE EXCEPTION 'U.M. non valida'; END IF;
    END IF;
    IF v_uid_u IS NULL AND v_code IS NULL THEN RAISE EXCEPTION 'Indica l''U.M. della quota diretta'; END IF;
    UPDATE public.shopping_list_items SET manual_purchase_quantity = _quantity, manual_purchase_unit_id = v_uid_u,
           manual_purchase_unit_code = v_code, updated_at = now() WHERE id = _item_id;
  END IF;

  SELECT * INTO v_state FROM public.shopping_list_item_state(_item_id);
  IF v_state.remaining IS NOT NULL AND v_state.remaining < 0 THEN
    RAISE EXCEPTION 'La quota diretta supera la quantità da acquistare (eccedenza %)', -v_state.remaining;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, v_uid, 'shopping_list.direct_quota_set', 'shopping_list_item', _item_id,
          jsonb_build_object('list_id', v_list.id, 'old_quantity', v_old,
                             'quantity', NULLIF(_quantity, 0), 'unit_id', v_uid_u, 'unit_code', v_code));

  RETURN jsonb_build_object('item_id', _item_id, 'status', v_state.status, 'remaining', v_state.remaining);
END; $function$;

REVOKE ALL ON FUNCTION public.set_shopping_list_direct_quota(uuid, uuid, numeric, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_shopping_list_direct_quota(uuid, uuid, numeric, uuid, text) TO authenticated;
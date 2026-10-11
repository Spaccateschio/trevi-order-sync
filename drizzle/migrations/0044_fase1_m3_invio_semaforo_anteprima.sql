-- M3 Fase 1 «Genera ordini»: invio con blocco, canale e completamento Lista; semaforo con bozze ed esclusioni; anteprima generazione.

DROP FUNCTION IF EXISTS public.manage_purchase_order(uuid, text, uuid, text, uuid);
CREATE FUNCTION public.manage_purchase_order(_order_id uuid, _action text, _destination_location_id uuid DEFAULT NULL::uuid,
  _notes text DEFAULT NULL::text, _actor_user_id uuid DEFAULT NULL::uuid, _send_channel text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_o public.purchase_orders; v_b2b boolean; v_channel text; v_closed boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = _order_id;
  IF v_o.id IS NULL OR NOT public.is_company_member(v_o.company_id) THEN RAISE EXCEPTION 'Ordine non trovato'; END IF;
  -- Ordine di blocco: Lista prima dell'ordine (come le funzioni di generazione), poi l'ordine.
  IF v_o.shopping_list_id IS NOT NULL THEN
    PERFORM 1 FROM public.shopping_lists WHERE id = v_o.shopping_list_id FOR UPDATE;
  END IF;
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = _order_id FOR UPDATE;
  IF _action = 'send' THEN
    IF v_o.status <> 'bozza' THEN RAISE EXCEPTION 'Ordine già inviato'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.purchase_order_items WHERE order_id = _order_id) THEN RAISE EXCEPTION 'Ordine senza righe'; END IF;
    v_b2b := v_o.relation_id IS NOT NULL;
    v_channel := NULLIF(lower(btrim(COALESCE(_send_channel, ''))), '');
    IF v_b2b THEN
      IF v_channel IS NOT NULL AND v_channel <> 'piattaforma' THEN RAISE EXCEPTION 'Ordine B2B: si invia solo tramite la piattaforma'; END IF;
      v_channel := 'piattaforma';
    ELSE
      IF v_channel IS NULL THEN RAISE EXCEPTION 'Indica il canale con cui hai inviato l''ordine'; END IF;
      IF v_channel NOT IN ('whatsapp','email','sms','telefono','di_persona','altro') THEN RAISE EXCEPTION 'Canale d''invio non valido'; END IF;
    END IF;
    UPDATE public.purchase_orders SET status = 'inviato', sent_at = now(), send_channel = v_channel WHERE id = _order_id;
  ELSIF _action = 'set_destination' THEN
    IF v_o.status <> 'bozza' THEN RAISE EXCEPTION 'Destinazione modificabile solo in bozza'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.inventory_locations WHERE id = _destination_location_id AND company_id = v_o.company_id) THEN RAISE EXCEPTION 'Destinazione non valida'; END IF;
    UPDATE public.purchase_orders SET destination_location_id = _destination_location_id WHERE id = _order_id;
  ELSIF _action = 'notes' THEN
    IF v_o.status <> 'bozza' OR COALESCE(v_o.send_status,'da_inviare') = 'inviato' THEN RAISE EXCEPTION 'Ordine già inviato: note non modificabili'; END IF;
    UPDATE public.purchase_orders SET notes = _notes WHERE id = _order_id;
  ELSIF _action = 'cancel' THEN
    IF v_o.status NOT IN ('bozza','inviato') THEN RAISE EXCEPTION 'Ordine non annullabile'; END IF;
    IF EXISTS (SELECT 1 FROM public.goods_receipts WHERE order_id = _order_id AND status = 'confermato') THEN RAISE EXCEPTION 'Ordine con carichi confermati: non annullabile'; END IF;
    UPDATE public.purchase_orders SET status = 'annullato', closed_at = now() WHERE id = _order_id;
  ELSIF _action = 'close' THEN
    UPDATE public.purchase_orders SET status = 'chiuso', closed_at = now() WHERE id = _order_id;
  ELSE RAISE EXCEPTION 'Azione non valida';
  END IF;
  IF _action = 'send' AND v_o.shopping_list_id IS NOT NULL THEN
    v_closed := public._shopping_list_try_complete(v_o.shopping_list_id, _actor_user_id);
  END IF;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_o.company_id, _actor_user_id, 'purchase_order.' || _action, 'purchase_order', _order_id,
          CASE WHEN _action = 'send' THEN jsonb_build_object('channel', v_channel, 'list_closed', v_closed) END);
  RETURN _order_id;
END; $function$;
REVOKE ALL ON FUNCTION public.manage_purchase_order(uuid, text, uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_purchase_order(uuid, text, uuid, text, uuid, text) TO authenticated, service_role;

-- Semaforo: righe escluse non mancano; ogni bozza aperta della Lista conta come mancante.
CREATE OR REPLACE FUNCTION public.inventory_purchase_cycle_status(_company_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_open_id uuid; v_last record; v_list_id uuid; v_list_name text; v_list_status text; v_list_number text;
  v_link_valid boolean := false; v_items int := 0; v_missing int := 0; v_to_verify int := 0; v_outcome text := NULL;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;

  SELECT id INTO v_open_id FROM public.inventory_sessions
   WHERE company_id = _company_id AND status = 'in_corso' ORDER BY started_at DESC LIMIT 1;
  IF v_open_id IS NOT NULL THEN RETURN jsonb_build_object('color', 'giallo', 'open_session_id', v_open_id); END IF;

  SELECT id, name, finished_at, purchase_list_id, purchase_evaluated_at INTO v_last
    FROM public.inventory_sessions WHERE company_id = _company_id AND status = 'completata'
   ORDER BY finished_at DESC NULLS LAST LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('color', 'verde'); END IF;

  IF v_last.purchase_list_id IS NOT NULL THEN
    SELECT id, name, status::text, number INTO v_list_id, v_list_name, v_list_status, v_list_number FROM public.shopping_lists
     WHERE id = v_last.purchase_list_id AND company_id = _company_id;
    v_link_valid := v_list_id IS NOT NULL AND v_list_status <> 'annullata'
      AND (v_list_status <> 'chiusa' OR v_last.purchase_evaluated_at IS NOT NULL);
  END IF;

  IF v_link_valid THEN
    SELECT count(*) INTO v_items FROM public.shopping_list_items WHERE list_id = v_list_id;

    IF v_list_status = 'chiusa' AND v_list_number IS NOT NULL THEN
      SELECT count(*) INTO v_to_verify FROM public.shopping_list_direct_purchases
       WHERE list_id = v_list_id AND origin = 'da_verificare';
      v_missing := v_to_verify;
      v_outcome := CASE WHEN v_to_verify = 0 THEN 'completato' ELSE 'da_verificare' END;
    ELSE
      SELECT count(*) INTO v_missing FROM (
        SELECT i.product_id, a.product_supplier_link_id, sum(a.assigned_quantity) AS q
          FROM public.shopping_list_item_suppliers a JOIN public.shopping_list_items i ON i.id = a.item_id
         WHERE i.list_id = v_list_id AND a.assigned_quantity IS NOT NULL AND i.excluded_at IS NULL
         GROUP BY 1, 2) need
      WHERE COALESCE((SELECT sum(oi.ordered_quantity) FROM public.purchase_order_items oi
          JOIN public.purchase_orders o ON o.id = oi.order_id
         WHERE o.shopping_list_id = v_list_id AND o.status <> 'annullato'
           AND oi.product_id = need.product_id AND oi.product_supplier_link_id = need.product_supplier_link_id), 0) < need.q;

      v_missing := v_missing + (SELECT count(*) FROM public.shopping_list_item_suppliers a
          JOIN public.shopping_list_items i ON i.id = a.item_id
         WHERE i.list_id = v_list_id AND a.assigned_quantity IS NULL AND i.excluded_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM public.purchase_order_items oi JOIN public.purchase_orders o ON o.id = oi.order_id
              WHERE o.shopping_list_id = v_list_id AND o.status <> 'annullato'
                AND (oi.source_assignment_id = a.id OR (oi.product_supplier_link_id = a.product_supplier_link_id AND oi.purchase_unit_id = a.purchase_unit_id))
                AND oi.purchase_quantity >= a.purchase_quantity));

      v_missing := v_missing + (SELECT count(*) FROM public.shopping_list_items i
         CROSS JOIN LATERAL public.shopping_list_item_state(i.id) st
         WHERE i.list_id = v_list_id AND i.excluded_at IS NULL AND st.status <> 'assegnata');

      v_missing := v_missing + (SELECT count(*) FROM public.shopping_list_items i
         WHERE i.list_id = v_list_id AND i.inventory_changed_at IS NOT NULL AND i.excluded_at IS NULL);

      -- Bozze non inviate: il ciclo non è completo finché restano.
      v_missing := v_missing + (SELECT count(*) FROM public.purchase_orders o
         WHERE o.shopping_list_id = v_list_id AND o.status = 'bozza');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'color', CASE WHEN v_link_valid AND v_last.purchase_evaluated_at IS NOT NULL AND v_missing = 0 THEN 'verde'
    WHEN v_outcome = 'da_verificare' AND v_last.purchase_evaluated_at IS NOT NULL THEN 'arancione' ELSE 'rosso' END,
    'session_id', v_last.id, 'session_name', v_last.name, 'finished_at', v_last.finished_at,
    'evaluated_at', v_last.purchase_evaluated_at,
    'list_id', CASE WHEN v_link_valid THEN v_list_id END,
    'list_name', CASE WHEN v_link_valid THEN v_list_name END,
    'list_status', CASE WHEN v_link_valid THEN v_list_status END,
    'list_items', v_items, 'missing_orders', v_missing,
    'cycle_outcome', v_outcome, 'to_verify', v_to_verify);
END;
$function$;

-- Anteprima «Genera ordini»: stato righe, residui per fornitore, acquisti diretti e bozze. Sola lettura.
CREATE OR REPLACE FUNCTION public.shopping_list_generation_preview(_list_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_list public.shopping_lists%ROWTYPE; v_res jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_list FROM public.shopping_lists WHERE id = _list_id;
  IF v_list.id IS NULL OR NOT public.is_company_member(v_list.company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;

  WITH rows AS (
    SELECT i.id, i.product_id, p.code, p.description, i.decided_quantity,
           COALESCE(i.decided_unit_code, (SELECT u.code FROM public.units_of_measure u WHERE u.id = i.decided_unit_id), i.unit_code) AS unit_code,
           i.excluded_at, i.exclusion_reason, i.manual_purchase_quantity, i.manual_purchase_unit_code, i.manual_purchase_done_at,
           st.status, st.remaining
      FROM public.shopping_list_items i JOIN public.products p ON p.id = i.product_id
      CROSS JOIN LATERAL public.shopping_list_item_state(i.id) st
     WHERE i.list_id = _list_id
  ), lines AS (
    SELECT a.supplier_record_id, a.id AS assignment_id, r.id AS item_id, r.code, r.description,
           COALESCE(a.purchase_unit_code, (SELECT u.code FROM public.units_of_measure u WHERE u.id = a.purchase_unit_id)) AS purchase_unit_code,
           a.purchase_quantity, public._assignment_residual(a.id) AS residual,
           (a.assigned_quantity IS NULL) AS no_conversion,
           (a.coverage_confirmed_at IS NOT NULL AND a.coverage_quantity IS NOT DISTINCT FROM a.purchase_quantity) AS coverage_ok,
           a.notes, l.manual_cost, l.supplier_company_id, l.b2b_item_id, l.supplier_product_code,
           (SELECT u.code FROM public.units_of_measure u WHERE u.id = l.price_unit_id) AS manual_price_unit
      FROM public.shopping_list_item_suppliers a JOIN rows r ON r.id = a.item_id
      JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
     WHERE r.excluded_at IS NULL AND r.decided_quantity IS NOT NULL
  ), priced AS (
    SELECT ln.*,
      CASE WHEN ln.supplier_company_id IS NULL THEN ln.manual_cost
           WHEN ln.b2b_item_id IS NULL THEN NULL
           ELSE (SELECT b.net_price FROM public.applicable_b2b_price(ln.supplier_company_id, v_list.company_id, ln.b2b_item_id) b LIMIT 1) END AS unit_cost,
      CASE WHEN ln.supplier_company_id IS NULL THEN ln.manual_price_unit
           ELSE (SELECT NULLIF(btrim(COALESCE(su.code, sp.danea_um, '')), '') FROM public.products sp
                   LEFT JOIN public.units_of_measure su ON su.id = sp.price_unit_id WHERE sp.id = ln.b2b_item_id) END AS price_unit_code
      FROM lines ln WHERE ln.residual > 0
  )
  SELECT jsonb_build_object(
    'list_id', v_list.id, 'status', v_list.status, 'number', v_list.number,
    'delivery', jsonb_build_object('date', v_list.delivery_date, 'time_from', to_char(v_list.delivery_time_from, 'HH24:MI'),
       'time_to', to_char(v_list.delivery_time_to, 'HH24:MI'), 'address_id', v_list.delivery_address_id, 'address_text', v_list.delivery_address_text),
    'issues', COALESCE((SELECT jsonb_agg(jsonb_build_object('item_id', id, 'code', code, 'name', description, 'status', status, 'remaining', remaining) ORDER BY code)
        FROM rows WHERE excluded_at IS NULL AND (decided_quantity IS NULL OR status <> 'assegnata')
          AND NOT (status = 'da_verificare' AND NOT EXISTS (SELECT 1 FROM lines x WHERE x.item_id = rows.id AND x.no_conversion AND NOT x.coverage_ok)
                   AND EXISTS (SELECT 1 FROM lines x WHERE x.item_id = rows.id AND x.no_conversion))), '[]'::jsonb),
    'excluded', COALESCE((SELECT jsonb_agg(jsonb_build_object('item_id', id, 'code', code, 'name', description, 'reason', exclusion_reason) ORDER BY code)
        FROM rows WHERE excluded_at IS NOT NULL), '[]'::jsonb),
    'suppliers', COALESCE((SELECT jsonb_agg(s ORDER BY s->>'name') FROM (
        SELECT jsonb_build_object('supplier_record_id', sr.id, 'name', COALESCE(sr.legal_name, 'Fornitore'),
          'is_b2b', bool_or(pr.supplier_company_id IS NOT NULL),
          'lines', jsonb_agg(jsonb_build_object('assignment_id', pr.assignment_id, 'item_id', pr.item_id, 'code', pr.code,
              'name', pr.description, 'unit_code', pr.purchase_unit_code, 'quantity', pr.residual, 'unit_cost', pr.unit_cost,
              'price_unit_code', pr.price_unit_code, 'notes', pr.notes, 'is_b2b', pr.supplier_company_id IS NOT NULL,
              'needs_coverage', pr.no_conversion AND NOT pr.coverage_ok) ORDER BY pr.code)) AS s
          FROM priced pr JOIN public.supplier_records sr ON sr.id = pr.supplier_record_id
         GROUP BY sr.id, sr.legal_name) q), '[]'::jsonb),
    'direct', COALESCE((SELECT jsonb_agg(jsonb_build_object('item_id', id, 'code', code, 'name', description,
          'quantity', manual_purchase_quantity, 'unit_code', manual_purchase_unit_code, 'done', manual_purchase_done_at IS NOT NULL) ORDER BY code)
        FROM rows WHERE excluded_at IS NULL AND manual_purchase_quantity IS NOT NULL), '[]'::jsonb),
    'drafts', COALESCE((SELECT jsonb_agg(jsonb_build_object('order_id', o.id, 'number', o.number, 'supplier_record_id', o.supplier_record_id,
          'supplier_name', sr.legal_name, 'is_b2b', o.relation_id IS NOT NULL,
          'lines', (SELECT count(*) FROM public.purchase_order_items oi WHERE oi.order_id = o.id)) ORDER BY o.created_at)
        FROM public.purchase_orders o LEFT JOIN public.supplier_records sr ON sr.id = o.supplier_record_id
       WHERE o.shopping_list_id = _list_id AND o.status = 'bozza'), '[]'::jsonb)
  ) INTO v_res;
  RETURN v_res;
END $function$;
REVOKE ALL ON FUNCTION public.shopping_list_generation_preview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shopping_list_generation_preview(uuid) TO authenticated, service_role;

-- 1. Lista della Spesa: righe da ricontrollare dopo una modifica all'inventario
ALTER TABLE public.shopping_list_items
  ADD COLUMN IF NOT EXISTS inventory_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS inventory_previous_quantity numeric;
COMMENT ON COLUMN public.shopping_list_items.inventory_changed_at IS 'Impostato quando il conteggio inventario collegato è stato modificato dopo la conferma: la riga va ricontrollata';
COMMENT ON COLUMN public.shopping_list_items.inventory_previous_quantity IS 'Quantità contata prima della modifica che ha sbloccato la riga';

-- 2. Inventario: fotografia delle quantità al momento della riapertura
ALTER TABLE public.inventory_sessions
  ADD COLUMN IF NOT EXISTS reopen_baseline jsonb;
COMMENT ON COLUMN public.inventory_sessions.reopen_baseline IS 'Quantità contate al momento della riapertura del conteggio (chiave product_id|location_id); NULL = sessione mai riaperta';

-- 3. Riapertura conteggio confermato (Modifica conteggio / Azzera quantità)
CREATE OR REPLACE FUNCTION public.reopen_inventory_count(_company_id uuid, _session_id uuid, _reset boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session public.inventory_sessions;
  v_baseline jsonb;
  v_orders integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Solo un amministratore può modificare l''inventario confermato';
  END IF;
  SELECT * INTO v_session FROM public.inventory_sessions
   WHERE id = _session_id AND company_id = _company_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Sessione di inventario non trovata'; END IF;
  IF v_session.status <> 'completata' THEN
    RAISE EXCEPTION 'Solo un conteggio confermato può essere riaperto';
  END IF;

  -- Blocco: se dalla Lista del ciclo è partito almeno un ordine, l'inventario non si tocca più.
  IF v_session.purchase_list_id IS NOT NULL THEN
    SELECT count(*) INTO v_orders FROM public.purchase_orders
     WHERE shopping_list_id = v_session.purchase_list_id
       AND status NOT IN ('bozza', 'annullato');
    IF v_orders > 0 THEN
      RAISE EXCEPTION 'Gli ordini di questo ciclo sono già stati inviati: l''inventario non è più modificabile';
    END IF;
  END IF;

  -- Fotografia delle quantità attuali: serve a capire che cosa è cambiato alla riconferma.
  SELECT COALESCE(jsonb_object_agg(product_id::text || '|' || location_id::text, counted_quantity), '{}'::jsonb)
    INTO v_baseline
    FROM public.inventory_counts
   WHERE session_id = _session_id;

  IF _reset THEN
    DELETE FROM public.inventory_count_drafts WHERE session_id = _session_id;
    DELETE FROM public.inventory_counts WHERE session_id = _session_id;
  END IF;

  UPDATE public.inventory_sessions
     SET status = 'in_corso', finished_at = NULL, reopen_baseline = v_baseline
   WHERE id = _session_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, auth.uid(), 'inventory_session_reopen', 'inventory_session', _session_id,
          jsonb_build_object('reset', _reset));

  RETURN jsonb_build_object('session_id', _session_id, 'reset', _reset);
END;
$function$;

-- 4. Riconferma del conteggio: le righe di Lista con quantità cambiata tornano «da controllare»
CREATE OR REPLACE FUNCTION public.close_general_inventory(_company_id uuid, _session_id uuid, _actor_user_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session public.inventory_sessions;
  v_total integer; v_completed integer; v_differences integer; v_unchanged integer; v_not_comparable integer;
  v_already boolean := false;
  v_item record;
  v_old numeric; v_new numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Solo un amministratore può chiudere l''inventario';
  END IF;
  SELECT * INTO v_session FROM public.inventory_sessions WHERE id = _session_id AND company_id = _company_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Sessione di inventario non trovata'; END IF;

  SELECT count(*), count(x.cid),
         count(*) FILTER (WHERE x.cid IS NOT NULL AND x.comparable AND COALESCE(x.difference, 0) <> 0),
         count(*) FILTER (WHERE x.cid IS NOT NULL AND x.comparable AND COALESCE(x.difference, 0) = 0),
         count(*) FILTER (WHERE x.cid IS NOT NULL AND NOT x.comparable)
  INTO v_total, v_completed, v_differences, v_unchanged, v_not_comparable
  FROM (
    SELECT c.id AS cid, c.difference,
      CASE
        WHEN c.id IS NULL THEN true
        WHEN NULLIF(btrim(COALESCE(c.unit_code, '')), '') IS NULL THEN true
        WHEN NULLIF(btrim(COALESCE(p.danea_um, '')), '') IS NULL THEN true
        ELSE lower(btrim(c.unit_code)) = lower(btrim(p.danea_um))
      END AS comparable
    FROM public.inventory_session_products sp
    JOIN public.products p ON p.id = sp.product_id
    LEFT JOIN public.inventory_counts c
      ON c.session_id = sp.session_id AND c.product_id = sp.product_id AND c.location_id = sp.location_id
    WHERE sp.session_id = _session_id
  ) x;

  IF v_session.status = 'completata' THEN
    v_already := true;
  ELSIF v_session.status <> 'in_corso' THEN
    RAISE EXCEPTION 'La sessione è stata annullata e non può essere chiusa';
  ELSE
    IF v_completed < v_total THEN
      RAISE EXCEPTION 'Mancano ancora % prodotti da controllare', v_total - v_completed;
    END IF;
    UPDATE public.inventory_sessions SET status = 'completata', finished_at = now() WHERE id = _session_id;
    INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
    VALUES (_company_id, _actor_user_id, 'inventory_session_close', 'inventory_session', _session_id,
            jsonb_build_object('total', v_total, 'differences', v_differences, 'not_comparable', v_not_comparable));

    -- Sessione riaperta: segnala in Lista solo i prodotti la cui quantità contata è cambiata.
    IF v_session.reopen_baseline IS NOT NULL AND v_session.purchase_list_id IS NOT NULL THEN
      FOR v_item IN
        SELECT i.id, i.product_id FROM public.shopping_list_items i
         WHERE i.list_id = v_session.purchase_list_id
           AND NOT EXISTS (
             SELECT 1 FROM public.purchase_order_items oi
             JOIN public.purchase_orders o ON o.id = oi.order_id
             WHERE o.shopping_list_id = v_session.purchase_list_id AND o.status <> 'annullato'
               AND oi.product_id = i.product_id)
      LOOP
        SELECT COALESCE(sum(c.counted_quantity), 0) INTO v_new
          FROM public.inventory_counts c
         WHERE c.session_id = _session_id AND c.product_id = v_item.product_id;
        SELECT COALESCE(sum((v_session.reopen_baseline ->> (v_item.product_id::text || '|' || c.location_id::text))::numeric), 0)
          INTO v_old
          FROM public.inventory_session_products c
         WHERE c.session_id = _session_id AND c.product_id = v_item.product_id;
        IF v_new IS DISTINCT FROM v_old THEN
          UPDATE public.shopping_list_items
             SET inventory_changed_at = now(),
                 inventory_previous_quantity = v_old,
                 quantity_locked_at = NULL,
                 quantity_locked_by = NULL
           WHERE id = v_item.id;
        END IF;
      END LOOP;
    END IF;
    UPDATE public.inventory_sessions SET reopen_baseline = NULL WHERE id = _session_id;
  END IF;

  RETURN jsonb_build_object('session_id', _session_id, 'already_closed', v_already,
    'total', v_total, 'completed', v_completed, 'differences', v_differences,
    'unchanged', v_unchanged, 'not_comparable', v_not_comparable);
END;
$function$;

-- 5. Conferma della riga in Lista: il segno «da controllare» sparisce
CREATE OR REPLACE FUNCTION public.confirm_shopping_list_product(_company_id uuid, _product_id uuid, _quantity numeric, _list_id uuid DEFAULT NULL::uuid, _session_id uuid DEFAULT NULL::uuid, _archive_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_list uuid := _list_id;
  v_item uuid;
  v_qty numeric;
  v_locked timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN
    RAISE EXCEPTION 'Inserisci una quantità prima di confermare';
  END IF;

  IF v_list IS NULL THEN
    IF _session_id IS NULL THEN RAISE EXCEPTION 'Lista della Spesa non indicata'; END IF;
    PERFORM pg_advisory_xact_lock(hashtext('shopping_list_for_session:' || _session_id::text));
    SELECT s.purchase_list_id INTO v_list
      FROM public.inventory_sessions s
      JOIN public.shopping_lists l ON l.id = s.purchase_list_id AND l.status = 'aperta'
     WHERE s.id = _session_id AND s.company_id = _company_id;
    IF v_list IS NULL THEN
      v_list := public.manage_shopping_list(_company_id, 'open', NULL, _archive_id, NULL, NULL, auth.uid());
      PERFORM public.manage_inventory_purchase_evaluation(_company_id, _session_id, 'take', v_list);
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('shopping_list_confirm:' || v_list::text || ':' || _product_id::text));
  PERFORM public.add_shopping_list_items(
    _company_id, v_list,
    jsonb_build_array(jsonb_build_object('product_id', _product_id, 'decided_quantity', _quantity, 'origin', 'manuale')),
    false, auth.uid());

  SELECT id, decided_quantity, quantity_locked_at INTO v_item, v_qty, v_locked
    FROM public.shopping_list_items WHERE list_id = v_list AND product_id = _product_id;
  IF v_item IS NULL THEN RAISE EXCEPTION 'Prodotto non inserito'; END IF;

  IF v_locked IS NULL THEN
    IF v_qty IS DISTINCT FROM _quantity THEN
      PERFORM public.set_shopping_list_item_quantity(_company_id, v_item, _quantity, 'Conferma operatore', NULL, auth.uid());
    END IF;
    UPDATE public.shopping_list_items
       SET quantity_locked_at = now(), quantity_locked_by = auth.uid(),
           inventory_changed_at = NULL, inventory_previous_quantity = NULL
     WHERE id = v_item;
  END IF;

  RETURN jsonb_build_object('list_id', v_list, 'item_id', v_item);
END;
$function$;

-- 6. Semaforo: le righe «da controllare» tengono il ciclo rosso
CREATE OR REPLACE FUNCTION public.inventory_purchase_cycle_status(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
         WHERE i.list_id = v_list_id AND i.purchase_mode = 'fornitore' AND a.assigned_quantity IS NOT NULL
         GROUP BY 1, 2) need
      WHERE COALESCE((SELECT sum(oi.ordered_quantity) FROM public.purchase_order_items oi
          JOIN public.purchase_orders o ON o.id = oi.order_id
         WHERE o.shopping_list_id = v_list_id AND o.status <> 'annullato'
           AND oi.product_id = need.product_id AND oi.product_supplier_link_id = need.product_supplier_link_id), 0) < need.q;

      v_missing := v_missing + (SELECT count(*) FROM public.shopping_list_item_suppliers a
          JOIN public.shopping_list_items i ON i.id = a.item_id
         WHERE i.list_id = v_list_id AND i.purchase_mode = 'fornitore' AND a.assigned_quantity IS NULL
           AND NOT EXISTS (SELECT 1 FROM public.purchase_order_items oi JOIN public.purchase_orders o ON o.id = oi.order_id
              WHERE o.shopping_list_id = v_list_id AND o.status <> 'annullato'
                AND (oi.source_assignment_id = a.id OR (oi.product_supplier_link_id = a.product_supplier_link_id AND oi.purchase_unit_id = a.purchase_unit_id))
                AND oi.purchase_quantity >= a.purchase_quantity));

      v_missing := v_missing + (SELECT count(*) FROM public.shopping_list_items i
         WHERE i.list_id = v_list_id AND (i.purchase_mode = 'manuale'
              OR NOT EXISTS (SELECT 1 FROM public.shopping_list_item_suppliers a WHERE a.item_id = i.id)));

      -- Righe sbloccate da una modifica all'inventario: il ciclo resta rosso finché non vengono riconfermate.
      v_missing := v_missing + (SELECT count(*) FROM public.shopping_list_items i
         WHERE i.list_id = v_list_id AND i.inventory_changed_at IS NOT NULL);
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
-- Inventario chiudibile anche se incompleto (la Lista della Spesa non resta bloccata).
CREATE OR REPLACE FUNCTION public.close_general_inventory(_company_id uuid, _session_id uuid, _actor_user_id uuid DEFAULT NULL::uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_session public.inventory_sessions;
  v_total integer; v_completed integer; v_differences integer; v_unchanged integer; v_not_comparable integer;
  v_missing_unit integer;
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
         count(*) FILTER (WHERE x.cid IS NOT NULL AND NOT x.comparable),
         count(*) FILTER (WHERE x.stock_unit_id IS NULL)
  INTO v_total, v_completed, v_differences, v_unchanged, v_not_comparable, v_missing_unit
  FROM (
    SELECT c.id AS cid, c.difference, p.stock_unit_id,
      CASE
        WHEN c.id IS NULL THEN true
        WHEN p.stock_unit_id IS NULL OR su.code IS NULL THEN false
        WHEN NULLIF(btrim(COALESCE(c.unit_code, '')), '') IS NULL THEN false
        ELSE lower(btrim(c.unit_code)) = lower(btrim(su.code))
      END AS comparable
    FROM public.inventory_session_products sp
    JOIN public.products p ON p.id = sp.product_id
    LEFT JOIN public.units_of_measure su ON su.id = p.stock_unit_id
    LEFT JOIN public.inventory_counts c
      ON c.session_id = sp.session_id AND c.product_id = sp.product_id AND c.location_id = sp.location_id
    WHERE sp.session_id = _session_id
  ) x;

  IF v_session.status = 'completata' THEN
    v_already := true;
  ELSIF v_session.status <> 'in_corso' THEN
    RAISE EXCEPTION 'La sessione è stata annullata e non può essere chiusa';
  ELSE
    -- Chiusura sempre possibile: i prodotti non contati restano senza conteggio (giacenza NULL), mai 0.
    UPDATE public.inventory_sessions SET status = 'completata', finished_at = now() WHERE id = _session_id;
    INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
    VALUES (_company_id, _actor_user_id, 'inventory_session_close', 'inventory_session', _session_id,
            jsonb_build_object('total', v_total, 'differences', v_differences, 'not_comparable', v_not_comparable));

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
    'unchanged', v_unchanged, 'not_comparable', v_not_comparable, 'missing_unit', v_missing_unit);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.close_general_inventory(uuid, uuid, uuid) TO authenticated;

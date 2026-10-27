CREATE OR REPLACE FUNCTION public.reset_open_inventory_count(_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session public.inventory_sessions;
  v_orders integer;
  v_linked integer;
  v_counts integer;
  v_drafts integer;
BEGIN
  -- Tutti i controlli prima di qualsiasi scrittura.
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_session FROM public.inventory_sessions WHERE id = _session_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Sessione di inventario non trovata'; END IF;
  IF NOT public.is_company_admin(v_session.company_id) THEN
    RAISE EXCEPTION 'Solo un amministratore può svuotare l''inventario';
  END IF;
  IF v_session.status <> 'in_corso' THEN
    RAISE EXCEPTION 'Si può svuotare solo un inventario in corso';
  END IF;
  IF v_session.purchase_list_id IS NOT NULL THEN
    SELECT count(*) INTO v_orders FROM public.purchase_orders
     WHERE shopping_list_id = v_session.purchase_list_id
       AND status NOT IN ('bozza', 'annullato');
    IF v_orders > 0 THEN
      RAISE EXCEPTION 'Gli ordini di questo ciclo sono già stati inviati: l''inventario non è più modificabile';
    END IF;
  END IF;
  SELECT (SELECT count(*) FROM public.inventory_adjustments a
            JOIN public.inventory_counts c ON c.id = a.reference_count_id
           WHERE c.session_id = _session_id)
       + (SELECT count(*) FROM public.stock_lot_reconciliations r WHERE r.session_id = _session_id)
    INTO v_linked;
  IF v_linked > 0 THEN
    RAISE EXCEPTION 'Alcuni conteggi sono già collegati a rettifiche di magazzino: l''inventario non può essere svuotato';
  END IF;

  DELETE FROM public.inventory_count_drafts WHERE session_id = _session_id;
  GET DIAGNOSTICS v_drafts = ROW_COUNT;
  DELETE FROM public.inventory_counts WHERE session_id = _session_id;
  GET DIAGNOSTICS v_counts = ROW_COUNT;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_session.company_id, auth.uid(), 'inventory_session_reset', 'inventory_session', _session_id,
          jsonb_build_object('counts_removed', v_counts, 'drafts_removed', v_drafts));

  RETURN jsonb_build_object('session_id', _session_id, 'counts_removed', v_counts, 'drafts_removed', v_drafts);
END;
$function$;

REVOKE ALL ON FUNCTION public.reset_open_inventory_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_open_inventory_count(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.confirm_all_inventory_drafts(_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session public.inventory_sessions;
  v_draft record;
  v_qty numeric;
  v_unit uuid;
  v_confirmed integer := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_label text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_session FROM public.inventory_sessions WHERE id = _session_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Sessione di inventario non trovata'; END IF;
  IF NOT public.is_company_member(v_session.company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  IF v_session.status <> 'in_corso' THEN
    RAISE EXCEPTION 'Si possono confermare solo le bozze di un inventario in corso';
  END IF;

  FOR v_draft IN
    SELECT d.*, p.code AS product_code, p.description AS product_description
      FROM public.inventory_count_drafts d
      JOIN public.products p ON p.id = d.product_id
     WHERE d.session_id = _session_id
     ORDER BY p.description, p.code
  LOOP
    v_label := COALESCE(v_draft.product_description, v_draft.product_code, v_draft.product_id::text);
    BEGIN
      v_qty := NULLIF(btrim(replace(v_draft.quantity, ',', '.')), '')::numeric;
      IF v_qty IS NULL OR v_qty < 0 THEN
        RAISE EXCEPTION 'Quantità non valida';
      END IF;
      v_unit := NULL;
      IF v_draft.unit_code IS NOT NULL THEN
        SELECT u.id INTO v_unit FROM public.units_of_measure u
         WHERE u.company_id = v_draft.company_id AND lower(u.code) = lower(v_draft.unit_code);
      END IF;
      PERFORM public.record_inventory_count_entry(
        v_draft.company_id, _session_id, v_draft.product_id, v_draft.location_id,
        'conteggio', v_qty, v_unit, NULL, NULL, NULL, NULL,
        auth.uid(), v_draft.product_supplier_link_id, true);
      DELETE FROM public.inventory_count_drafts WHERE id = v_draft.id;
      v_confirmed := v_confirmed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped || jsonb_build_object(
        'product_id', v_draft.product_id, 'label', v_label, 'reason', SQLERRM);
    END;
  END LOOP;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_session.company_id, auth.uid(), 'inventory_drafts_confirm_all', 'inventory_session', _session_id,
          jsonb_build_object('confirmed', v_confirmed, 'skipped', jsonb_array_length(v_skipped)));

  RETURN jsonb_build_object('session_id', _session_id, 'confirmed', v_confirmed, 'skipped', v_skipped);
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_all_inventory_drafts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_all_inventory_drafts(uuid) TO authenticated;
-- Quota «Acquisto diretto» in eccedenza: ammessa con avviso (riga «da verificare»), non più bloccata dal database.
-- Identica a prima, tolto solo il RAISE quando il totale supera la quantità da acquistare.
CREATE OR REPLACE FUNCTION public.set_shopping_list_direct_quota(_company_id uuid, _item_id uuid, _quantity numeric, _unit_id uuid DEFAULT NULL::uuid, _unit_code text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  -- Quantità superiore ammessa con avviso: nessun blocco qui. La riga resta «da verificare"
  -- quando il totale supera la quantità da acquistare (shopping_list_item_state).

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, v_uid, 'shopping_list.direct_quota_set', 'shopping_list_item', _item_id,
          jsonb_build_object('list_id', v_list.id, 'old_quantity', v_old,
                             'quantity', NULLIF(_quantity, 0), 'unit_id', v_uid_u, 'unit_code', v_code));

  RETURN jsonb_build_object('item_id', _item_id, 'status', v_state.status, 'remaining', v_state.remaining);
END; $function$
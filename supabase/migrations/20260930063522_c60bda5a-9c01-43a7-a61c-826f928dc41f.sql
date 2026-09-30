CREATE OR REPLACE FUNCTION public.confirm_shopping_list_product(
  _company_id uuid,
  _product_id uuid,
  _quantity numeric,
  _list_id uuid DEFAULT NULL,
  _session_id uuid DEFAULT NULL,
  _archive_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    -- Doppi clic / più utenti: una sola Lista per inventario.
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

  -- Stesso prodotto: una sola riga (lock sulla lista contro doppi clic).
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
       SET quantity_locked_at = now(), quantity_locked_by = auth.uid()
     WHERE id = v_item;
  END IF;

  RETURN jsonb_build_object('list_id', v_list, 'item_id', v_item);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_shopping_list_product(uuid, uuid, numeric, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_shopping_list_product(uuid, uuid, numeric, uuid, uuid, uuid) TO authenticated;
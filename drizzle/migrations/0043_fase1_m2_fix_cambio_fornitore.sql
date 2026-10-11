-- Correzione M2: la scheda fornitore appartiene all'azienda tramite buyer_company_id.
CREATE OR REPLACE FUNCTION public.change_draft_supplier(_order_id uuid, _new_supplier_record_id uuid, _generation_key uuid,
  _purchase_unit_id uuid DEFAULT NULL, _manual_unit_code text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_o public.purchase_orders%ROWTYPE; v_list public.shopping_lists%ROWTYPE;
  v_ex uuid; v_line record; v_link uuid; v_n int; v_unit uuid; v_manual text; v_a public.shopping_list_item_suppliers%ROWTYPE;
  v_other numeric; v_target uuid; v_target_q numeric; v_new_ids uuid[] := '{}'; v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _generation_key IS NULL THEN RAISE EXCEPTION 'Chiave di generazione mancante'; END IF;
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = _order_id;
  IF v_o.id IS NULL OR NOT public.is_company_member(v_o.company_id) THEN RAISE EXCEPTION 'Ordine non trovato'; END IF;
  SELECT id INTO v_ex FROM public.purchase_orders WHERE company_id = v_o.company_id AND generation_key = _generation_key;
  IF v_ex IS NOT NULL THEN
    RETURN jsonb_build_object('order_id', v_ex, 'already_exists', true, 'cancelled_order_id', _order_id);
  END IF;
  IF v_o.shopping_list_id IS NULL THEN RAISE EXCEPTION 'Ordine non collegato a una Lista'; END IF;
  SELECT * INTO v_list FROM public.shopping_lists WHERE id = v_o.shopping_list_id FOR UPDATE;
  IF v_list.status <> 'aperta' THEN RAISE EXCEPTION 'La lista non è più aperta'; END IF;
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = _order_id FOR UPDATE;
  IF v_o.status <> 'bozza' THEN RAISE EXCEPTION 'Solo le bozze possono cambiare fornitore'; END IF;
  IF v_o.supplier_record_id = _new_supplier_record_id THEN RAISE EXCEPTION 'Il fornitore è già questo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supplier_records WHERE id = _new_supplier_record_id AND buyer_company_id = v_o.company_id) THEN
    RAISE EXCEPTION 'Fornitore non valido';
  END IF;

  UPDATE public.purchase_orders SET status = 'annullato', cancelled_at = now(), cancelled_by = v_uid,
         cancel_reason = 'Cambio fornitore'
   WHERE id = _order_id;

  FOR v_line IN SELECT oi.* , i.id AS item_id FROM public.purchase_order_items oi
      JOIN public.shopping_list_item_suppliers a ON a.id = oi.source_assignment_id
      JOIN public.shopping_list_items i ON i.id = a.item_id
     WHERE oi.order_id = _order_id LOOP
    SELECT count(*), min(l.id::text)::uuid INTO v_n, v_link FROM public.product_supplier_links l
     WHERE l.company_id = v_o.company_id AND l.product_id = v_line.product_id
       AND l.supplier_record_id = _new_supplier_record_id AND l.is_active;
    IF v_n <> 1 THEN RAISE EXCEPTION 'Il prodotto % non ha un unico collegamento attivo con il nuovo fornitore', v_line.product_name; END IF;
    v_unit := COALESCE(_purchase_unit_id, CASE WHEN _manual_unit_code IS NULL THEN v_line.purchase_unit_id END);
    v_manual := COALESCE(_manual_unit_code, CASE WHEN _purchase_unit_id IS NULL AND v_line.purchase_unit_id IS NULL THEN v_line.purchase_unit_code END);
    SELECT * INTO v_a FROM public.shopping_list_item_suppliers WHERE id = v_line.source_assignment_id FOR UPDATE;
    v_other := v_a.purchase_quantity - public._assignment_residual(v_a.id);
    SELECT id, purchase_quantity INTO v_target, v_target_q FROM public.shopping_list_item_suppliers
     WHERE item_id = v_line.item_id AND product_supplier_link_id = v_link
       AND ((v_unit IS NOT NULL AND purchase_unit_id = v_unit)
         OR (v_unit IS NULL AND purchase_unit_id IS NULL AND upper(btrim(purchase_unit_code)) = upper(btrim(v_manual))));
    IF v_other <= 0 AND v_a.purchase_quantity <= v_line.purchase_quantity AND v_target IS NULL THEN
      v_target := public.assign_shopping_list_supplier(v_o.company_id, v_line.item_id, 'set', v_link, NULL, v_line.purchase_quantity,
                    false, v_a.notes, v_uid, v_unit, v_a.id, v_manual);
    ELSE
      IF v_a.purchase_quantity - v_line.purchase_quantity <= 0 THEN
        RAISE EXCEPTION 'Il nuovo fornitore ha già una ripartizione per %: modifica dalla Lista', v_line.product_name;
      END IF;
      UPDATE public.shopping_list_item_suppliers
         SET purchase_quantity = purchase_quantity - v_line.purchase_quantity,
             assigned_quantity = CASE WHEN conversion_factor IS NOT NULL THEN round((purchase_quantity - v_line.purchase_quantity) * conversion_factor, 3) END
       WHERE id = v_a.id;
      v_target := public.assign_shopping_list_supplier(v_o.company_id, v_line.item_id, 'set', v_link, NULL,
                    COALESCE(v_target_q, 0) + v_line.purchase_quantity, false, NULL, v_uid, v_unit, v_target, v_manual);
    END IF;
    v_new_ids := v_new_ids || v_target;
  END LOOP;
  IF cardinality(v_new_ids) = 0 THEN RAISE EXCEPTION 'Bozza senza righe collegate alla Lista'; END IF;

  v_res := public.generate_supplier_order(v_o.shopping_list_id, _new_supplier_record_id, _generation_key,
    jsonb_build_object('date', v_o.delivery_date, 'time_from', to_char(v_o.delivery_time_from, 'HH24:MI'),
      'time_to', to_char(v_o.delivery_time_to, 'HH24:MI'), 'address_id', v_o.destination_address_id,
      'address_text', v_o.delivery_address_text, 'notes', v_o.supplier_notes), v_new_ids);
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_o.company_id, v_uid, 'purchase_order.supplier_changed', 'purchase_order', _order_id,
          jsonb_build_object('old_supplier', v_o.supplier_record_id, 'new_supplier', _new_supplier_record_id, 'new_order_id', v_res->>'order_id'));
  RETURN v_res || jsonb_build_object('cancelled_order_id', _order_id);
END $$;
REVOKE ALL ON FUNCTION public.change_draft_supplier(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_draft_supplier(uuid, uuid, uuid, uuid, text) TO authenticated, service_role;
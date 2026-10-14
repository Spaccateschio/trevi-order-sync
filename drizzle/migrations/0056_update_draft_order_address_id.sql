CREATE OR REPLACE FUNCTION public.update_draft_order(_order_id uuid, _lines jsonb DEFAULT '[]'::jsonb, _delivery jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $f$
DECLARE v_uid uuid := auth.uid(); v_o public.purchase_orders%ROWTYPE; v_list_status public.shopping_list_status;
  ln jsonb; v_line public.purchase_order_items%ROWTYPE; v_qty numeric; v_max numeric; v_seller uuid; v_n int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = _order_id;
  IF v_o.id IS NULL OR NOT public.is_company_member(v_o.company_id) THEN RAISE EXCEPTION 'Ordine non trovato'; END IF;
  IF v_o.shopping_list_id IS NOT NULL THEN
    SELECT status INTO v_list_status FROM public.shopping_lists WHERE id = v_o.shopping_list_id FOR UPDATE;
    IF v_list_status <> 'aperta' THEN RAISE EXCEPTION 'La lista non è più aperta'; END IF;
  END IF;
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = _order_id FOR UPDATE;
  IF v_o.status <> 'bozza' THEN RAISE EXCEPTION 'Solo le bozze sono modificabili'; END IF;
  SELECT r.seller_company_id INTO v_seller FROM public.supplier_customer_relations r WHERE r.id = v_o.relation_id;

  FOR ln IN SELECT * FROM jsonb_array_elements(COALESCE(_lines, '[]'::jsonb)) LOOP
    SELECT * INTO v_line FROM public.purchase_order_items WHERE id = (ln->>'line_id')::uuid AND order_id = _order_id;
    IF v_line.id IS NULL THEN RAISE EXCEPTION 'Riga non presente in questa bozza'; END IF;
    v_qty := NULLIF(ln->>'purchase_quantity', '')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      DELETE FROM public.purchase_order_items WHERE id = v_line.id;
    ELSE
      IF v_line.source_assignment_id IS NOT NULL THEN
        v_max := public._assignment_residual(v_line.source_assignment_id, v_line.id);
        IF v_qty > v_max THEN
          RAISE EXCEPTION 'Quantità superiore al residuo da ordinare per % (massimo % %)', v_line.product_name, v_max, v_line.purchase_unit_code;
        END IF;
      END IF;
      UPDATE public.purchase_order_items
         SET purchase_quantity = v_qty,
             ordered_quantity = CASE WHEN conversion_factor IS NOT NULL THEN round(v_qty * conversion_factor, 3) END
       WHERE id = v_line.id;
    END IF;
    INSERT INTO public.purchase_order_changes (order_id, buyer_company_id, seller_company_id, item_id, field, label, old_value, new_value, changed_by)
    VALUES (_order_id, v_o.company_id, v_seller, v_line.id, 'purchase_quantity', v_line.product_name,
            v_line.purchase_quantity::text, COALESCE(v_qty::text, 'rimossa'), v_uid);
    v_n := v_n + 1;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.purchase_order_items WHERE order_id = _order_id) THEN
    RAISE EXCEPTION 'La bozza non può restare senza righe: annullala';
  END IF;
  IF _delivery IS NOT NULL AND _delivery ? 'address_id' AND NULLIF(_delivery->>'address_id', '') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.addresses a WHERE a.id = (_delivery->>'address_id')::uuid
                    AND a.company_id = v_o.company_id AND a.status = 'attivo') THEN
      RAISE EXCEPTION 'Indirizzo di consegna non valido';
    END IF;
  END IF;
  IF _delivery IS NOT NULL THEN
    UPDATE public.purchase_orders SET
      -- address_id: chiave assente = collegamento invariato; null/vuoto = rimosso («Altro indirizzo…»).
      destination_address_id = CASE WHEN _delivery ? 'address_id' THEN NULLIF(_delivery->>'address_id', '')::uuid ELSE destination_address_id END,
      delivery_date = NULLIF(_delivery->>'date', '')::date,
      delivery_time_from = NULLIF(_delivery->>'time_from', '')::time,
      delivery_time_to = NULLIF(_delivery->>'time_to', '')::time,
      delivery_address_text = NULLIF(btrim(COALESCE(_delivery->>'address_text', '')), ''),
      supplier_notes = NULLIF(btrim(COALESCE(_delivery->>'notes', '')), '')
     WHERE id = _order_id;
    INSERT INTO public.purchase_order_changes (order_id, buyer_company_id, seller_company_id, field, label, new_value, changed_by)
    VALUES (_order_id, v_o.company_id, v_seller, 'delivery', 'Consegna', _delivery::text, v_uid);
  END IF;
  RETURN jsonb_build_object('order_id', _order_id, 'lines_changed', v_n);
END $f$;
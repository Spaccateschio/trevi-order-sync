-- numerazione
CREATE OR REPLACE FUNCTION public.next_document_number(_company_id uuid, _prefix text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF _prefix = 'ORD' THEN
    SELECT count(*) + 1 INTO v_n FROM public.purchase_orders WHERE company_id = _company_id;
  ELSE
    SELECT count(*) + 1 INTO v_n FROM public.goods_receipts WHERE company_id = _company_id;
  END IF;
  RETURN _prefix || '-' || to_char(now(), 'YYYY') || '-' || lpad(v_n::text, 5, '0');
END; $$;

-- ordini dalla lista della spesa
CREATE OR REPLACE FUNCTION public.create_purchase_orders_from_list(
  _company_id uuid, _list_id uuid, _destination_location_id uuid DEFAULT NULL, _actor_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_list public.shopping_lists;
  v_loc uuid;
  v_sup record;
  v_order uuid;
  v_ids jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_list FROM public.shopping_lists WHERE id = _list_id AND company_id = _company_id;
  IF v_list.id IS NULL THEN RAISE EXCEPTION 'Lista non trovata'; END IF;
  IF v_list.status <> 'confermata' THEN RAISE EXCEPTION 'La lista deve essere confermata prima di generare gli ordini'; END IF;
  IF EXISTS (SELECT 1 FROM public.purchase_orders WHERE shopping_list_id = _list_id) THEN
    RAISE EXCEPTION 'Ordini già generati per questa lista';
  END IF;

  v_loc := COALESCE(_destination_location_id, public.ensure_default_inventory_location(_company_id, _actor_user_id));
  IF NOT EXISTS (SELECT 1 FROM public.inventory_locations WHERE id = v_loc AND company_id = _company_id) THEN
    RAISE EXCEPTION 'Destinazione di ricezione non valida';
  END IF;

  FOR v_sup IN
    SELECT a.supplier_record_id
      FROM public.shopping_list_item_suppliers a
      JOIN public.shopping_list_items i ON i.id = a.item_id
     WHERE i.list_id = _list_id
     GROUP BY a.supplier_record_id
  LOOP
    INSERT INTO public.purchase_orders (company_id, archive_id, supplier_record_id, shopping_list_id,
      destination_location_id, number, created_by,
      relation_id)
    VALUES (_company_id, v_list.archive_id, v_sup.supplier_record_id, _list_id, v_loc,
      public.next_document_number(_company_id, 'ORD'), _actor_user_id,
      (SELECT r.id FROM public.supplier_customer_relations r
        WHERE r.supplier_record_id = v_sup.supplier_record_id AND r.buyer_company_id = _company_id
          AND r.status = 'attivo' LIMIT 1))
    RETURNING id INTO v_order;

    INSERT INTO public.purchase_order_items (order_id, company_id, product_id, product_supplier_link_id,
      ordered_quantity, unit_id, unit_code, purchase_quantity, purchase_unit_id, purchase_unit_code,
      conversion_factor, unit_cost, supplier_product_code)
    SELECT v_order, _company_id, i.product_id, a.product_supplier_link_id,
           sum(a.assigned_quantity), i.unit_id, i.unit_code,
           sum(COALESCE(a.purchase_quantity, 0)) NULLIF_PLACEHOLDER, a.purchase_unit_id, a.purchase_unit_code,
           a.conversion_factor, l.manual_cost, l.supplier_product_code
      FROM public.shopping_list_item_suppliers a
      JOIN public.shopping_list_items i ON i.id = a.item_id
      JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
     WHERE i.list_id = _list_id AND a.supplier_record_id = v_sup.supplier_record_id
     GROUP BY i.product_id, a.product_supplier_link_id, i.unit_id, i.unit_code,
              a.purchase_unit_id, a.purchase_unit_code, a.conversion_factor, l.manual_cost, l.supplier_product_code;

    v_ids := v_ids || to_jsonb(v_order);

    INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
    VALUES (_company_id, _actor_user_id, 'purchase_order.created_from_list', 'purchase_order', v_order,
            jsonb_build_object('list_id', _list_id));
  END LOOP;

  IF jsonb_array_length(v_ids) = 0 THEN RAISE EXCEPTION 'Nessuna assegnazione fornitore nella lista'; END IF;
  RETURN v_ids;
END; $$;

DO $reset$
DECLARE
  c_ids uuid[] := ARRAY['052667cd-c742-43b4-87f9-02ef0527a1d5','26001897-7b14-434d-b319-545b44de3c48']::uuid[];
  c_trevi uuid := '26001897-7b14-434d-b319-545b44de3c48';
  c_admin uuid := '0f00ea59-a549-4bcd-8dde-9bfc1a9a2781';
  v_su uuid[] := ARRAY['89b283db-ad41-4674-946f-d0c349aa1fae','8d290548-3f24-46f7-865a-57b968ee20a9','46794cec-03d0-42c0-bb3d-0823ab867320','b34174f9-3afd-42bf-b358-70270d58a089','d6a173b7-e215-4ec9-9104-abe30abaa7c4','50e3f200-b86e-4a3d-8484-2f66d84a400c','052689ec-9614-47a5-93bc-482d2f165952','616a464e-bfbc-49e5-9b8a-f2f2faff691e','f911aa2a-56bd-4602-8e40-4b2554c06045','8d4f0cad-0abc-46d3-9803-4065e6520404','cff54ece-667b-429f-8e22-eddfce060609','6d2cf0eb-e1fe-4363-817a-d1b3c3455292','38598715-d369-447c-8fc1-6f75f447fa5e']::uuid[];
  v_nr uuid; v_n int; t text;
BEGIN
  LOCK TABLE public.notifications, public.notification_reads, public.purchase_order_changes, public.purchase_order_change_requests,
    public.stock_lot_reconciliations, public.inventory_movements, public.stock_lots, public.goods_receipt_items, public.goods_receipts,
    public.purchase_delivery_line_events, public.purchase_delivery_disputes, public.purchase_delivery_items, public.purchase_deliveries,
    public.purchase_order_share_links, public.purchase_order_items, public.purchase_orders, public.shopping_list_direct_purchases,
    public.shopping_list_item_suppliers, public.shopping_list_items, public.inventory_adjustments, public.product_purchase_proposal_events,
    public.product_purchase_proposals, public.inventory_purchase_evaluation_items, public.inventory_count_drafts, public.inventory_count_entries,
    public.inventory_counts, public.inventory_session_products, public.inventory_sessions, public.shopping_lists,
    public.product_sale_units, public.products IN ACCESS EXCLUSIVE MODE;

  IF (SELECT count(*) FROM public.companies) <> 2 OR EXISTS (SELECT 1 FROM public.companies WHERE NOT (id = ANY(c_ids))) THEN
    RAISE EXCEPTION 'Aziende diverse da Trevi/3 EMME presenti: azzeramento annullato'; END IF;
  FOREACH t IN ARRAY ARRAY['purchase_orders','purchase_order_items','shopping_lists','shopping_list_items','shopping_list_item_suppliers','purchase_deliveries','purchase_delivery_items','goods_receipts','goods_receipt_items','inventory_counts','inventory_sessions','inventory_count_entries','inventory_adjustments','inventory_movements','stock_lots','notifications','purchase_order_share_links','inventory_session_products','purchase_delivery_disputes','product_purchase_proposals','product_purchase_proposal_events','shopping_list_direct_purchases','stock_lot_reconciliations','inventory_count_drafts','purchase_delivery_line_events','inventory_purchase_evaluation_items'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE company_id IS NULL OR NOT (company_id = ANY($1))', t) INTO v_n USING c_ids;
    IF v_n > 0 THEN RAISE EXCEPTION 'Righe di altre aziende in %: annullato', t; END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.purchase_orders) <> 7 OR (SELECT count(*) FROM public.shopping_lists) <> 20
     OR (SELECT count(*) FROM public.inventory_sessions) <> 8 OR (SELECT count(*) FROM public.goods_receipts) <> 1 THEN
    RAISE EXCEPTION 'Documenti diversi dalla fotografia: annullato'; END IF;
  IF EXISTS (SELECT 1 FROM public.purchase_orders WHERE danea_exported_at IS NOT NULL
             AND NOT (company_id='052667cd-c742-43b4-87f9-02ef0527a1d5' AND number='ORD-2026-00006')) THEN
    RAISE EXCEPTION 'Ordini esportati in Danea non autorizzati: annullato'; END IF;

  ALTER TABLE public.shopping_list_items DISABLE TRIGGER shopping_list_items_open;
  ALTER TABLE public.shopping_list_item_suppliers DISABLE TRIGGER shopping_list_item_suppliers_open;
  ALTER TABLE public.purchase_order_items DISABLE TRIGGER purchase_order_items_frozen;
  ALTER TABLE public.purchase_delivery_line_events DISABLE TRIGGER delivery_line_events_append_only;
  ALTER TABLE public.inventory_movements DISABLE TRIGGER inventory_movements_append_only;
  ALTER TABLE public.inventory_count_entries DISABLE TRIGGER inventory_count_entries_append_only;
  ALTER TABLE public.product_purchase_proposal_events DISABLE TRIGGER product_purchase_proposal_events_append_only;

  DELETE FROM public.notification_reads WHERE notification_id IN (SELECT id FROM public.notifications WHERE company_id = ANY(c_ids));
  DELETE FROM public.notifications WHERE company_id = ANY(c_ids);
  DELETE FROM public.purchase_order_changes WHERE order_id IN (SELECT id FROM public.purchase_orders WHERE company_id = ANY(c_ids));
  DELETE FROM public.purchase_order_change_requests WHERE order_id IN (SELECT id FROM public.purchase_orders WHERE company_id = ANY(c_ids));
  DELETE FROM public.stock_lot_reconciliations WHERE company_id = ANY(c_ids);
  DELETE FROM public.inventory_movements WHERE company_id = ANY(c_ids);
  DELETE FROM public.stock_lots WHERE company_id = ANY(c_ids);
  DELETE FROM public.goods_receipt_items WHERE company_id = ANY(c_ids);
  DELETE FROM public.goods_receipts WHERE company_id = ANY(c_ids);
  DELETE FROM public.purchase_delivery_line_events WHERE company_id = ANY(c_ids);
  DELETE FROM public.purchase_delivery_disputes WHERE company_id = ANY(c_ids);
  DELETE FROM public.purchase_delivery_items WHERE company_id = ANY(c_ids);
  DELETE FROM public.purchase_deliveries WHERE company_id = ANY(c_ids);
  DELETE FROM public.purchase_order_share_links WHERE company_id = ANY(c_ids);
  DELETE FROM public.purchase_order_items WHERE company_id = ANY(c_ids);
  DELETE FROM public.purchase_orders WHERE company_id = ANY(c_ids);
  DELETE FROM public.shopping_list_direct_purchases WHERE company_id = ANY(c_ids);
  DELETE FROM public.shopping_list_item_suppliers WHERE company_id = ANY(c_ids);
  DELETE FROM public.shopping_list_items WHERE company_id = ANY(c_ids);
  DELETE FROM public.inventory_adjustments WHERE company_id = ANY(c_ids);
  DELETE FROM public.product_purchase_proposal_events WHERE company_id = ANY(c_ids);
  DELETE FROM public.product_purchase_proposals WHERE company_id = ANY(c_ids);
  DELETE FROM public.inventory_purchase_evaluation_items WHERE company_id = ANY(c_ids);
  DELETE FROM public.inventory_count_drafts WHERE company_id = ANY(c_ids);
  DELETE FROM public.inventory_count_entries WHERE company_id = ANY(c_ids);
  DELETE FROM public.inventory_counts WHERE company_id = ANY(c_ids);
  DELETE FROM public.inventory_session_products WHERE company_id = ANY(c_ids);
  DELETE FROM public.inventory_sessions WHERE company_id = ANY(c_ids);
  DELETE FROM public.shopping_lists WHERE company_id = ANY(c_ids);

  ALTER TABLE public.shopping_list_items ENABLE TRIGGER shopping_list_items_open;
  ALTER TABLE public.shopping_list_item_suppliers ENABLE TRIGGER shopping_list_item_suppliers_open;
  ALTER TABLE public.purchase_order_items ENABLE TRIGGER purchase_order_items_frozen;
  ALTER TABLE public.purchase_delivery_line_events ENABLE TRIGGER delivery_line_events_append_only;
  ALTER TABLE public.inventory_movements ENABLE TRIGGER inventory_movements_append_only;
  ALTER TABLE public.inventory_count_entries ENABLE TRIGGER inventory_count_entries_append_only;
  ALTER TABLE public.product_purchase_proposal_events ENABLE TRIGGER product_purchase_proposal_events_append_only;

  FOREACH t IN ARRAY ARRAY['purchase_orders','purchase_order_items','shopping_lists','shopping_list_items','shopping_list_item_suppliers','purchase_deliveries','purchase_delivery_items','goods_receipts','goods_receipt_items','inventory_counts','inventory_sessions','inventory_count_entries','inventory_adjustments','inventory_movements','stock_lots','notifications','notification_reads','purchase_order_share_links','inventory_session_products','purchase_delivery_disputes','product_purchase_proposals','product_purchase_proposal_events','shopping_list_direct_purchases','stock_lot_reconciliations','inventory_count_drafts','purchase_delivery_line_events','inventory_purchase_evaluation_items','purchase_order_changes','purchase_order_change_requests'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO v_n;
    IF v_n > 0 THEN RAISE EXCEPTION 'Tabella % non vuota dopo azzeramento', t; END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.product_sale_units s JOIN public.products p ON p.id=s.product_id JOIN public.units_of_measure u ON u.id=s.unit_id
      WHERE s.id = ANY(v_su) AND s.company_id=c_trevi AND p.danea_um IS NOT NULL AND lower(u.code)<>lower(p.danea_um) AND NOT s.is_default) <> 13
     OR EXISTS (SELECT 1 FROM public.customer_product_unit_preferences WHERE product_sale_unit_id = ANY(v_su)) THEN
    RAISE EXCEPTION 'U.M. di vendita aggiuntive non conformi: annullato'; END IF;
  DELETE FROM public.product_sale_units WHERE id = ANY(v_su);
  IF EXISTS (SELECT 1 FROM public.product_sale_units s JOIN public.products p ON p.id=s.product_id JOIN public.units_of_measure u ON u.id=s.unit_id
      WHERE s.company_id=c_trevi AND p.danea_um IS NOT NULL AND (lower(u.code)<>lower(p.danea_um) OR NOT (s.is_default AND s.is_active AND s.is_customer_visible))) THEN
    RAISE EXCEPTION 'Verifica U.M. di vendita Danea fallita'; END IF;

  SELECT id INTO v_nr FROM public.units_of_measure WHERE company_id=c_trevi AND code='nr' AND status='attivo';
  IF v_nr IS NULL THEN RAISE EXCEPTION 'U.M. nr assente'; END IF;
  PERFORM set_config('request.jwt.claim.sub', c_admin::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  PERFORM public.set_product_stock_unit('d2381fbd-16f3-4563-b5a3-61cbbacd747b', v_nr);
  PERFORM public.set_product_stock_unit('2adf23b7-ad0e-46cc-93ee-d1dea28c675c', v_nr);
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF (SELECT count(*) FROM public.products WHERE id IN ('d2381fbd-16f3-4563-b5a3-61cbbacd747b','2adf23b7-ad0e-46cc-93ee-d1dea28c675c') AND stock_unit_id=v_nr) <> 2 THEN
    RAISE EXCEPTION 'Cambio U.M. di magazzino non riuscito'; END IF;
END
$reset$;
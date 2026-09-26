DO $mig$
DECLARE
  r record; v_def text; v_new text;
  v_guard text := E'BEGIN\n  -- I1: autore = utente realmente autenticato\n  IF auth.uid() IS NULL THEN RAISE EXCEPTION ''Accesso non consentito''; END IF;\n  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION ''Autore non valido: deve coincidere con l''''utente collegato''; END IF;\n  _actor_user_id := auth.uid();\n';
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('manage_shopping_list','add_shopping_list_items','set_shopping_list_item_quantity','remove_shopping_list_item','assign_shopping_list_supplier','create_purchase_orders_from_list','manage_purchase_order','accept_purchase_delivery','dispute_purchase_delivery_item','resolve_purchase_delivery_dispute','create_order_share_link','revoke_order_share_link','open_goods_receipt','set_goods_receipt_item','confirm_goods_receipt','open_lot_reconciliation','resolve_lot_reconciliation','manage_inventory_location','manage_product_stock_settings','manage_inventory_session','record_inventory_count','record_inventory_adjustment','start_general_inventory','close_general_inventory','record_inventory_count_entry','manage_purchase_proposal','manage_company_product_favorite','ensure_internal_archive','add_catalog_product_to_own_products','manage_internal_product','manage_product_supplier_link_unit','set_product_b2b_visibility')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF position('I1: autore' in v_def) > 0 THEN CONTINUE; END IF;
    v_new := regexp_replace(v_def, '\mBEGIN\M\s*\n', v_guard);
    IF v_new = v_def THEN RAISE EXCEPTION 'BEGIN non trovato in %', r.oid::regprocedure; END IF;
    EXECUTE v_new;
    v_count := v_count + 1;
  END LOOP;
  IF v_count <> 32 THEN RAISE EXCEPTION 'Attese 32 funzioni, trovate %', v_count; END IF;
END
$mig$;
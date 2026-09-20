DO $$
DECLARE
  v_names text[] := ARRAY[
    'next_document_number','create_purchase_orders_from_list','manage_purchase_order',
    'open_purchase_delivery','set_purchase_delivery_item','add_purchase_delivery_extra_item',
    'submit_purchase_delivery','accept_purchase_delivery','dispute_purchase_delivery_item',
    'resolve_purchase_delivery_dispute','open_goods_receipt','set_goods_receipt_item',
    'confirm_goods_receipt','open_lot_reconciliation','resolve_lot_reconciliation',
    'create_order_share_link','revoke_order_share_link','purchase_order_overview',
    'delivery_comparison','product_lot_availability','product_lot_reconciliation',
    'goods_receipt_history','order_supplier_company','is_order_supplier','can_declare_on_order',
    'assert_order_items_frozen','deny_history_write','resolve_order_share_token','external_order_snapshot'
  ];
  v_rec record;
BEGIN
  FOR v_rec IN
    SELECT p.oid::regprocedure AS sig, p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY (v_names)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_rec.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_rec.sig);
    IF v_rec.proname NOT IN ('resolve_order_share_token','external_order_snapshot',
                             'assert_order_items_frozen','deny_history_write') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_rec.sig);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_rec.sig);
  END LOOP;
END $$;

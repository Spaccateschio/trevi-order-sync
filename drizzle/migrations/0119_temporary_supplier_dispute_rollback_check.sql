CREATE FUNCTION public.test_receive_purchase_order_rollback(_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $fn$
DECLARE v_result jsonb; v_test jsonb; v_disputes integer; v_after integer; v_declared jsonb; v_preserved boolean; v_notification boolean; v_d public.purchase_deliveries;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.purchase_orders o JOIN public.companies c ON c.id=o.company_id WHERE o.id=(_input->>'order_id')::uuid AND c.legal_name='3 EMME ROMA SRL' AND o.number='ORD-2026-00014' AND public.is_company_member(o.company_id)) THEN RAISE EXCEPTION 'Test consentito solo su ORD-2026-00014 di 3 EMME'; END IF;
  SELECT * INTO v_d FROM public.purchase_deliveries WHERE id=(_input->>'delivery_id')::uuid AND order_id=(_input->>'order_id')::uuid;
  IF v_d.id IS NULL OR v_d.origin NOT IN ('fornitore_link_esterno','fornitore_b2b') THEN RAISE EXCEPTION 'Dichiarazione fornitore obbligatoria'; END IF;
  SELECT count(*) INTO v_disputes FROM public.purchase_delivery_disputes x JOIN public.purchase_delivery_items i ON i.id=x.delivery_item_id WHERE i.delivery_id=v_d.id;
  SELECT jsonb_agg(jsonb_build_object('id',id,'quantity',declared_quantity,'purchase_quantity',declared_purchase_quantity,'weight',declared_weight,'lot',declared_producer_lot) ORDER BY id) INTO v_declared FROM public.purchase_delivery_items WHERE delivery_id=v_d.id;
  BEGIN
    v_result := public.receive_purchase_order((_input->>'order_id')::uuid,_input->'lines',(_input->>'request_key')::uuid,(_input->>'order_version')::timestamptz,(_input->>'delivery_id')::uuid,(_input->>'delivery_version')::timestamptz,NULL);
    SELECT count(*) INTO v_after FROM public.purchase_delivery_disputes x JOIN public.purchase_delivery_items i ON i.id=x.delivery_item_id WHERE i.delivery_id=v_d.id;
    IF v_after<=v_disputes THEN RAISE EXCEPTION 'Nessuna contestazione creata dal test'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.goods_receipts WHERE id=(v_result->>'receipt_id')::uuid AND status='confermato') THEN RAISE EXCEPTION 'Carico di prova non confermato'; END IF;
    SELECT v_declared IS NOT DISTINCT FROM jsonb_agg(jsonb_build_object('id',id,'quantity',declared_quantity,'purchase_quantity',declared_purchase_quantity,'weight',declared_weight,'lot',declared_producer_lot) ORDER BY id) INTO v_preserved FROM public.purchase_delivery_items WHERE delivery_id=v_d.id;
    IF v_d.status<>'bozza' AND NOT v_preserved THEN RAISE EXCEPTION 'Dichiarato fornitore modificato'; END IF;
    SELECT EXISTS(SELECT 1 FROM public.notifications n JOIN public.purchase_orders o ON o.id=n.entity_id JOIN public.supplier_records s ON s.id=o.supplier_record_id WHERE o.id=v_d.order_id AND n.type='consegna_fornitore_confermata' AND n.body=s.legal_name||' ha inserito i dati di consegna. Controllali e accettali.') INTO v_notification;
    IF v_d.status='bozza' AND NOT v_notification THEN RAISE EXCEPTION 'Nome fornitore assente nella notifica'; END IF;
    v_test := jsonb_build_object('completed',true,'receipt_id',v_result->>'receipt_id','delivery_id',v_result->>'delivery_id','rolled_back',true,'disputes_created',v_after-v_disputes,'supplier_declared_unchanged',v_preserved,'notification_name_verified',v_notification,'initial_status',v_d.status);
    RAISE EXCEPTION USING ERRCODE='PZ001', MESSAGE='Intentional test rollback';
  EXCEPTION WHEN SQLSTATE 'PZ001' THEN
    RETURN v_test;
  END;
END;
$fn$;
REVOKE ALL ON FUNCTION public.test_receive_purchase_order_rollback(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.test_receive_purchase_order_rollback(jsonb) TO authenticated;
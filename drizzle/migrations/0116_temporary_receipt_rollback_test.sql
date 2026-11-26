CREATE FUNCTION public.test_receive_purchase_order_rollback(_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $fn$
DECLARE v_result jsonb; v_test jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.purchase_orders o JOIN public.companies c ON c.id=o.company_id WHERE o.id=(_input->>'order_id')::uuid AND c.legal_name='3 EMME ROMA SRL' AND o.number NOT IN ('ORD-2026-00003','ORD-2026-00004','ORD-2026-00005') AND public.is_company_member(o.company_id)) THEN RAISE EXCEPTION 'Test consentito solo su un ordine autorizzato di 3 EMME'; END IF;
  BEGIN
    v_result := public.receive_purchase_order((_input->>'order_id')::uuid,_input->'lines',(_input->>'request_key')::uuid,(_input->>'order_version')::timestamptz,(_input->>'delivery_id')::uuid,(_input->>'delivery_version')::timestamptz,NULL);
    v_test := jsonb_build_object('completed',true,'receipt_id',v_result->>'receipt_id','delivery_id',v_result->>'delivery_id','rolled_back',true);
    RAISE EXCEPTION USING ERRCODE='PZ001', MESSAGE='Intentional test rollback';
  EXCEPTION WHEN SQLSTATE 'PZ001' THEN
    RETURN v_test;
  END;
END;
$fn$;
REVOKE ALL ON FUNCTION public.test_receive_purchase_order_rollback(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.test_receive_purchase_order_rollback(jsonb) TO authenticated;
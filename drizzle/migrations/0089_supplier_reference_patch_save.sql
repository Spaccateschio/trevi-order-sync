CREATE OR REPLACE FUNCTION public.patch_product_supplier_link(_link_id uuid, _patch jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_link public.product_supplier_links; v_key text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
 SELECT * INTO v_link FROM public.product_supplier_links WHERE id=_link_id FOR UPDATE;
 IF NOT FOUND OR NOT public.is_company_admin(v_link.company_id) THEN RAISE EXCEPTION 'Permessi insufficienti'; END IF;
 IF _patch IS NULL OR jsonb_typeof(_patch)<>'object' THEN RAISE EXCEPTION 'Modifiche non valide'; END IF;
 FOR v_key IN SELECT jsonb_object_keys(_patch) LOOP
  IF v_key NOT IN ('supplier_product_code','supplier_reference_label','sourcing_priority','manual_cost','price_unit_id','min_quantity','lead_time_days','notes') THEN RAISE EXCEPTION 'Campo non modificabile: %',v_key; END IF;
 END LOOP;
 IF _patch='{}'::jsonb THEN RETURN _link_id; END IF;
 IF _patch ? 'price_unit_id' AND _patch->>'price_unit_id' IS NOT NULL THEN
  IF NOT EXISTS (SELECT 1 FROM public.units_of_measure WHERE id=(_patch->>'price_unit_id')::uuid AND company_id=v_link.company_id) THEN RAISE EXCEPTION 'U.M. del prezzo non valida'; END IF;
  IF EXISTS (SELECT 1 FROM public.supplier_customer_relations WHERE supplier_record_id=v_link.supplier_record_id AND buyer_company_id=v_link.company_id AND status='attivo') THEN RAISE EXCEPTION 'Fornitore B2B: la U.M. del prezzo arriva dal catalogo del fornitore'; END IF;
 END IF;
 UPDATE public.product_supplier_links SET
 supplier_product_code=CASE WHEN _patch ? 'supplier_product_code' THEN NULLIF(btrim(_patch->>'supplier_product_code'),'') ELSE supplier_product_code END,
 supplier_reference_label=CASE WHEN _patch ? 'supplier_reference_label' THEN NULLIF(btrim(_patch->>'supplier_reference_label'),'') ELSE supplier_reference_label END,
 sourcing_priority=CASE WHEN _patch ? 'sourcing_priority' THEN (_patch->>'sourcing_priority')::smallint ELSE sourcing_priority END,
 manual_cost=CASE WHEN _patch ? 'manual_cost' THEN (_patch->>'manual_cost')::numeric ELSE manual_cost END,
 manual_cost_at=CASE WHEN NOT (_patch ? 'manual_cost') THEN manual_cost_at WHEN _patch->>'manual_cost' IS NULL THEN NULL WHEN manual_cost IS DISTINCT FROM (_patch->>'manual_cost')::numeric THEN now() ELSE manual_cost_at END,
 price_unit_id=CASE WHEN _patch ? 'price_unit_id' THEN (_patch->>'price_unit_id')::uuid ELSE price_unit_id END,
 min_quantity=CASE WHEN _patch ? 'min_quantity' THEN (_patch->>'min_quantity')::numeric ELSE min_quantity END,
 lead_time_days=CASE WHEN _patch ? 'lead_time_days' THEN (_patch->>'lead_time_days')::integer ELSE lead_time_days END,
 notes=CASE WHEN _patch ? 'notes' THEN NULLIF(btrim(_patch->>'notes'),'') ELSE notes END
 WHERE id=_link_id;
 INSERT INTO public.audit_events(company_id,actor_user_id,action,entity_type,entity_id) VALUES(v_link.company_id,auth.uid(),'product_supplier_link.patch','product_supplier_link',_link_id);
 RETURN _link_id;
END $$;
REVOKE ALL ON FUNCTION public.patch_product_supplier_link(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.patch_product_supplier_link(uuid,jsonb) TO authenticated;
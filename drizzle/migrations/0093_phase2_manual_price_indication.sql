CREATE OR REPLACE FUNCTION public.manual_purchase_indication(_link_id uuid,_unit_id uuid,_quantity numeric) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.product_supplier_links; p public.products; d record; eff record; lu uuid; stockcode text; factor numeric; pricefactor numeric:=1; factors integer; total numeric; estimated boolean:=false;
BEGIN
 SELECT * INTO l FROM public.product_supplier_links WHERE id=_link_id;
 IF NOT FOUND OR NOT public.is_company_member(l.company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
 IF l.supplier_company_id IS NOT NULL THEN RETURN NULL; END IF;
 SELECT * INTO p FROM public.products WHERE id=l.product_id;
 SELECT * INTO d FROM public.manual_danea_cost(p.id);
 IF d.cost IS NULL OR d.unit_code IS NULL THEN RETURN NULL; END IF;
 SELECT code INTO stockcode FROM public.units_of_measure WHERE id=p.stock_unit_id;
 IF _unit_id=p.stock_unit_id THEN factor:=1;
 ELSE
  SELECT id INTO lu FROM public.product_supplier_link_units WHERE link_id=_link_id AND unit_id=_unit_id AND is_active;
  IF lu IS NOT NULL THEN
   SELECT * INTO eff FROM public.effective_supplier_conversion(lu);
   IF eff.is_valid THEN factor:=COALESCE(eff.stock_conversion_factor,eff.indicative_factor); estimated:=eff.conversion_mode='variabile'; END IF;
  END IF;
 END IF;
 IF lower(btrim(d.unit_code)) IS DISTINCT FROM lower(btrim(stockcode)) THEN
  SELECT count(distinct pk.stock_quantity),min(pk.stock_quantity) INTO factors,pricefactor FROM public.product_stock_packages pk JOIN public.units_of_measure u ON u.id=pk.unit_id WHERE pk.product_id=p.id AND lower(btrim(u.code))=lower(btrim(d.unit_code)) AND pk.status='attivo' AND pk.verified_stock_unit_id=p.stock_unit_id AND pk.stock_quantity>0;
  IF factors<>1 THEN factor:=NULL; END IF;
 END IF;
 IF factor IS NOT NULL AND pricefactor>0 AND _quantity IS NOT NULL THEN total:=round(_quantity*factor/pricefactor*d.cost,2); END IF;
 RETURN jsonb_build_object('cost',d.cost,'price_unit_code',d.unit_code,'price_quantity',CASE WHEN factor IS NOT NULL AND pricefactor>0 THEN _quantity*factor/pricefactor END,'total',total,'estimated',estimated);
END $$;
REVOKE ALL ON FUNCTION public.manual_purchase_indication(uuid,uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manual_purchase_indication(uuid,uuid,numeric) TO authenticated;
DO $migration$
DECLARE def text; name text;
BEGIN
 FOREACH name IN ARRAY ARRAY['public.close_shopping_list(uuid,uuid,jsonb,text,jsonb,jsonb)','public.create_purchase_orders_from_list(uuid,uuid,uuid,uuid)'] LOOP
 SELECT pg_get_functiondef(name::regprocedure) INTO def;
 def:=replace(def,'THEN l.manual_cost','THEN (SELECT d.cost FROM public.manual_danea_cost(i.product_id) d)');
 def:=replace(def,'THEN l.price_unit_id','THEN (SELECT d.unit_id FROM public.manual_danea_cost(i.product_id) d)');
 def:=replace(def,'CASE WHEN l.supplier_company_id IS NULL OR sp.id IS NULL THEN NULL','CASE WHEN l.supplier_company_id IS NULL THEN (SELECT d.unit_code FROM public.manual_danea_cost(i.product_id) d) WHEN sp.id IS NULL THEN NULL');
 EXECUTE def;
 END LOOP;
 SELECT pg_get_functiondef('public.shopping_list_generation_preview(uuid)'::regprocedure) INTO def;
 def:=replace(def,'a.notes, (SELECT d.cost','r.product_id, a.notes, (SELECT d.cost');
 def:=replace(def,'''in_order'', pr.in_order)','''in_order'', pr.in_order, ''indication'', CASE WHEN pr.supplier_company_id IS NULL THEN public.manual_purchase_indication(pr.link_id,pr.purchase_unit_id,pr.residual) END)');
 EXECUTE def;
END $migration$;
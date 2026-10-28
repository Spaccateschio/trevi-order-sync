CREATE OR REPLACE FUNCTION public.manual_danea_cost(_product_id uuid) RETURNS TABLE(cost numeric,unit_id uuid,unit_code text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN NULLIF(btrim(p.danea_um),'') IS NOT NULL THEN c.supplier_net_price END,
 (SELECT u.id FROM public.units_of_measure u WHERE u.company_id=p.company_id AND lower(btrim(u.code))=lower(btrim(p.danea_um)) ORDER BY u.id LIMIT 1),NULLIF(btrim(p.danea_um),'')
 FROM public.products p LEFT JOIN public.product_supplier_costs c ON c.product_id=p.id WHERE p.id=_product_id AND public.is_company_member(p.company_id);
$$;
REVOKE ALL ON FUNCTION public.manual_danea_cost(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manual_danea_cost(uuid) TO authenticated;
DO $migration$
DECLARE def text; name text;
BEGIN
 FOREACH name IN ARRAY ARRAY['public.inventory_session_rows(uuid,uuid,text,text,text,boolean,integer)','public.inventory_session_progress(uuid)','public.close_general_inventory(uuid,uuid,uuid)'] LOOP
  SELECT pg_get_functiondef(name::regprocedure) INTO def;
  def:=replace(def,'ELSE lower(btrim(c.unit_code)) = lower(btrim(su.code))','ELSE (c.stock_unit_id=p.stock_unit_id AND c.stock_quantity IS NOT NULL) OR lower(btrim(c.unit_code)) = lower(btrim(su.code))');
  def:=replace(def,'WHEN lower(btrim(c.unit_code)) = lower(btrim(su.code)) THEN c.difference','WHEN c.stock_unit_id=p.stock_unit_id AND c.stock_quantity IS NOT NULL THEN c.stock_quantity-c.previous_quantity'||chr(10)||'      WHEN lower(btrim(c.unit_code)) = lower(btrim(su.code)) THEN c.difference');
  def:=replace(def,'SELECT COALESCE(sum(c.counted_quantity), 0) INTO v_new','SELECT COALESCE(sum(COALESCE(c.stock_quantity,c.counted_quantity)), 0) INTO v_new');
  EXECUTE def;
 END LOOP;
 SELECT pg_get_functiondef('public.shopping_item_supplier_units(uuid)'::regprocedure) INTO def;
 def:=replace(def,'''conversion_factor'', lu.conversion_factor,','''conversion_factor'', CASE WHEN eff.is_valid THEN eff.stock_conversion_factor END,');
 def:=replace(def,'''conversion_type'', CASE WHEN lu.conversion_factor IS NOT NULL THEN lu.conversion_type::text END','''conversion_type'', CASE WHEN eff.is_valid AND eff.stock_conversion_factor IS NOT NULL THEN ''esatta'' END');
 def:=replace(def,'WHERE lu.link_id = v_link.id AND lu.is_active','LEFT JOIN LATERAL public.effective_supplier_conversion(lu.id) eff ON true WHERE lu.link_id = v_link.id AND lu.is_active');
 EXECUTE def;
 SELECT pg_get_functiondef('public.product_count_units(uuid,uuid[])'::regprocedure) INTO def;
 def:=replace(def,'lu.conversion_factor, NULL::text AS conversion_reference_um','CASE WHEN eff.is_valid THEN eff.stock_conversion_factor END, NULL::text AS conversion_reference_um');
 def:=replace(def,'JOIN public.product_supplier_link_units lu ON lu.link_id = pl.id AND lu.company_id = _company_id AND lu.is_active','JOIN public.product_supplier_link_units lu ON lu.link_id = pl.id AND lu.company_id = _company_id AND lu.is_active LEFT JOIN LATERAL public.effective_supplier_conversion(lu.id) eff ON true');
 EXECUTE def;
 SELECT pg_get_functiondef('public.generate_supplier_order(uuid,uuid,uuid,jsonb,uuid[])'::regprocedure) INTO def;
 def:=replace(def,'THEN l.manual_cost','THEN (SELECT d.cost FROM public.manual_danea_cost(i.product_id) d)');
 def:=replace(def,'THEN l.price_unit_id','THEN (SELECT d.unit_id FROM public.manual_danea_cost(i.product_id) d)');
 def:=replace(def,'CASE WHEN l.supplier_company_id IS NULL OR sp.id IS NULL THEN NULL','CASE WHEN l.supplier_company_id IS NULL THEN (SELECT d.unit_code FROM public.manual_danea_cost(i.product_id) d) WHEN sp.id IS NULL THEN NULL');
 EXECUTE def;
 SELECT pg_get_functiondef('public.shopping_list_generation_preview(uuid)'::regprocedure) INTO def;
 def:=replace(def,'a.notes, l.manual_cost,','a.notes, (SELECT d.cost FROM public.manual_danea_cost(r.product_id) d) AS manual_cost,');
 def:=replace(def,'(SELECT u.code FROM public.units_of_measure u WHERE u.id = l.price_unit_id) AS manual_price_unit','(SELECT d.unit_code FROM public.manual_danea_cost(r.product_id) d) AS manual_price_unit');
 EXECUTE def;
 FOREACH name IN ARRAY ARRAY['public.close_shopping_list(uuid,uuid)','public.create_purchase_orders_from_list(uuid,uuid)'] LOOP
  IF to_regprocedure(name) IS NOT NULL THEN
   SELECT pg_get_functiondef(name::regprocedure) INTO def;
   -- alternate signatures are inspected separately; no history is rewritten.
  END IF;
 END LOOP;
END $migration$;
COMMENT ON COLUMN public.product_supplier_links.manual_cost IS 'DEPRECATED for manual purchase indications: use product Danea cost in products.danea_um; historical values preserved';
COMMENT ON COLUMN public.product_supplier_links.price_unit_id IS 'DEPRECATED for manual purchase indications: Danea cost unit is products.danea_um; document snapshots preserved';
COMMENT ON COLUMN public.product_supplier_links.min_quantity IS 'DEPRECATED: supplier minimum removed; product warehouse replenishment settings remain';
COMMENT ON COLUMN public.product_supplier_links.sourcing_priority IS 'DEPRECATED: use is_preferred then supplier name';
COMMENT ON COLUMN public.product_supplier_links.supplier_reference_label IS 'DEPRECATED in UI: display supplier name and purchase unit';
COMMENT ON COLUMN public.product_supplier_links.notes IS 'DEPRECATED in supplier-reference UI: preserved legacy values';
COMMENT ON COLUMN public.product_supplier_links.conversion_factor IS 'DEPRECATED supplier configuration: effective_supplier_conversion is authoritative; historical values preserved';
COMMENT ON COLUMN public.product_supplier_links.conversion_reference_um IS 'DEPRECATED supplier conversion configuration: verified stock unit is authoritative';
COMMENT ON COLUMN public.product_supplier_link_units.conversion_factor IS 'DEPRECATED supplier configuration: use effective_supplier_conversion';
COMMENT ON COLUMN public.product_supplier_link_units.conversion_type IS 'DEPRECATED supplier configuration: use conversion_mode and verified stock factors';
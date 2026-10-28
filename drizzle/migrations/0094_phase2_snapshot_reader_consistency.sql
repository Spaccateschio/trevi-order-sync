DO $migration$
DECLARE def text; signature text; old text; predicate text; difference_sql text;
BEGIN
 old := '(c.stock_unit_id=p.stock_unit_id AND c.stock_quantity IS NOT NULL) OR lower(btrim(c.unit_code)) = lower(btrim(su.code))';
 predicate := '(c.stock_unit_id=p.stock_unit_id AND c.stock_quantity IS NOT NULL) OR (c.stock_unit_id IS NULL AND c.stock_quantity IS NULL AND lower(btrim(c.unit_code)) = lower(btrim(su.code)))';
 difference_sql := 'CASE WHEN c.stock_unit_id=p.stock_unit_id AND c.stock_quantity IS NOT NULL THEN c.stock_quantity-c.previous_quantity WHEN c.stock_unit_id IS NULL AND c.stock_quantity IS NULL AND lower(btrim(c.unit_code))=lower(btrim(su.code)) THEN c.difference ELSE NULL END AS difference';
 FOREACH signature IN ARRAY ARRAY['public._inventory_card_stock(uuid,uuid,uuid)','public.inventory_location_stock(uuid,uuid)','public.inventory_session_progress(uuid)','public.inventory_session_rows(uuid,uuid,text,text,text,boolean,integer)','public.close_general_inventory(uuid,uuid,uuid)'] LOOP
 SELECT pg_get_functiondef(signature::regprocedure) INTO def;
 def:=replace(def,old,predicate);
 def:=replace(def,'CASE WHEN c.stock_unit_id=p.stock_unit_id AND c.stock_quantity IS NOT NULL THEN c.stock_quantity ELSE c.counted_quantity END','CASE WHEN c.stock_unit_id=p.stock_unit_id AND c.stock_quantity IS NOT NULL THEN c.stock_quantity WHEN c.stock_unit_id IS NULL AND c.stock_quantity IS NULL AND lower(btrim(c.unit_code))=lower(btrim(su.code)) THEN c.counted_quantity ELSE NULL END');
 IF signature LIKE '%progress%' OR signature LIKE '%close_general%' THEN def:=replace(def,'c.difference,',difference_sql||','); END IF;
 IF signature LIKE '%close_general%' THEN
 def:=replace(def,'    UPDATE public.inventory_sessions SET status = ''completata''','    IF v_not_comparable > 0 THEN RAISE EXCEPTION ''Conteggi con U.M. non confrontabili: verifica le confezioni e riconferma prima di chiudere''; END IF;'||chr(10)||'    UPDATE public.inventory_sessions SET status = ''completata''');
 def:=replace(def,'SELECT COALESCE(sum(COALESCE(c.stock_quantity,c.counted_quantity)), 0) INTO v_new'||chr(10)||'          FROM public.inventory_counts c','SELECT COALESCE(sum(CASE WHEN c.stock_unit_id=p.stock_unit_id AND c.stock_quantity IS NOT NULL THEN c.stock_quantity WHEN c.stock_unit_id IS NULL AND c.stock_quantity IS NULL AND lower(btrim(c.unit_code))=lower(btrim(su.code)) THEN c.counted_quantity END), 0) INTO v_new'||chr(10)||'          FROM public.inventory_counts c JOIN public.products p ON p.id=c.product_id LEFT JOIN public.units_of_measure su ON su.id=p.stock_unit_id');
 END IF;
 EXECUTE def;
 END LOOP;
 SELECT pg_get_functiondef('public.product_supplier_overview(uuid)'::regprocedure) INTO def;
 def:=replace(def,'l.conversion_factor,','(SELECT CASE WHEN e.is_valid THEN e.stock_conversion_factor END FROM public.product_supplier_link_units lu CROSS JOIN LATERAL public.effective_supplier_conversion(lu.id) e WHERE lu.link_id=l.id AND lu.unit_id=l.purchase_unit_id AND lu.is_active LIMIT 1),');
 def:=replace(def,'l.conversion_reference_um,','(SELECT u.code FROM public.products p JOIN public.units_of_measure u ON u.id=p.stock_unit_id WHERE p.id=l.product_id AND EXISTS(SELECT 1 FROM public.product_supplier_link_units lu CROSS JOIN LATERAL public.effective_supplier_conversion(lu.id) e WHERE lu.link_id=l.id AND lu.unit_id=l.purchase_unit_id AND lu.is_active AND e.is_valid AND e.stock_conversion_factor IS NOT NULL)),');
 EXECUTE def;
END $migration$;
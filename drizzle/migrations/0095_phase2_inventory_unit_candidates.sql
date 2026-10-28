CREATE OR REPLACE FUNCTION public.product_count_units(_company_id uuid,_product_ids uuid[]) RETURNS TABLE(product_id uuid,unit_code text,unit_label text,is_base boolean,sources text[],conversion_factor numeric,conversion_reference_um text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
 RETURN QUERY WITH wanted AS(SELECT p.id,p.stock_unit_id FROM public.products p WHERE p.company_id=_company_id AND p.id=ANY(COALESCE(_product_ids,ARRAY[]::uuid[]))), candidates AS(SELECT w.id,w.stock_unit_id,w.stock_unit_id AS unit_id FROM wanted w WHERE w.stock_unit_id IS NOT NULL UNION SELECT w.id,w.stock_unit_id,iu.unit_id FROM wanted w JOIN public.product_inventory_units iu ON iu.product_id=w.id), factors AS(SELECT c.id,c.stock_unit_id,c.unit_id,count(distinct pk.stock_quantity) AS n,min(pk.stock_quantity) AS factor FROM candidates c LEFT JOIN public.product_stock_packages pk ON pk.product_id=c.id AND pk.unit_id=c.unit_id AND pk.status='attivo' AND pk.stock_quantity>0 AND pk.verified_stock_unit_id=c.stock_unit_id GROUP BY c.id,c.stock_unit_id,c.unit_id)
 SELECT f.id,u.code,u.description,f.unit_id=f.stock_unit_id,ARRAY['inventario']::text[],CASE WHEN f.unit_id=f.stock_unit_id THEN 1::numeric WHEN f.n=1 THEN f.factor END,CASE WHEN f.unit_id=f.stock_unit_id OR f.n=1 THEN su.code END FROM factors f JOIN public.units_of_measure u ON u.id=f.unit_id LEFT JOIN public.units_of_measure su ON su.id=f.stock_unit_id ORDER BY f.id,(f.unit_id=f.stock_unit_id) DESC,u.code;
END $$;
REVOKE ALL ON FUNCTION public.product_count_units(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.product_count_units(uuid,uuid[]) TO authenticated;
DO $migration$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.inventory_session_rows(uuid,uuid,text,text,text,boolean,integer)'::regprocedure) INTO def;
 def:=replace(def,'WHEN lower(btrim(c.unit_code)) = lower(btrim(su.code)) THEN c.difference','WHEN c.stock_unit_id IS NULL AND c.stock_quantity IS NULL AND lower(btrim(c.unit_code)) = lower(btrim(su.code)) THEN c.difference');
 EXECUTE def;
END $migration$;
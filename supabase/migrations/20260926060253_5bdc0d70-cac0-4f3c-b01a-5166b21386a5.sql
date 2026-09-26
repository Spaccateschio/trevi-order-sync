REVOKE ALL ON FUNCTION public.manage_unit_of_measure(uuid,uuid,text,text,text,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_product_sale_unit_batch(uuid,uuid[],uuid,text,boolean,numeric,boolean,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_unit_of_measure(uuid,uuid,text,text,text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_product_sale_unit_batch(uuid,uuid[],uuid,text,boolean,numeric,boolean,uuid,text) TO service_role;
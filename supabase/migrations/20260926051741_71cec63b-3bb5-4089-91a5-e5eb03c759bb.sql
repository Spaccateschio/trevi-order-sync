REVOKE ALL ON FUNCTION public.inventory_session_rows(uuid,uuid,text,text,text,boolean,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_requirements(uuid,uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.product_count_units(uuid,uuid[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.inventory_session_rows(uuid,uuid,text,text,text,boolean,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inventory_requirements(uuid,uuid,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.product_count_units(uuid,uuid[]) TO authenticated, service_role;
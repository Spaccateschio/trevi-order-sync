DROP FUNCTION IF EXISTS public.manage_product_supplier_link(uuid, text, uuid, uuid, uuid, text, uuid, numeric, text, numeric, numeric, integer, text, boolean);

REVOKE ALL ON FUNCTION public.manage_product_supplier_link(uuid, text, uuid, uuid, uuid, text, uuid, numeric, text, numeric, numeric, integer, text, boolean, text, smallint) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.manage_product_supplier_link(uuid, text, uuid, uuid, uuid, text, uuid, numeric, text, numeric, numeric, integer, text, boolean, text, smallint) TO authenticated, service_role;
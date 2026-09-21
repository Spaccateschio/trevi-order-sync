REVOKE EXECUTE ON FUNCTION public.ensure_internal_archive(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.next_internal_product_code(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.manage_internal_product(uuid, text, uuid, text, text, text, text, text, text, text, text, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.add_catalog_product_to_own_products(uuid, uuid, uuid, uuid, text, uuid, numeric, uuid) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.ensure_internal_archive(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_internal_product_code(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manage_internal_product(uuid, text, uuid, text, text, text, text, text, text, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_catalog_product_to_own_products(uuid, uuid, uuid, uuid, text, uuid, numeric, uuid) TO authenticated, service_role;
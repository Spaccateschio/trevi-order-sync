REVOKE EXECUTE ON FUNCTION public.sync_danea_product_supplier_links(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_danea_product_supplier_links(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.ensure_default_inventory_location(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_default_inventory_location(uuid, uuid) TO service_role;
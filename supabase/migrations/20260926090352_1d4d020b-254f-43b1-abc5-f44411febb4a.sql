REVOKE EXECUTE ON FUNCTION public.inventory_location_stock(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_location_stock(uuid, uuid) TO service_role;
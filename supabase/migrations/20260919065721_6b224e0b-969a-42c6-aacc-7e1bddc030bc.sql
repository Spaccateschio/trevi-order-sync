ALTER FUNCTION public.compute_purchase_need(numeric, numeric, numeric, numeric) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.compute_purchase_need(numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.inventory_location_stock(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.product_stock_overview(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.inventory_requirements(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ensure_default_inventory_location(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.manage_inventory_location(uuid, text, uuid, text, text, text, boolean, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.manage_product_stock_settings(uuid, uuid[], numeric, numeric, uuid, integer, text, text, text[], uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.manage_inventory_session(uuid, text, uuid, uuid, text, public.inventory_session_scope, uuid, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_inventory_count(uuid, uuid, uuid, uuid, numeric, uuid, text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_inventory_adjustment(uuid, uuid, uuid, numeric, text, text, uuid) FROM PUBLIC, anon;
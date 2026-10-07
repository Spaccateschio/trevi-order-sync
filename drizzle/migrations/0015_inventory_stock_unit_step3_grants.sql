GRANT EXECUTE ON FUNCTION public.inventory_session_rows(uuid, uuid, text, text, text, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_location_stock(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_session_progress(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_general_inventory(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_inventory_adjustment(uuid, uuid, uuid, numeric, text, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_inventory_count_entry(uuid, uuid, uuid, uuid, text, numeric, uuid, text, text, boolean, numeric, uuid) TO authenticated;
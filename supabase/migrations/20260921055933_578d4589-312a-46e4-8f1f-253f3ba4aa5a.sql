REVOKE ALL ON FUNCTION public.validate_product_supplier_link_unit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_supplier_link_default_unit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manage_product_supplier_link_unit(uuid, uuid, uuid, text, numeric, public.sale_conversion_type, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.product_supplier_overview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manage_product_supplier_link_unit(uuid, uuid, uuid, text, numeric, public.sale_conversion_type, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.product_supplier_overview(uuid) TO authenticated, service_role;
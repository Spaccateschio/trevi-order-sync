DO $migration$
DECLARE def text; old_read text; new_read text; old_guard text; new_guard text;
BEGIN
  old_read := $old$WHERE lu.link_id = v_link.id AND lu.is_active AND lu.unit_id IS DISTINCT FROM v_stock) q;$old$;
  new_read := $new$WHERE lu.link_id = v_link.id AND lu.is_active AND lu.unit_id IS DISTINCT FROM v_stock
        UNION ALL
        SELECT jsonb_build_object('unit_id', pu.unit_id, 'code', um.code, 'is_default', pu.is_default,
                                  'conversion_factor', NULL, 'conversion_type', NULL)
          FROM public.product_purchase_units pu JOIN public.units_of_measure um ON um.id = pu.unit_id
         WHERE pu.product_id = v_item.product_id AND pu.company_id = v_item.company_id
           AND um.company_id = v_item.company_id AND um.status = 'attivo' AND um.usage IN ('acquisto','entrambi')
           AND pu.unit_id IS DISTINCT FROM v_stock
           AND NOT EXISTS (SELECT 1 FROM public.product_supplier_link_units lu WHERE lu.link_id = v_link.id AND lu.unit_id = pu.unit_id AND lu.is_active)) q;$new$;
  SELECT pg_get_functiondef('public.shopping_item_supplier_units(uuid)'::regprocedure) INTO def;
  IF strpos(def, old_read) = 0 THEN RAISE EXCEPTION 'Lettura U.M. inattesa: nessuna modifica applicata'; END IF;
  EXECUTE replace(def, old_read, new_read);
  old_guard := $old$    IF NOT FOUND THEN RAISE EXCEPTION 'U.M. di acquisto non abilitata per questa referenza'; END IF;
    v_unit_id := _purchase_unit_id;
    SELECT * INTO v_effective FROM public.effective_supplier_conversion(v_lu);
    v_factor:=CASE WHEN v_effective.is_valid THEN v_effective.stock_conversion_factor END;
    v_ctype:=CASE WHEN v_factor IS NOT NULL THEN 'esatta'::public.sale_conversion_type END;$old$;
  new_guard := $new$    IF FOUND THEN
      SELECT * INTO v_effective FROM public.effective_supplier_conversion(v_lu);
      v_factor := CASE WHEN v_effective.is_valid THEN v_effective.stock_conversion_factor END;
      v_ctype := CASE WHEN v_factor IS NOT NULL THEN 'esatta'::public.sale_conversion_type END;
    ELSE
      SELECT um.code INTO v_unit_code
        FROM public.product_purchase_units pu JOIN public.units_of_measure um ON um.id = pu.unit_id
       WHERE pu.product_id = v_item.product_id AND pu.company_id = _company_id AND pu.unit_id = _purchase_unit_id
         AND um.company_id = _company_id AND um.status = 'attivo' AND um.usage IN ('acquisto','entrambi');
      IF NOT FOUND THEN RAISE EXCEPTION 'U.M. di acquisto non abilitata per questa referenza'; END IF;
      v_factor := NULL; v_ctype := NULL;
    END IF;
    v_unit_id := _purchase_unit_id;$new$;
  SELECT pg_get_functiondef(oid) INTO STRICT def FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='assign_shopping_list_supplier';
  IF strpos(def, old_guard) = 0 THEN RAISE EXCEPTION 'Controllo U.M. inatteso: nessuna modifica applicata'; END IF;
  EXECUTE replace(def, old_guard, new_guard);
END;
$migration$;
COMMENT ON FUNCTION public.shopping_item_supplier_units(uuid) IS 'Manual supplier options include active company-scoped product purchase units without inferred conversions; seller-published B2B units remain unchanged.';
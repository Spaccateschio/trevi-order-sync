CREATE OR REPLACE FUNCTION public._unit_offered_by_other_links(_company_id uuid, _item_id uuid, _excluded_link_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
-- Confronto per CODICE normalizzato: le U.M. B2B sono del venditore (UUID diversi dall'acquirente).
-- Sempre valide: U.M. di magazzino del prodotto (products.stock_unit_id), U.M. della riga.
DECLARE
  v_item record; v_code text; v_stock_code text; v_prod_stock_code text; v_row_code text; v_link record; v_src record;
BEGIN
  SELECT i.id, i.product_id, i.unit_id, i.unit_code, i.decided_unit_id, i.decided_unit_code
    INTO v_item FROM public.shopping_list_items i
   WHERE i.id = _item_id AND i.company_id = _company_id;
  IF v_item.id IS NULL THEN RETURN true; END IF;
  v_code := upper(btrim(regexp_replace(COALESCE(NULLIF(btrim(v_item.decided_unit_code), ''),
              (SELECT u.code FROM public.units_of_measure u WHERE u.id = v_item.decided_unit_id), ''), '\s+', ' ', 'g')));
  IF v_code = '' THEN RETURN true; END IF;
  SELECT upper(btrim(regexp_replace(COALESCE(u.code, ''), '\s+', ' ', 'g'))) INTO v_stock_code
    FROM public.units_of_measure u WHERE u.id = public.shopping_item_stock_unit_id(_item_id);
  SELECT upper(btrim(regexp_replace(COALESCE(u.code, ''), '\s+', ' ', 'g'))) INTO v_prod_stock_code
    FROM public.products p JOIN public.units_of_measure u ON u.id = p.stock_unit_id
   WHERE p.id = v_item.product_id AND p.company_id = _company_id;
  v_row_code := upper(btrim(regexp_replace(COALESCE(NULLIF(btrim(v_item.unit_code), ''),
              (SELECT u.code FROM public.units_of_measure u WHERE u.id = v_item.unit_id), ''), '\s+', ' ', 'g')));
  IF v_code = COALESCE(v_stock_code, '') OR v_code = COALESCE(v_prod_stock_code, '') OR v_code = v_row_code THEN
    RETURN true;
  END IF;
  FOR v_link IN
    SELECT l.id FROM public.product_supplier_links l
     WHERE l.company_id = _company_id AND l.product_id = v_item.product_id
       AND l.is_active AND l.id <> _excluded_link_id
  LOOP
    SELECT * INTO v_src FROM public.shopping_link_b2b_source(_company_id, v_link.id);
    IF COALESCE(v_src.is_b2b, false) THEN
      IF EXISTS (SELECT 1 FROM public.product_sale_units su JOIN public.units_of_measure um ON um.id = su.unit_id
                  WHERE v_src.source_product_id IS NOT NULL AND su.product_id = v_src.source_product_id
                    AND su.is_active AND su.is_customer_visible
                    AND upper(btrim(regexp_replace(um.code, '\s+', ' ', 'g'))) = v_code) THEN
        RETURN true;
      END IF;
    ELSE
      IF EXISTS (SELECT 1 FROM public.product_supplier_link_units lu JOIN public.units_of_measure um ON um.id = lu.unit_id
                  WHERE lu.link_id = v_link.id AND lu.is_active
                    AND upper(btrim(regexp_replace(um.code, '\s+', ' ', 'g'))) = v_code) THEN
        RETURN true;
      END IF;
    END IF;
  END LOOP;
  RETURN false;
END;
$function$;
REVOKE ALL ON FUNCTION public._unit_offered_by_other_links(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._unit_offered_by_other_links(uuid, uuid, uuid) TO service_role;
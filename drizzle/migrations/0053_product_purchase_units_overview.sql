-- Sola lettura: U.M. di acquisto per fornitore di tutti i prodotti dell'azienda (pagina Prodotti).
-- B2B: stessa regola della Lista (shopping_link_b2b_source + U.M. di vendita del venditore attive e visibili ai clienti, solo se acquistabile).
-- Esterni: solo U.M. attive configurate sul collegamento; nessuna U.M. sostitutiva, nessuna conversione.
CREATE OR REPLACE FUNCTION public.product_purchase_units_overview(_company_id uuid)
RETURNS TABLE(product_id uuid, link_id uuid, supplier_record_id uuid, supplier_name text,
              is_b2b boolean, purchasable boolean, is_preferred boolean, units jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_link record; v_src record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  FOR v_link IN
    SELECT l.id, l.product_id, l.supplier_record_id, l.is_preferred, sr.legal_name
      FROM public.product_supplier_links l
      LEFT JOIN public.supplier_records sr ON sr.id = l.supplier_record_id
     WHERE l.company_id = _company_id AND l.is_active
  LOOP
    SELECT * INTO v_src FROM public.shopping_link_b2b_source(_company_id, v_link.id);
    product_id := v_link.product_id;
    link_id := v_link.id;
    supplier_record_id := v_link.supplier_record_id;
    supplier_name := v_link.legal_name;
    is_b2b := COALESCE(v_src.is_b2b, false);
    purchasable := COALESCE(v_src.purchasable, true);
    is_preferred := COALESCE(v_link.is_preferred, false);
    IF is_b2b THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('code', um.code, 'is_default', su.is_default)
               ORDER BY su.is_default DESC, um.code), '[]'::jsonb)
        INTO units
        FROM public.product_sale_units su JOIN public.units_of_measure um ON um.id = su.unit_id
       WHERE v_src.source_product_id IS NOT NULL AND COALESCE(v_src.purchasable, false)
         AND su.product_id = v_src.source_product_id AND su.is_active AND su.is_customer_visible;
    ELSE
      SELECT COALESCE(jsonb_agg(jsonb_build_object('code', um.code, 'is_default', lu.is_default)
               ORDER BY lu.is_default DESC, um.code), '[]'::jsonb)
        INTO units
        FROM public.product_supplier_link_units lu JOIN public.units_of_measure um ON um.id = lu.unit_id
       WHERE lu.link_id = v_link.id AND lu.is_active;
    END IF;
    RETURN NEXT;
  END LOOP;
END; $function$;

REVOKE ALL ON FUNCTION public.product_purchase_units_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.product_purchase_units_overview(uuid) TO authenticated;
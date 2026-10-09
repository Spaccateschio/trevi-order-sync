-- 0036: una sola regola di acquistabilità B2B (b2b_item_purchasable) e sorgente B2B = product_supplier_links.b2b_item_id.
-- Le funzioni esistenti sono modificate applicando al testo attuale le stesse sostituzioni provate in transazione annullata.
CREATE FUNCTION public.b2b_item_purchasable(_seller_company_id uuid, _buyer_company_id uuid, _product_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.relation_is_operational(_seller_company_id, _buyer_company_id)
     AND EXISTS (SELECT 1 FROM public.products p
                  WHERE p.id = _product_id AND p.company_id = _seller_company_id
                    AND p.publish_status = 'pubblicato' AND p.b2b_visible);
$function$;
REVOKE ALL ON FUNCTION public.b2b_item_purchasable(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.b2b_item_purchasable(uuid, uuid, uuid) TO service_role;

DO $m$
DECLARE
  v_def text; v_old text; v_units text;
  chk text := $c$
  SELECT string_agg(DISTINCT p.description, ', '), string_agg(DISTINCT COALESCE(sr.legal_name, 'fornitore'), ', ')
    INTO v_bad, v_bad_sup
    FROM public.shopping_list_item_suppliers a
    JOIN public.shopping_list_items i ON i.id = a.item_id
    JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
    JOIN public.products p ON p.id = i.product_id
    LEFT JOIN public.supplier_records sr ON sr.id = l.supplier_record_id
   WHERE i.list_id = _list_id AND l.supplier_company_id IS NOT NULL
     AND (l.b2b_item_id IS NULL OR NOT public.b2b_item_purchasable(l.supplier_company_id, _company_id, l.b2b_item_id));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Il prodotto % non è più disponibile nel Catalogo B2B di %. Modifica la ripartizione prima di chiudere la Lista.', v_bad, v_bad_sup;
  END IF;$c$;
  anc text := $c$togli la ripartizione prima di generare gli ordini (%)', v_bad;
  END IF;$c$;
BEGIN
  v_def := pg_get_functiondef('public.applicable_b2b_price(uuid,uuid,uuid)'::regprocedure);
  v_old := $c$  JOIN public.products p
    ON p.id = pp.product_id AND p.publish_status = 'pubblicato' AND p.b2b_visible
  WHERE pp.company_id = _seller_company_id
    AND pp.product_id = _product_id$c$;
  IF position(v_old in v_def) = 0 THEN RAISE EXCEPTION 'patch applicable_b2b_price'; END IF;
  EXECUTE replace(v_def, v_old, $c$  WHERE pp.company_id = _seller_company_id
    AND pp.product_id = _product_id
    AND public.b2b_item_purchasable(_seller_company_id, _buyer_company_id, _product_id)$c$);

  v_units := pg_get_functiondef('public.shopping_item_supplier_units(uuid)'::regprocedure);
  DROP FUNCTION public.shopping_item_supplier_units(uuid);
  DROP FUNCTION public.shopping_link_b2b_source(uuid, uuid);
  EXECUTE $q$CREATE FUNCTION public.shopping_link_b2b_source(_company_id uuid, _link_id uuid)
 RETURNS TABLE(is_b2b boolean, source_product_id uuid, purchasable boolean, seller_company_id uuid)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT (r.id IS NOT NULL),
         CASE WHEN r.id IS NOT NULL THEN l.b2b_item_id END,
         CASE WHEN r.id IS NULL THEN true
              ELSE l.b2b_item_id IS NOT NULL
                   AND public.b2b_item_purchasable(r.seller_company_id, _company_id, l.b2b_item_id) END,
         r.seller_company_id
    FROM public.product_supplier_links l
    LEFT JOIN LATERAL (
      SELECT x.id, x.seller_company_id FROM public.supplier_customer_relations x
       WHERE x.supplier_record_id = l.supplier_record_id AND x.buyer_company_id = _company_id
         AND x.status = 'attivo' AND public.relation_is_operational(x.seller_company_id, _company_id)
       LIMIT 1) r ON true
   WHERE l.id = _link_id AND l.company_id = _company_id;
$function$$q$;
  REVOKE ALL ON FUNCTION public.shopping_link_b2b_source(uuid, uuid) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.shopping_link_b2b_source(uuid, uuid) TO service_role;

  v_units := replace(v_units, 'CREATE OR REPLACE FUNCTION', 'CREATE FUNCTION');
  v_units := replace(v_units, 'allow_manual boolean, units jsonb)', 'allow_manual boolean, units jsonb, source_product_id uuid, purchasable boolean, seller_company_id uuid, price_unit_code text)');
  v_units := replace(v_units, 'allow_manual := NOT is_b2b;', $c$allow_manual := NOT is_b2b;
    source_product_id := v_src.source_product_id;
    purchasable := COALESCE(v_src.purchasable, true);
    seller_company_id := v_src.seller_company_id;
    price_unit_code := NULL;
    IF is_b2b AND v_src.source_product_id IS NOT NULL THEN
      SELECT NULLIF(btrim(COALESCE(u.code, sp.danea_um, '')), '') INTO price_unit_code
        FROM public.products sp LEFT JOIN public.units_of_measure u ON u.id = sp.price_unit_id
       WHERE sp.id = v_src.source_product_id;
    END IF;$c$);
  v_units := replace(v_units, 'WHERE v_src.source_product_id IS NOT NULL AND su.product_id', 'WHERE v_src.source_product_id IS NOT NULL AND COALESCE(v_src.purchasable, false) AND su.product_id');
  IF position('price_unit_code text)' in v_units) = 0 OR position('COALESCE(v_src.purchasable, false) AND su.product_id' in v_units) = 0 THEN RAISE EXCEPTION 'patch units'; END IF;
  EXECUTE v_units;
  REVOKE ALL ON FUNCTION public.shopping_item_supplier_units(uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.shopping_item_supplier_units(uuid) TO authenticated, service_role;

  v_def := pg_get_functiondef('public._unit_offered_by_other_links(uuid,uuid,uuid)'::regprocedure);
  IF position('    IF COALESCE(v_src.is_b2b, false) THEN' in v_def) = 0 THEN RAISE EXCEPTION 'patch offered'; END IF;
  EXECUTE replace(v_def, '    IF COALESCE(v_src.is_b2b, false) THEN', $c$    IF COALESCE(v_src.is_b2b, false) AND NOT COALESCE(v_src.purchasable, false) THEN
      CONTINUE;
    ELSIF COALESCE(v_src.is_b2b, false) THEN$c$);

  v_def := pg_get_functiondef('public.assign_shopping_list_supplier(uuid,uuid,text,uuid,numeric,numeric,boolean,text,uuid,uuid,uuid,text)'::regprocedure);
  v_old := $c$    IF v_manual IS NOT NULL THEN RAISE EXCEPTION 'Per i fornitori B2B$c$;
  IF position(v_old in v_def) = 0 THEN RAISE EXCEPTION 'patch assign'; END IF;
  EXECUTE replace(v_def, v_old, $c$    IF NOT COALESCE(v_src.purchasable, false) THEN RAISE EXCEPTION 'Non in catalogo del fornitore: articolo non acquistabile'; END IF;
$c$ || v_old);

  v_def := pg_get_functiondef('public.close_shopping_list(uuid,uuid,jsonb,text,jsonb,jsonb)'::regprocedure);
  IF position(anc in v_def) = 0 THEN RAISE EXCEPTION 'patch close'; END IF;
  EXECUTE replace(replace(v_def, anc, anc || chk), 'v_bad text;', 'v_bad text; v_bad_sup text;');
  v_def := pg_get_functiondef('public.create_purchase_orders_from_list(uuid,uuid,uuid,uuid)'::regprocedure);
  IF position(anc in v_def) = 0 THEN RAISE EXCEPTION 'patch create'; END IF;
  EXECUTE replace(replace(v_def, anc, anc || chk), 'v_bad text;', 'v_bad text; v_bad_sup text;');
END $m$;

-- Card «Da valutare»: sola lettura per prodotto; acquistabilità solo da shopping_link_b2b_source.
CREATE FUNCTION public.product_supplier_b2b_options(_company_id uuid, _product_id uuid)
 RETURNS TABLE(link_id uuid, supplier_record_id uuid, is_b2b boolean, source_product_id uuid, purchasable boolean, seller_company_id uuid, price_unit_code text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_link record; v_src record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  FOR v_link IN SELECT l.id, l.supplier_record_id FROM public.product_supplier_links l
                 WHERE l.company_id = _company_id AND l.product_id = _product_id AND l.is_active LOOP
    SELECT * INTO v_src FROM public.shopping_link_b2b_source(_company_id, v_link.id);
    link_id := v_link.id;
    supplier_record_id := v_link.supplier_record_id;
    is_b2b := COALESCE(v_src.is_b2b, false);
    source_product_id := v_src.source_product_id;
    purchasable := COALESCE(v_src.purchasable, true);
    seller_company_id := v_src.seller_company_id;
    price_unit_code := NULL;
    IF is_b2b AND v_src.source_product_id IS NOT NULL THEN
      SELECT NULLIF(btrim(COALESCE(u.code, sp.danea_um, '')), '') INTO price_unit_code
        FROM public.products sp LEFT JOIN public.units_of_measure u ON u.id = sp.price_unit_id
       WHERE sp.id = v_src.source_product_id;
    END IF;
    RETURN NEXT;
  END LOOP;
END; $function$;
REVOKE ALL ON FUNCTION public.product_supplier_b2b_options(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.product_supplier_b2b_options(uuid, uuid) TO authenticated, service_role;
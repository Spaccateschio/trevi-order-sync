DROP INDEX IF EXISTS public.shopping_list_item_suppliers_unique;
CREATE UNIQUE INDEX shopping_list_item_suppliers_unique_unit
  ON public.shopping_list_item_suppliers (item_id, product_supplier_link_id, purchase_unit_id)
  WHERE purchase_unit_id IS NOT NULL;
CREATE UNIQUE INDEX shopping_list_item_suppliers_unique_manual
  ON public.shopping_list_item_suppliers (item_id, product_supplier_link_id, upper(btrim(purchase_unit_code)))
  WHERE purchase_unit_id IS NULL AND purchase_unit_code IS NOT NULL;

-- Stato riga: U.M. collegata valida OPPURE U.M. manuale valida.
CREATE OR REPLACE FUNCTION public.shopping_list_item_state(_item_id uuid)
 RETURNS TABLE(assigned numeric, remaining numeric, status text, untranslatable integer, under_minimum integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH item AS (
    SELECT i.id, i.decided_quantity, i.purchase_mode FROM public.shopping_list_items i WHERE i.id = _item_id
  ), asg AS (
    SELECT a.assigned_quantity, a.purchase_quantity, a.purchase_unit_id, l.min_quantity, a.min_warning_accepted,
           ((a.purchase_quantity > 0 AND (a.purchase_unit_id IS NOT NULL OR btrim(COALESCE(a.purchase_unit_code, '')) <> ''))
             OR (a.purchase_quantity IS NULL AND a.assigned_quantity > 0)) AS valid
      FROM public.shopping_list_item_suppliers a
      JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
     WHERE a.item_id = _item_id
  ), agg AS (
    SELECT COALESCE(sum(assigned_quantity), 0) AS assigned,
           COUNT(*) FILTER (WHERE valid) AS valid_n,
           COUNT(*) FILTER (WHERE assigned_quantity IS NULL)::int AS untranslatable,
           COUNT(*) FILTER (
             WHERE min_quantity IS NOT NULL AND assigned_quantity IS NOT NULL
               AND assigned_quantity < min_quantity AND NOT min_warning_accepted)::int AS under_minimum
      FROM asg
  )
  SELECT agg.assigned,
         item.decided_quantity - agg.assigned,
         CASE
           WHEN item.purchase_mode = 'manuale' THEN 'manuale'
           WHEN agg.valid_n = 0 THEN 'da_assegnare'
           WHEN item.decided_quantity IS NOT NULL AND agg.untranslatable = 0
                AND agg.assigned < item.decided_quantity THEN 'parziale'
           ELSE 'assegnata'
         END,
         agg.untranslatable,
         agg.under_minimum
    FROM item CROSS JOIN agg;
$function$;

-- Contesto B2B di una referenza: relazione attiva + prodotto originale del venditore (solo created_from_product_id).
CREATE OR REPLACE FUNCTION public.shopping_link_b2b_source(_company_id uuid, _link_id uuid)
 RETURNS TABLE(is_b2b boolean, source_product_id uuid)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT (r.id IS NOT NULL),
         CASE WHEN r.id IS NOT NULL AND p.created_from_company_id = r.seller_company_id THEN p.created_from_product_id END
    FROM public.product_supplier_links l
    JOIN public.products p ON p.id = l.product_id
    LEFT JOIN LATERAL (
      SELECT x.id, x.seller_company_id FROM public.supplier_customer_relations x
       WHERE x.supplier_record_id = l.supplier_record_id AND x.buyer_company_id = _company_id
         AND x.status = 'attivo' AND public.relation_is_operational(x.seller_company_id, _company_id)
       LIMIT 1) r ON true
   WHERE l.id = _link_id AND l.company_id = _company_id;
$function$;
REVOKE EXECUTE ON FUNCTION public.shopping_link_b2b_source(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shopping_link_b2b_source(uuid, uuid) TO service_role;

-- U.M. disponibili per ogni fornitore di una riga della Lista.
CREATE OR REPLACE FUNCTION public.shopping_item_supplier_units(_item_id uuid)
 RETURNS TABLE(link_id uuid, is_b2b boolean, source_linked boolean, allow_manual boolean, units jsonb)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_item record; v_stock uuid; v_link record; v_src record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT i.id, i.company_id, i.product_id, i.unit_code INTO v_item FROM public.shopping_list_items i WHERE i.id = _item_id;
  IF v_item.id IS NULL OR NOT public.is_company_member(v_item.company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  v_stock := public.shopping_item_stock_unit_id(_item_id);
  FOR v_link IN SELECT l.id FROM public.product_supplier_links l
                 WHERE l.product_id = v_item.product_id AND l.company_id = v_item.company_id AND l.is_active LOOP
    SELECT * INTO v_src FROM public.shopping_link_b2b_source(v_item.company_id, v_link.id);
    link_id := v_link.id;
    is_b2b := COALESCE(v_src.is_b2b, false);
    source_linked := v_src.source_product_id IS NOT NULL;
    allow_manual := NOT is_b2b;
    IF is_b2b THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'unit_id', su.unit_id, 'code', um.code, 'is_default', su.is_default,
               'conversion_factor', CASE WHEN lower(btrim(um.code)) = lower(btrim(COALESCE(v_item.unit_code, ''))) THEN 1
                                         WHEN lower(btrim(COALESCE(su.conversion_reference_um, ''))) = lower(btrim(COALESCE(v_item.unit_code, '#'))) THEN su.conversion_factor END,
               'conversion_type', CASE WHEN lower(btrim(um.code)) = lower(btrim(COALESCE(v_item.unit_code, ''))) THEN 'esatta'
                                       WHEN lower(btrim(COALESCE(su.conversion_reference_um, ''))) = lower(btrim(COALESCE(v_item.unit_code, '#'))) AND su.conversion_factor IS NOT NULL THEN su.conversion_type::text END
             ) ORDER BY su.is_default DESC, um.code), '[]'::jsonb)
        INTO units
        FROM public.product_sale_units su JOIN public.units_of_measure um ON um.id = su.unit_id
       WHERE v_src.source_product_id IS NOT NULL AND su.product_id = v_src.source_product_id
         AND su.is_active AND su.is_customer_visible;
    ELSE
      SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'is_default')::boolean DESC, x->>'code'), '[]'::jsonb) INTO units FROM (
        SELECT jsonb_build_object('unit_id', um.id, 'code', um.code, 'is_default', false,
                                  'conversion_factor', 1, 'conversion_type', 'esatta') x
          FROM public.units_of_measure um WHERE um.id = v_stock
        UNION ALL
        SELECT jsonb_build_object('unit_id', lu.unit_id, 'code', um.code, 'is_default', lu.is_default,
                                  'conversion_factor', lu.conversion_factor,
                                  'conversion_type', CASE WHEN lu.conversion_factor IS NOT NULL THEN lu.conversion_type::text END)
          FROM public.product_supplier_link_units lu JOIN public.units_of_measure um ON um.id = lu.unit_id
         WHERE lu.link_id = v_link.id AND lu.is_active AND lu.unit_id IS DISTINCT FROM v_stock) q;
    END IF;
    RETURN NEXT;
  END LOOP;
END; $function$;
REVOKE EXECUTE ON FUNCTION public.shopping_item_supplier_units(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shopping_item_supplier_units(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.assign_shopping_list_supplier(uuid, uuid, text, uuid, numeric, numeric, boolean, text, uuid, uuid, uuid);
CREATE FUNCTION public.assign_shopping_list_supplier(_company_id uuid, _item_id uuid, _action text, _link_id uuid DEFAULT NULL::uuid, _assigned_quantity numeric DEFAULT NULL::numeric, _purchase_quantity numeric DEFAULT NULL::numeric, _min_warning_accepted boolean DEFAULT false, _notes text DEFAULT NULL::text, _actor_user_id uuid DEFAULT NULL::uuid, _purchase_unit_id uuid DEFAULT NULL::uuid, _assignment_id uuid DEFAULT NULL::uuid, _manual_unit_code text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_item record; v_stock_unit uuid; v_stock_code text; v_link record; v_src record;
  v_unit_id uuid; v_unit_code text; v_factor numeric; v_ctype public.sale_conversion_type;
  v_qty numeric; v_equiv numeric; v_id uuid; v_manual text; v_ref text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT i.id, i.product_id, i.unit_id, i.unit_code INTO v_item FROM public.shopping_list_items i
   WHERE i.id = _item_id AND i.company_id = _company_id;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Riga non trovata'; END IF;
  v_stock_unit := public.shopping_item_stock_unit_id(_item_id);
  v_stock_code := v_item.unit_code;

  IF _action = 'remove' THEN
    IF _assignment_id IS NOT NULL THEN
      DELETE FROM public.shopping_list_item_suppliers WHERE id = _assignment_id AND item_id = _item_id;
    ELSE
      DELETE FROM public.shopping_list_item_suppliers WHERE item_id = _item_id AND product_supplier_link_id = _link_id;
    END IF;
    RETURN _item_id;
  ELSIF _action <> 'set' THEN
    RAISE EXCEPTION 'Azione non valida';
  END IF;

  SELECT l.* INTO v_link FROM public.product_supplier_links l
   WHERE l.id = _link_id AND l.company_id = _company_id AND l.product_id = v_item.product_id;
  IF v_link.id IS NULL THEN RAISE EXCEPTION 'Fornitore non associato a questo prodotto'; END IF;
  IF NOT v_link.is_active THEN RAISE EXCEPTION 'Associazione fornitore non attiva'; END IF;

  v_qty := _purchase_quantity;
  IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'Quantità d''acquisto non valida'; END IF;

  v_manual := NULLIF(upper(regexp_replace(btrim(COALESCE(_manual_unit_code, '')), '\s+', ' ', 'g')), '');
  IF v_manual IS NOT NULL AND length(v_manual) > 20 THEN RAISE EXCEPTION 'U.M. troppo lunga (massimo 20 caratteri)'; END IF;
  IF _purchase_unit_id IS NULL AND v_manual IS NULL THEN
    RAISE EXCEPTION 'U.M. d''acquisto obbligatoria: sceglila esplicitamente';
  END IF;
  IF _purchase_unit_id IS NOT NULL AND v_manual IS NOT NULL THEN
    RAISE EXCEPTION 'Indica una U.M. esistente oppure un''altra U.M., non entrambe';
  END IF;

  SELECT * INTO v_src FROM public.shopping_link_b2b_source(_company_id, v_link.id);

  IF COALESCE(v_src.is_b2b, false) THEN
    IF v_manual IS NOT NULL THEN RAISE EXCEPTION 'Per i fornitori B2B la U.M. la decide il venditore'; END IF;
    IF v_src.source_product_id IS NULL THEN RAISE EXCEPTION 'Prodotto del fornitore non collegato: U.M. non disponibili'; END IF;
    SELECT um.code, su.conversion_factor, su.conversion_type, su.conversion_reference_um
      INTO v_unit_code, v_factor, v_ctype, v_ref
      FROM public.product_sale_units su JOIN public.units_of_measure um ON um.id = su.unit_id
     WHERE su.product_id = v_src.source_product_id AND su.unit_id = _purchase_unit_id
       AND su.is_active AND su.is_customer_visible;
    IF NOT FOUND THEN RAISE EXCEPTION 'U.M. non pubblicata dal venditore'; END IF;
    v_unit_id := _purchase_unit_id;
    IF lower(btrim(v_unit_code)) = lower(btrim(COALESCE(v_stock_code, ''))) THEN
      v_factor := 1; v_ctype := 'esatta';
    ELSIF v_factor IS NULL OR v_factor <= 0 OR lower(btrim(COALESCE(v_ref, ''))) <> lower(btrim(COALESCE(v_stock_code, '#'))) THEN
      v_factor := NULL; v_ctype := NULL;
    END IF;
  ELSIF v_manual IS NOT NULL THEN
    v_unit_id := NULL; v_unit_code := v_manual; v_factor := NULL; v_ctype := NULL;
  ELSIF _purchase_unit_id = v_stock_unit THEN
    v_unit_id := v_stock_unit;
    SELECT code INTO v_unit_code FROM public.units_of_measure WHERE id = v_unit_id;
    v_factor := 1; v_ctype := 'esatta';
  ELSE
    SELECT um.code, lu.conversion_factor, lu.conversion_type INTO v_unit_code, v_factor, v_ctype
      FROM public.product_supplier_link_units lu JOIN public.units_of_measure um ON um.id = lu.unit_id
     WHERE lu.link_id = v_link.id AND lu.unit_id = _purchase_unit_id AND lu.is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'U.M. di acquisto non abilitata per questa referenza'; END IF;
    v_unit_id := _purchase_unit_id;
    IF v_factor IS NULL OR v_factor <= 0 THEN v_factor := NULL; v_ctype := NULL; END IF;
  END IF;
  v_equiv := CASE WHEN v_factor IS NOT NULL THEN round(v_qty * v_factor, 3) END;

  IF _assignment_id IS NOT NULL THEN
    SELECT id INTO v_id FROM public.shopping_list_item_suppliers WHERE id = _assignment_id AND item_id = _item_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Ripartizione non trovata'; END IF;
  ELSIF v_unit_id IS NOT NULL THEN
    SELECT id INTO v_id FROM public.shopping_list_item_suppliers
     WHERE item_id = _item_id AND product_supplier_link_id = v_link.id AND purchase_unit_id = v_unit_id;
  ELSE
    SELECT id INTO v_id FROM public.shopping_list_item_suppliers
     WHERE item_id = _item_id AND product_supplier_link_id = v_link.id AND purchase_unit_id IS NULL
       AND upper(btrim(purchase_unit_code)) = v_unit_code;
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE public.shopping_list_item_suppliers
       SET product_supplier_link_id = v_link.id, supplier_record_id = v_link.supplier_record_id,
           assigned_quantity = v_equiv, purchase_quantity = v_qty, purchase_unit_id = v_unit_id,
           purchase_unit_code = v_unit_code, conversion_factor = v_factor, conversion_type = v_ctype,
           min_warning_accepted = COALESCE(_min_warning_accepted, false),
           min_warning_accepted_by = CASE WHEN _min_warning_accepted THEN _actor_user_id END,
           min_warning_accepted_at = CASE WHEN _min_warning_accepted THEN now() END,
           notes = _notes
     WHERE id = v_id;
  ELSE
    INSERT INTO public.shopping_list_item_suppliers (
      company_id, item_id, product_supplier_link_id, supplier_record_id,
      assigned_quantity, purchase_quantity, purchase_unit_id, purchase_unit_code, conversion_factor, conversion_type,
      min_warning_accepted, min_warning_accepted_by, min_warning_accepted_at, notes, created_by)
    VALUES (_company_id, _item_id, v_link.id, v_link.supplier_record_id,
      v_equiv, v_qty, v_unit_id, v_unit_code, v_factor, v_ctype,
      COALESCE(_min_warning_accepted, false),
      CASE WHEN _min_warning_accepted THEN _actor_user_id END,
      CASE WHEN _min_warning_accepted THEN now() END,
      _notes, _actor_user_id)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $function$;
REVOKE EXECUTE ON FUNCTION public.assign_shopping_list_supplier(uuid, uuid, text, uuid, numeric, numeric, boolean, text, uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_shopping_list_supplier(uuid, uuid, text, uuid, numeric, numeric, boolean, text, uuid, uuid, uuid, text) TO authenticated, service_role;
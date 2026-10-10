-- Prima impostazione dell'U.M. di magazzino dalla card Inventario (admin + operatori).
CREATE OR REPLACE FUNCTION public.guard_product_stock_unit()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.stock_unit_id IS NOT DISTINCT FROM OLD.stock_unit_id AND NEW.stock_base_at IS NOT DISTINCT FROM OLD.stock_base_at THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL THEN
    -- Unica eccezione: prima impostazione (da vuota a valorizzata) dalla funzione dedicata,
    -- che ha già verificato ruolo, azienda e U.M. sotto blocco di riga.
    IF COALESCE(current_setting('app.stock_unit_first_set', true), '') = 'on'
       AND OLD.stock_unit_id IS NULL AND NEW.stock_unit_id IS NOT NULL THEN
      NULL;
    ELSE
      IF NOT public.is_company_admin(NEW.company_id) THEN
        RAISE EXCEPTION 'Solo un amministratore può cambiare la U.M. di magazzino';
      END IF;
      IF COALESCE(current_setting('app.unit_config_rpc', true), '') <> 'on' THEN
        RAISE EXCEPTION 'La U.M. di magazzino si cambia solo dalla scheda prodotto';
      END IF;
    END IF;
  END IF;
  IF NEW.stock_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.units_of_measure u WHERE u.id = NEW.stock_unit_id AND u.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'U.M. di magazzino non valida per questa azienda';
  END IF;
  IF current_setting('app.stock_unit_backfill', true) = 'on' THEN
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.set_initial_stock_unit(_product_id uuid, _unit_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_p public.products; v_u public.units_of_measure;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_p FROM public.products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND OR NOT (public.has_company_role(v_p.company_id, 'amministratore')
                       OR public.has_company_role(v_p.company_id, 'operatore')) THEN
    RAISE EXCEPTION 'Prodotto non accessibile';
  END IF;
  IF v_p.stock_unit_id IS NOT NULL THEN
    RAISE EXCEPTION 'U.M. di magazzino già impostata: la modifica è riservata agli amministratori dalla scheda prodotto';
  END IF;
  SELECT * INTO v_u FROM public.units_of_measure
   WHERE id = _unit_id AND company_id = v_p.company_id AND status = 'attivo';
  IF NOT FOUND THEN RAISE EXCEPTION 'U.M. non valida per questa azienda'; END IF;
  PERFORM set_config('app.stock_unit_first_set', 'on', true);
  UPDATE public.products SET stock_unit_id = _unit_id, stock_base_at = now() WHERE id = _product_id;
  PERFORM set_config('app.stock_unit_first_set', 'off', true);
  INSERT INTO public.product_inventory_units (company_id, product_id, unit_id, created_by)
  VALUES (v_p.company_id, _product_id, _unit_id, auth.uid()) ON CONFLICT DO NOTHING;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_p.company_id, auth.uid(), 'stock_unit_initial_set', 'product', _product_id,
          jsonb_build_object('unit_id', _unit_id, 'unit_code', v_u.code));
  RETURN jsonb_build_object('set', true, 'unit_id', _unit_id, 'unit_code', v_u.code);
END $function$;

-- Proposta (solo suggerimento) per la prima impostazione: fornitore della card con stella
-- o unico fornitore; B2B = U.M. di vendita predefinita del venditore, esterno = U.M. d'acquisto;
-- altrimenti U.M. Danea. Più fornitori con U.M. diverse e nessuna stella: nessuna proposta.
CREATE OR REPLACE FUNCTION public.initial_stock_unit_options(_product_id uuid, _link_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_p public.products; v_links uuid[]; v_cand uuid[]; v_codes text[]; v_code text;
  v_source text := NULL; v_sugg uuid := NULL; v_l uuid; v_c text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_p FROM public.products WHERE id = _product_id;
  IF NOT FOUND OR NOT public.is_company_member(v_p.company_id) THEN RAISE EXCEPTION 'Prodotto non accessibile'; END IF;

  SELECT array_agg(id) INTO v_links FROM public.product_supplier_links
   WHERE product_id = _product_id AND company_id = v_p.company_id AND is_active;
  IF _link_id IS NOT NULL AND (
       EXISTS (SELECT 1 FROM public.company_product_supplier_favorites f
                WHERE f.company_id = v_p.company_id AND f.product_id = _product_id AND f.product_supplier_link_id = _link_id)
       OR coalesce(array_length(v_links,1),0) = 1 AND v_links[1] = _link_id) THEN
    v_cand := ARRAY[_link_id];
  ELSE
    v_cand := v_links;
  END IF;

  v_codes := ARRAY[]::text[];
  FOREACH v_l IN ARRAY coalesce(v_cand, ARRAY[]::uuid[]) LOOP
    v_c := NULL;
    SELECT CASE WHEN l.b2b_item_id IS NOT NULL THEN
             (SELECT CASE WHEN count(*) = 1 THEN min(u.code) END FROM public.product_sale_units s
                JOIN public.units_of_measure u ON u.id = s.unit_id
               WHERE s.product_id = l.b2b_item_id AND s.is_active AND s.is_default)
           ELSE coalesce(
             (SELECT CASE WHEN count(*) = 1 THEN min(u.code) END FROM public.product_supplier_link_units lu
                JOIN public.units_of_measure u ON u.id = lu.unit_id
               WHERE lu.link_id = l.id AND lu.is_active AND lu.is_default),
             (SELECT u.code FROM public.units_of_measure u WHERE u.id = l.purchase_unit_id))
           END INTO v_c
      FROM public.product_supplier_links l WHERE l.id = v_l;
    v_codes := v_codes || coalesce(lower(trim(v_c)), '');
  END LOOP;

  IF coalesce(array_length(v_codes,1),0) > 0 THEN
    IF (SELECT count(DISTINCT x) FROM unnest(v_codes) x) = 1 AND v_codes[1] <> '' THEN
      v_code := v_codes[1]; v_source := CASE WHEN array_length(v_codes,1) = 1 THEN 'fornitore' ELSE 'fornitori' END;
    ELSIF (SELECT count(DISTINCT x) FROM unnest(v_codes) x WHERE x <> '') > 1 THEN
      v_source := 'ambiguo';
    END IF;
  END IF;
  IF v_code IS NOT NULL THEN
    SELECT id INTO v_sugg FROM public.units_of_measure
     WHERE company_id = v_p.company_id AND status = 'attivo' AND lower(code) = v_code;
    IF v_sugg IS NULL THEN v_source := NULL; END IF;
  END IF;
  IF v_sugg IS NULL AND coalesce(v_source,'') <> 'ambiguo' AND nullif(trim(v_p.danea_um),'') IS NOT NULL THEN
    SELECT id INTO v_sugg FROM public.units_of_measure
     WHERE company_id = v_p.company_id AND status = 'attivo' AND lower(code) = lower(trim(v_p.danea_um));
    v_source := CASE WHEN v_sugg IS NOT NULL THEN 'danea' END;
  END IF;

  RETURN jsonb_build_object(
    'already_set', v_p.stock_unit_id IS NOT NULL,
    'suggested_unit_id', v_sugg,
    'source', CASE WHEN v_sugg IS NULL THEN coalesce(v_source,'nessuna') ELSE v_source END,
    'units', coalesce((SELECT jsonb_agg(jsonb_build_object('id', u.id, 'code', u.code, 'description', u.description) ORDER BY u.code)
                         FROM public.units_of_measure u WHERE u.company_id = v_p.company_id AND u.status = 'attivo'), '[]'::jsonb));
END $function$;

REVOKE ALL ON FUNCTION public.set_initial_stock_unit(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_initial_stock_unit(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.initial_stock_unit_options(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.initial_stock_unit_options(uuid, uuid) TO authenticated, service_role;
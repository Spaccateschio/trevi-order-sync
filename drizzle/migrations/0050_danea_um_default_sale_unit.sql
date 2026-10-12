-- Regola: la U.M. predefinita di vendita è sempre danea_um. Se manca nell'elenco aziendale viene creata;
-- se manca tra le U.M. di vendita viene aggiunta. Le U.M. aggiuntive dell'utente non vengono mai toccate.
-- Nessuna scrittura se il prodotto è già allineato (niente audit ripetuti a ogni importazione).
CREATE OR REPLACE FUNCTION public.ensure_danea_sale_unit(_product_id uuid, _actor_user_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _p record; _code text; _unit_id uuid; _su record; _created_unit boolean := false; _added boolean := false; _old_default uuid;
BEGIN
  SELECT id, company_id, danea_um INTO _p FROM public.products WHERE id = _product_id;
  IF _p.id IS NULL THEN RETURN NULL; END IF;
  _code := NULLIF(btrim(coalesce(_p.danea_um, '')), '');
  IF _code IS NULL THEN RETURN NULL; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('danea_unit:' || _p.company_id::text || ':' || lower(_code)));
  SELECT u.id INTO _unit_id FROM public.units_of_measure u
   WHERE u.company_id = _p.company_id AND lower(u.code) = lower(_code)
   ORDER BY (u.status = 'attivo') DESC, u.created_at LIMIT 1;
  IF _unit_id IS NULL THEN
    INSERT INTO public.units_of_measure (company_id, code, description, status, usage, created_by)
    VALUES (_p.company_id, lower(_code), lower(_code) || ' (da Danea)', 'attivo', 'entrambi', _actor_user_id)
    RETURNING id INTO _unit_id;
    _created_unit := true;
  END IF;

  SELECT * INTO _su FROM public.product_sale_units WHERE product_id = _product_id AND unit_id = _unit_id FOR UPDATE;
  IF _su.id IS NOT NULL AND _su.is_default AND _su.is_active AND _su.is_customer_visible THEN
    RETURN _su.id; -- già allineato: nessuna scrittura
  END IF;

  SELECT unit_id INTO _old_default FROM public.product_sale_units WHERE product_id = _product_id AND is_default;
  UPDATE public.product_sale_units SET is_default = false, updated_by = _actor_user_id
   WHERE product_id = _product_id AND is_default AND unit_id <> _unit_id;
  IF _su.id IS NULL THEN
    INSERT INTO public.product_sale_units (company_id, product_id, unit_id, is_active, is_customer_visible, is_default,
      conversion_factor, conversion_reference_um, conversion_type, created_by, updated_by)
    VALUES (_p.company_id, _product_id, _unit_id, true, true, true, 1, lower(_code), 'esatta', _actor_user_id, _actor_user_id)
    RETURNING * INTO _su;
    _added := true;
  ELSE
    UPDATE public.product_sale_units SET is_default = true, is_active = true, is_customer_visible = true, updated_by = _actor_user_id
     WHERE id = _su.id;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_p.company_id, _actor_user_id, 'product_sale_unit.danea_default', 'product', _product_id,
    jsonb_build_object('unit_id', _unit_id, 'danea_um', _code, 'unit_created', _created_unit,
                       'sale_unit_added', _added, 'previous_default_unit_id', _old_default));
  RETURN _su.id;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_danea_sale_unit(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_danea_sale_unit(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.products_danea_sale_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NULLIF(btrim(coalesce(NEW.danea_um, '')), '') IS NULL THEN RETURN NULL; END IF;
  PERFORM public.ensure_danea_sale_unit(NEW.id, auth.uid());
  RETURN NULL;
END;
$$;

-- Nome alfabeticamente prima di products_ensure_sale_unit_on_publish: la U.M. Danea viene creata per prima.
DROP TRIGGER IF EXISTS products_danea_sale_unit ON public.products;
CREATE TRIGGER products_danea_sale_unit
AFTER INSERT OR UPDATE OF danea_um ON public.products
FOR EACH ROW EXECUTE FUNCTION public.products_danea_sale_unit();
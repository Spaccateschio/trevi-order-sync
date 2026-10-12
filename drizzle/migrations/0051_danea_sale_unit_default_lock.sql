CREATE OR REPLACE FUNCTION public.apply_product_sale_unit_batch(_company_id uuid, _product_ids uuid[], _unit_id uuid, _operation text, _boolean_value boolean DEFAULT NULL::boolean, _conversion_factor numeric DEFAULT NULL::numeric, _overwrite boolean DEFAULT false, _actor_user_id uuid DEFAULT NULL::uuid, _conversion_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _requested integer;
  _valid integer;
  _changed integer := 0;
  _unit_active boolean;
BEGIN
  _requested := coalesce(array_length(_product_ids, 1), 0);
  IF _requested = 0 THEN RAISE EXCEPTION 'Seleziona almeno un prodotto'; END IF;
  SELECT status = 'attivo' INTO _unit_active FROM public.units_of_measure WHERE id = _unit_id AND company_id = _company_id;
  IF _unit_active IS NULL THEN RAISE EXCEPTION 'Unità di misura non trovata'; END IF;
  IF NOT _unit_active AND _operation IN ('add', 'default', 'active', 'visible') THEN RAISE EXCEPTION 'Riattiva prima questa unità di misura'; END IF;
  SELECT count(*) INTO _valid FROM public.products WHERE company_id = _company_id AND id = ANY(_product_ids);
  IF _valid <> _requested THEN RAISE EXCEPTION 'Uno o più prodotti non appartengono alla tua azienda'; END IF;
  -- U.M. predefinita vincolata a Danea: controllo prima di qualunque scrittura.
  IF _operation = 'default' AND EXISTS (SELECT 1 FROM public.products WHERE id = ANY(_product_ids) AND NULLIF(btrim(coalesce(danea_um, '')), '') IS NOT NULL) THEN
    RAISE EXCEPTION 'La U.M. predefinita dei prodotti Danea arriva da Danea e non si cambia a mano';
  END IF;
  IF (_operation = 'remove' OR (_operation IN ('active', 'visible') AND coalesce(_boolean_value, true) = false))
     AND EXISTS (SELECT 1 FROM public.products p JOIN public.units_of_measure u ON u.id = _unit_id
                 WHERE p.id = ANY(_product_ids) AND lower(u.code) = lower(NULLIF(btrim(coalesce(p.danea_um, '')), ''))) THEN
    RAISE EXCEPTION 'La U.M. predefinita da Danea non si può disattivare, nascondere o rimuovere';
  END IF;

  IF _operation = 'add' THEN
    INSERT INTO public.product_sale_units (company_id, product_id, unit_id, is_default, created_by, updated_by)
    SELECT _company_id, p.id, _unit_id,
      NOT EXISTS (SELECT 1 FROM public.product_sale_units existing WHERE existing.product_id = p.id AND existing.is_default),
      _actor_user_id, _actor_user_id
    FROM public.products p WHERE p.company_id = _company_id AND p.id = ANY(_product_ids)
    ON CONFLICT (product_id, unit_id) DO NOTHING;
    GET DIAGNOSTICS _changed = ROW_COUNT;
  ELSIF _operation = 'visible' THEN
    UPDATE public.product_sale_units SET is_customer_visible = coalesce(_boolean_value, true),
      is_default = CASE WHEN coalesce(_boolean_value, true) THEN is_default ELSE false END,
      updated_by = _actor_user_id
    WHERE company_id = _company_id AND product_id = ANY(_product_ids) AND unit_id = _unit_id;
    GET DIAGNOSTICS _changed = ROW_COUNT;
  ELSIF _operation = 'active' THEN
    UPDATE public.product_sale_units SET is_active = coalesce(_boolean_value, true),
      is_default = CASE WHEN coalesce(_boolean_value, true) THEN is_default ELSE false END,
      updated_by = _actor_user_id
    WHERE company_id = _company_id AND product_id = ANY(_product_ids) AND unit_id = _unit_id;
    GET DIAGNOSTICS _changed = ROW_COUNT;
  ELSIF _operation = 'factor' THEN
    IF _conversion_factor IS NOT NULL AND _conversion_factor <= 0 THEN RAISE EXCEPTION 'Il fattore deve essere maggiore di zero'; END IF;
    UPDATE public.product_sale_units psu SET conversion_factor = _conversion_factor,
      conversion_reference_um = CASE WHEN _conversion_factor IS NULL THEN NULL ELSE p.danea_um END,
      needs_review = false, updated_by = _actor_user_id
    FROM public.products p
    WHERE psu.product_id = p.id AND psu.company_id = _company_id AND psu.product_id = ANY(_product_ids)
      AND psu.unit_id = _unit_id AND (_overwrite OR psu.conversion_factor IS NULL);
    GET DIAGNOSTICS _changed = ROW_COUNT;
  ELSIF _operation = 'conversion_type' THEN
    IF NULLIF(btrim(COALESCE(_conversion_type, '')), '') IS NULL THEN RAISE EXCEPTION 'Indica se la conversione è esatta o indicativa'; END IF;
    UPDATE public.product_sale_units SET conversion_type = _conversion_type::public.sale_conversion_type, updated_by = _actor_user_id
    WHERE company_id = _company_id AND product_id = ANY(_product_ids) AND unit_id = _unit_id;
    GET DIAGNOSTICS _changed = ROW_COUNT;
  ELSIF _operation = 'default' THEN
    INSERT INTO public.product_sale_units (company_id, product_id, unit_id, is_active, is_customer_visible, is_default, created_by, updated_by)
    SELECT _company_id, p.id, _unit_id, true, true, false, _actor_user_id, _actor_user_id
    FROM public.products p WHERE p.company_id = _company_id AND p.id = ANY(_product_ids)
    ON CONFLICT (product_id, unit_id) DO UPDATE SET is_active = true, is_customer_visible = true, updated_by = _actor_user_id;
    UPDATE public.product_sale_units SET is_default = false, updated_by = _actor_user_id
    WHERE company_id = _company_id AND product_id = ANY(_product_ids) AND is_default;
    UPDATE public.product_sale_units SET is_default = true, is_active = true, is_customer_visible = true, updated_by = _actor_user_id
    WHERE company_id = _company_id AND product_id = ANY(_product_ids) AND unit_id = _unit_id;
    GET DIAGNOSTICS _changed = ROW_COUNT;
  ELSIF _operation = 'remove' THEN
    DELETE FROM public.product_sale_units psu
    WHERE psu.company_id = _company_id AND psu.product_id = ANY(_product_ids) AND psu.unit_id = _unit_id
      AND NOT psu.is_default
      AND NOT EXISTS (SELECT 1 FROM public.customer_product_unit_preferences cp WHERE cp.product_sale_unit_id = psu.id);
    GET DIAGNOSTICS _changed = ROW_COUNT;
  ELSE
    RAISE EXCEPTION 'Operazione multipla non valida';
  END IF;

  IF _operation IN ('visible', 'active') THEN
    UPDATE public.product_sale_units candidate SET is_default = true, updated_by = _actor_user_id
    WHERE candidate.id IN (
      SELECT DISTINCT ON (psu.product_id) psu.id
      FROM public.product_sale_units psu
      WHERE psu.company_id = _company_id AND psu.product_id = ANY(_product_ids)
        AND psu.is_active AND psu.is_customer_visible
        AND NOT EXISTS (SELECT 1 FROM public.product_sale_units current_default WHERE current_default.product_id = psu.product_id AND current_default.is_default)
      ORDER BY psu.product_id, psu.created_at, psu.id
    );
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, _actor_user_id, 'product_sale_unit.' || _operation, 'unit_of_measure', _unit_id,
          jsonb_build_object('requested', _requested, 'changed', _changed, 'boolean_value', _boolean_value,
                             'conversion_factor', _conversion_factor, 'conversion_type', _conversion_type, 'overwrite', _overwrite));
  RETURN jsonb_build_object('requested', _requested, 'changed', _changed, 'unchanged', _requested - _changed);
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_danea_sale_unit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.product_sale_units; _danea text; _code text;
BEGIN
  _row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  SELECT NULLIF(btrim(coalesce(danea_um, '')), '') INTO _danea FROM public.products WHERE id = _row.product_id;
  IF _danea IS NULL THEN RETURN _row; END IF;
  SELECT code INTO _code FROM public.units_of_measure WHERE id = _row.unit_id;
  IF lower(coalesce(_code, '')) = lower(_danea) THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'La U.M. predefinita da Danea non si può rimuovere'; END IF;
    IF NOT NEW.is_active OR NOT NEW.is_customer_visible THEN RAISE EXCEPTION 'La U.M. predefinita da Danea non si può disattivare o nascondere'; END IF;
    IF TG_OP = 'UPDATE' AND OLD.is_default AND NOT NEW.is_default THEN RAISE EXCEPTION 'La U.M. predefinita da Danea non si cambia a mano'; END IF;
  ELSIF TG_OP <> 'DELETE' AND NEW.is_default AND (TG_OP = 'INSERT' OR NOT OLD.is_default) THEN
    RAISE EXCEPTION 'La U.M. predefinita dei prodotti Danea è quella di Danea (%)', _danea;
  END IF;
  RETURN _row;
END $$;
REVOKE ALL ON FUNCTION public.guard_danea_sale_unit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS product_sale_units_danea_guard ON public.product_sale_units;
CREATE TRIGGER product_sale_units_danea_guard BEFORE INSERT OR UPDATE OF is_default, is_active, is_customer_visible, unit_id OR DELETE
  ON public.product_sale_units FOR EACH ROW EXECUTE FUNCTION public.guard_danea_sale_unit();

CREATE OR REPLACE FUNCTION public.ensure_default_product_sale_unit(_product_id uuid, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _p record;
  _unit_id uuid;
  _id uuid;
BEGIN
  SELECT id, company_id, stock_unit_id, danea_um INTO _p FROM public.products WHERE id = _product_id;
  IF _p.id IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.product_sale_units WHERE product_id = _product_id) THEN RETURN NULL; END IF;

  SELECT u.id INTO _unit_id FROM public.units_of_measure u
   WHERE NULLIF(btrim(coalesce(_p.danea_um, '')), '') IS NULL AND u.id = _p.stock_unit_id AND u.company_id = _p.company_id AND u.status = 'attivo';
  IF _unit_id IS NULL AND NULLIF(btrim(coalesce(_p.danea_um, '')), '') IS NOT NULL THEN
    SELECT u.id INTO _unit_id FROM public.units_of_measure u
     WHERE u.company_id = _p.company_id AND u.status = 'attivo' AND lower(u.code) = lower(btrim(_p.danea_um))
     ORDER BY u.created_at LIMIT 1;
  END IF;
  IF _unit_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.product_sale_units (company_id, product_id, unit_id, is_active, is_customer_visible, is_default,
    conversion_factor, conversion_reference_um, conversion_type, created_by, updated_by)
  VALUES (_p.company_id, _product_id, _unit_id, true, true, true, 1,
    (SELECT code FROM public.units_of_measure WHERE id = _unit_id), 'esatta', _actor_user_id, _actor_user_id)
  ON CONFLICT (product_id, unit_id) DO NOTHING
  RETURNING id INTO _id;

  IF _id IS NOT NULL THEN
    INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
    VALUES (_p.company_id, _actor_user_id, 'product_sale_unit.auto_default', 'product', _product_id,
      jsonb_build_object('unit_id', _unit_id, 'conversion_factor', 1, 'conversion_type', 'esatta', 'source', 'b2b_publish'));
  END IF;
  RETURN _id;
END;
$function$;
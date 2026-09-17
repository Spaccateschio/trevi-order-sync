CREATE POLICY danea_auth_failures_service_only ON public.danea_auth_failures FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.manage_unit_of_measure(
  _company_id uuid,
  _unit_id uuid,
  _action text,
  _code text DEFAULT NULL,
  _description text DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _used boolean;
BEGIN
  IF _action = 'create' THEN
    IF coalesce(btrim(_code), '') = '' OR coalesce(btrim(_description), '') = '' THEN
      RAISE EXCEPTION 'Sigla e descrizione sono obbligatorie';
    END IF;
    INSERT INTO public.units_of_measure (company_id, code, description, created_by)
    VALUES (_company_id, lower(btrim(_code)), btrim(_description), _actor_user_id)
    RETURNING id INTO _id;
  ELSE
    SELECT id INTO _id FROM public.units_of_measure WHERE id = _unit_id AND company_id = _company_id;
    IF _id IS NULL THEN RAISE EXCEPTION 'Unità di misura non trovata'; END IF;
    SELECT EXISTS (SELECT 1 FROM public.product_sale_units WHERE unit_id = _id) INTO _used;

    IF _action = 'update' THEN
      IF coalesce(btrim(_description), '') = '' THEN RAISE EXCEPTION 'La descrizione è obbligatoria'; END IF;
      IF _used AND lower(btrim(_code)) IS DISTINCT FROM (SELECT lower(code) FROM public.units_of_measure WHERE id = _id) THEN
        RAISE EXCEPTION 'La sigla di una U.M. già associata non può essere modificata';
      END IF;
      UPDATE public.units_of_measure SET code = lower(btrim(_code)), description = btrim(_description) WHERE id = _id;
    ELSIF _action = 'activate' THEN
      UPDATE public.units_of_measure SET status = 'attivo' WHERE id = _id;
    ELSIF _action = 'deactivate' THEN
      UPDATE public.units_of_measure SET status = 'disattivato' WHERE id = _id;
      UPDATE public.product_sale_units SET is_active = false, is_customer_visible = false, is_default = false, updated_by = _actor_user_id WHERE unit_id = _id;
    ELSIF _action = 'delete' THEN
      DELETE FROM public.units_of_measure WHERE id = _id;
    ELSE
      RAISE EXCEPTION 'Operazione U.M. non valida';
    END IF;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, _actor_user_id, 'sales_unit.' || _action, 'unit_of_measure', _id,
          jsonb_build_object('code', _code, 'description', _description));
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.manage_unit_of_measure(uuid, uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_unit_of_measure(uuid, uuid, text, text, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_product_sale_unit_batch(
  _company_id uuid,
  _product_ids uuid[],
  _unit_id uuid,
  _operation text,
  _boolean_value boolean DEFAULT NULL,
  _conversion_factor numeric DEFAULT NULL,
  _overwrite boolean DEFAULT false,
  _actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF _operation = 'add' THEN
    INSERT INTO public.product_sale_units (company_id, product_id, unit_id, created_by, updated_by)
    SELECT _company_id, p.id, _unit_id, _actor_user_id, _actor_user_id
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
      AND NOT EXISTS (SELECT 1 FROM public.customer_product_unit_preferences cp WHERE cp.product_sale_unit_id = psu.id);
    GET DIAGNOSTICS _changed = ROW_COUNT;
  ELSE
    RAISE EXCEPTION 'Operazione multipla non valida';
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, _actor_user_id, 'product_sale_unit.' || _operation, 'unit_of_measure', _unit_id,
          jsonb_build_object('requested', _requested, 'changed', _changed, 'boolean_value', _boolean_value,
                             'conversion_factor', _conversion_factor, 'overwrite', _overwrite));
  RETURN jsonb_build_object('requested', _requested, 'changed', _changed, 'unchanged', _requested - _changed);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_product_sale_unit_batch(uuid, uuid[], uuid, text, boolean, numeric, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_product_sale_unit_batch(uuid, uuid[], uuid, text, boolean, numeric, boolean, uuid) TO service_role;
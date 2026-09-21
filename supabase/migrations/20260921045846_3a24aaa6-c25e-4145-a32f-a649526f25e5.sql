DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'unit_usage') THEN
    CREATE TYPE public.unit_usage AS ENUM ('acquisto', 'vendita', 'entrambi');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sale_conversion_type') THEN
    CREATE TYPE public.sale_conversion_type AS ENUM ('esatta', 'indicativa');
  END IF;
END $$;

ALTER TABLE public.units_of_measure
  ADD COLUMN IF NOT EXISTS usage public.unit_usage NOT NULL DEFAULT 'entrambi';

ALTER TABLE public.product_sale_units
  ADD COLUMN IF NOT EXISTS conversion_type public.sale_conversion_type NOT NULL DEFAULT 'indicativa';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_unit_id uuid REFERENCES public.units_of_measure(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS products_price_unit_idx ON public.products (price_unit_id) WHERE price_unit_id IS NOT NULL;

-- 1) Anagrafica U.M. con uso previsto
DROP FUNCTION IF EXISTS public.manage_unit_of_measure(uuid, uuid, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.manage_unit_of_measure(
  _company_id uuid,
  _unit_id uuid,
  _action text,
  _code text DEFAULT NULL,
  _description text DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL,
  _usage text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _used boolean;
  _usage_value public.unit_usage := COALESCE(NULLIF(btrim(COALESCE(_usage, '')), '')::public.unit_usage, 'entrambi');
BEGIN
  IF _action = 'create' THEN
    IF coalesce(btrim(_code), '') = '' OR coalesce(btrim(_description), '') = '' THEN
      RAISE EXCEPTION 'Sigla e descrizione sono obbligatorie';
    END IF;
    INSERT INTO public.units_of_measure (company_id, code, description, usage, created_by)
    VALUES (_company_id, lower(btrim(_code)), btrim(_description), _usage_value, _actor_user_id)
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
      UPDATE public.units_of_measure
      SET code = lower(btrim(_code)),
          description = btrim(_description),
          usage = CASE WHEN NULLIF(btrim(COALESCE(_usage, '')), '') IS NULL THEN usage ELSE _usage_value END
      WHERE id = _id;
    ELSIF _action = 'set_usage' THEN
      IF NULLIF(btrim(COALESCE(_usage, '')), '') IS NULL THEN RAISE EXCEPTION 'Uso U.M. non indicato'; END IF;
      UPDATE public.units_of_measure SET usage = _usage_value WHERE id = _id;
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
          jsonb_build_object('code', _code, 'description', _description, 'usage', _usage));
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.manage_unit_of_measure(uuid, uuid, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_unit_of_measure(uuid, uuid, text, text, text, uuid, text) TO service_role;

-- 2) U.M. di vendita: tipo di conversione esplicito
DROP FUNCTION IF EXISTS public.apply_product_sale_unit_batch(uuid, uuid[], uuid, text, boolean, numeric, boolean, uuid);

CREATE OR REPLACE FUNCTION public.apply_product_sale_unit_batch(
  _company_id uuid,
  _product_ids uuid[],
  _unit_id uuid,
  _operation text,
  _boolean_value boolean DEFAULT NULL,
  _conversion_factor numeric DEFAULT NULL,
  _overwrite boolean DEFAULT false,
  _actor_user_id uuid DEFAULT NULL,
  _conversion_type text DEFAULT NULL
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
$$;
REVOKE ALL ON FUNCTION public.apply_product_sale_unit_batch(uuid, uuid[], uuid, text, boolean, numeric, boolean, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_product_sale_unit_batch(uuid, uuid[], uuid, text, boolean, numeric, boolean, uuid, text) TO service_role;

-- 3) U.M. del prezzo del prodotto
CREATE OR REPLACE FUNCTION public.set_product_price_unit(
  _company_id uuid,
  _product_id uuid,
  _price_unit_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;
  IF _price_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.units_of_measure WHERE id = _price_unit_id AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Unità di misura non trovata';
  END IF;
  UPDATE public.products SET price_unit_id = _price_unit_id, updated_at = now()
  WHERE id = _product_id AND company_id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prodotto non trovato'; END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, auth.uid(), 'product.price_unit', 'product', _product_id,
          jsonb_build_object('price_unit_id', _price_unit_id));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_product_price_unit(uuid, uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_product_price_unit(uuid, uuid, uuid) TO authenticated, service_role;

-- 4) Prodotto manuale: U.M. del prezzo
DROP FUNCTION IF EXISTS public.manage_internal_product(uuid, text, uuid, text, text, text, text, text, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.manage_internal_product(
  _company_id uuid,
  _action text,
  _product_id uuid DEFAULT NULL::uuid,
  _code text DEFAULT NULL::text,
  _description text DEFAULT NULL::text,
  _category text DEFAULT NULL::text,
  _subcategory text DEFAULT NULL::text,
  _danea_um text DEFAULT NULL::text,
  _barcode text DEFAULT NULL::text,
  _producer_name text DEFAULT NULL::text,
  _notes text DEFAULT NULL::text,
  _actor_user_id uuid DEFAULT NULL::uuid,
  _price_unit_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_archive uuid;
  v_id uuid;
  v_code text := NULLIF(btrim(COALESCE(_code, '')), '');
BEGIN
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;

  IF _price_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.units_of_measure WHERE id = _price_unit_id AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Unità di misura del prezzo non trovata';
  END IF;

  IF _action = 'create' THEN
    IF _description IS NULL OR btrim(_description) = '' THEN
      RAISE EXCEPTION 'La descrizione del prodotto è obbligatoria';
    END IF;
    v_archive := public.ensure_internal_archive(_company_id, COALESCE(_actor_user_id, auth.uid()));
    IF v_code IS NULL THEN
      v_code := public.next_internal_product_code(_company_id);
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.products
      WHERE company_id = _company_id AND archive_id = v_archive AND code = v_code
    ) THEN
      RAISE EXCEPTION 'Esiste già un prodotto con il codice %', v_code;
    END IF;

    INSERT INTO public.products (
      company_id, archive_id, code, description, category, subcategory, danea_um,
      barcode, producer_name, notes, publish_status, origin, is_managed, b2b_visible, price_unit_id
    ) VALUES (
      _company_id, v_archive, v_code, btrim(_description),
      NULLIF(btrim(COALESCE(_category, '')), ''), NULLIF(btrim(COALESCE(_subcategory, '')), ''),
      NULLIF(btrim(COALESCE(_danea_um, '')), ''), NULLIF(btrim(COALESCE(_barcode, '')), ''),
      NULLIF(btrim(COALESCE(_producer_name, '')), ''), NULLIF(btrim(COALESCE(_notes, '')), ''),
      'pubblicato', 'interno', true, false, _price_unit_id
    ) RETURNING id INTO v_id;

  ELSE
    SELECT id INTO v_id FROM public.products
    WHERE id = _product_id AND company_id = _company_id AND origin = 'interno';
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Prodotto interno non trovato';
    END IF;

    IF _action = 'update' THEN
      IF v_code IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.products p2
        WHERE p2.company_id = _company_id AND p2.id <> v_id
          AND p2.archive_id = (SELECT archive_id FROM public.products WHERE id = v_id)
          AND p2.code = v_code
      ) THEN
        RAISE EXCEPTION 'Esiste già un prodotto con il codice %', v_code;
      END IF;

      UPDATE public.products SET
        code = COALESCE(v_code, code),
        description = COALESCE(NULLIF(btrim(COALESCE(_description, '')), ''), description),
        category = NULLIF(btrim(COALESCE(_category, '')), ''),
        subcategory = NULLIF(btrim(COALESCE(_subcategory, '')), ''),
        danea_um = NULLIF(btrim(COALESCE(_danea_um, '')), ''),
        barcode = NULLIF(btrim(COALESCE(_barcode, '')), ''),
        producer_name = NULLIF(btrim(COALESCE(_producer_name, '')), ''),
        notes = NULLIF(btrim(COALESCE(_notes, '')), ''),
        price_unit_id = _price_unit_id,
        updated_at = now()
      WHERE id = v_id;

    ELSIF _action = 'deactivate' THEN
      UPDATE public.products
      SET is_managed = false, publish_status = 'non_pubblicato', unpublished_at = now(), updated_at = now()
      WHERE id = v_id;

    ELSIF _action = 'activate' THEN
      UPDATE public.products
      SET is_managed = true, publish_status = 'pubblicato', unpublished_at = NULL, updated_at = now()
      WHERE id = v_id;

    ELSE
      RAISE EXCEPTION 'Azione non valida: %', _action;
    END IF;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, COALESCE(_actor_user_id, auth.uid()), 'internal_product.' || _action, 'product', v_id, '{}'::jsonb);

  RETURN v_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.manage_internal_product(uuid, text, uuid, text, text, text, text, text, text, text, text, uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.manage_internal_product(uuid, text, uuid, text, text, text, text, text, text, text, text, uuid, uuid) TO authenticated, service_role;
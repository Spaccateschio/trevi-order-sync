CREATE TABLE public.product_supplier_link_units (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  link_id uuid NOT NULL REFERENCES public.product_supplier_links(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units_of_measure(id),
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  conversion_factor numeric,
  conversion_type public.sale_conversion_type NOT NULL DEFAULT 'indicativa',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_supplier_link_units_factor_positive CHECK (conversion_factor IS NULL OR conversion_factor > 0)
);

GRANT SELECT ON public.product_supplier_link_units TO authenticated;
GRANT ALL ON public.product_supplier_link_units TO service_role;

ALTER TABLE public.product_supplier_link_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_supplier_link_units_select ON public.product_supplier_link_units
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

CREATE UNIQUE INDEX product_supplier_link_units_unique ON public.product_supplier_link_units (link_id, unit_id);
CREATE UNIQUE INDEX product_supplier_link_units_one_default ON public.product_supplier_link_units (link_id) WHERE is_default;
CREATE INDEX product_supplier_link_units_link_idx ON public.product_supplier_link_units (link_id);

CREATE OR REPLACE FUNCTION public.validate_product_supplier_link_unit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_link_company uuid;
  v_unit_company uuid;
BEGIN
  SELECT company_id INTO v_link_company FROM public.product_supplier_links WHERE id = NEW.link_id;
  IF v_link_company IS NULL OR v_link_company <> NEW.company_id THEN
    RAISE EXCEPTION 'Referenza fornitore non valida per questa azienda';
  END IF;

  SELECT company_id INTO v_unit_company FROM public.units_of_measure WHERE id = NEW.unit_id;
  IF v_unit_company IS NULL OR v_unit_company <> NEW.company_id THEN
    RAISE EXCEPTION 'U.M. di acquisto non valida per questa azienda';
  END IF;

  -- La predefinita è facoltativa, ma non può essere una U.M. disattivata.
  IF NOT NEW.is_active THEN
    NEW.is_default := false;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_product_supplier_link_unit
BEFORE INSERT OR UPDATE ON public.product_supplier_link_units
FOR EACH ROW EXECUTE FUNCTION public.validate_product_supplier_link_unit();

-- purchase_unit_id resta per compatibilità FASE C/D: è la U.M. preferita SE esiste, altrimenti NULL.
CREATE OR REPLACE FUNCTION public.sync_supplier_link_default_unit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_link uuid := COALESCE(NEW.link_id, OLD.link_id);
  v_unit uuid;
  v_factor numeric;
BEGIN
  SELECT unit_id, conversion_factor INTO v_unit, v_factor
  FROM public.product_supplier_link_units
  WHERE link_id = v_link AND is_default AND is_active
  LIMIT 1;

  UPDATE public.product_supplier_links
  SET purchase_unit_id = v_unit,
      conversion_factor = CASE WHEN v_unit IS NULL THEN conversion_factor ELSE v_factor END
  WHERE id = v_link;

  RETURN NULL;
END;
$$;

CREATE TRIGGER sync_supplier_link_default_unit
AFTER INSERT OR UPDATE OR DELETE ON public.product_supplier_link_units
FOR EACH ROW EXECUTE FUNCTION public.sync_supplier_link_default_unit();

-- Migrazione dati: solo le referenze che hanno già una U.M. d'acquisto.
INSERT INTO public.product_supplier_link_units (company_id, link_id, unit_id, is_default, conversion_factor)
SELECT l.company_id, l.id, l.purchase_unit_id, true, l.conversion_factor
FROM public.product_supplier_links l
WHERE l.purchase_unit_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.manage_product_supplier_link_unit(
  _company_id uuid,
  _link_id uuid,
  _unit_id uuid,
  _action text,
  _conversion_factor numeric DEFAULT NULL,
  _conversion_type public.sale_conversion_type DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Permessi insufficienti';
  END IF;

  SELECT id INTO v_id FROM public.product_supplier_link_units
  WHERE company_id = _company_id AND link_id = _link_id AND unit_id = _unit_id;

  IF _action = 'add' THEN
    IF v_id IS NULL THEN
      INSERT INTO public.product_supplier_link_units (company_id, link_id, unit_id, conversion_factor, conversion_type, created_by)
      VALUES (_company_id, _link_id, _unit_id, _conversion_factor,
              COALESCE(_conversion_type, 'indicativa'), COALESCE(_actor_user_id, auth.uid()))
      RETURNING id INTO v_id;
    END IF;
  ELSIF v_id IS NULL THEN
    RAISE EXCEPTION 'U.M. di acquisto non associata a questa referenza';
  ELSIF _action = 'remove' THEN
    DELETE FROM public.product_supplier_link_units WHERE id = v_id;
  ELSIF _action = 'set_default' THEN
    UPDATE public.product_supplier_link_units SET is_default = false, updated_at = now()
    WHERE link_id = _link_id AND is_default AND id <> v_id;
    UPDATE public.product_supplier_link_units SET is_default = true, is_active = true WHERE id = v_id;
  ELSIF _action = 'clear_default' THEN
    UPDATE public.product_supplier_link_units SET is_default = false WHERE id = v_id;
  ELSIF _action = 'set_conversion' THEN
    UPDATE public.product_supplier_link_units
    SET conversion_factor = _conversion_factor,
        conversion_type = COALESCE(_conversion_type, conversion_type)
    WHERE id = v_id;
  ELSIF _action = 'activate' THEN
    UPDATE public.product_supplier_link_units SET is_active = true WHERE id = v_id;
  ELSIF _action = 'deactivate' THEN
    UPDATE public.product_supplier_link_units SET is_active = false WHERE id = v_id;
  ELSE
    RAISE EXCEPTION 'Azione non valida: %', _action;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id)
  VALUES (_company_id, COALESCE(_actor_user_id, auth.uid()),
          'product_supplier_link_unit.' || _action, 'product_supplier_link', _link_id);

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.manage_product_supplier_link_unit(uuid, uuid, uuid, text, numeric, public.sale_conversion_type, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.manage_product_supplier_link_unit(uuid, uuid, uuid, text, numeric, public.sale_conversion_type, uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.product_supplier_overview(uuid);
CREATE FUNCTION public.product_supplier_overview(_product_id uuid)
RETURNS TABLE(link_id uuid, supplier_record_id uuid, supplier_name text, supplier_internal_reference text, supplier_product_code text, supplier_reference_label text, sourcing_priority smallint, purchase_unit_id uuid, purchase_unit_code text, conversion_factor numeric, conversion_reference_um text, manual_cost numeric, manual_cost_at timestamptz, danea_net_cost numeric, danea_gross_cost numeric, danea_cost_at timestamptz, min_quantity numeric, lead_time_days integer, is_preferred boolean, is_active boolean, notes text, origin public.product_supplier_origin, b2b_relation_status public.relation_status, purchase_units jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    l.id,
    l.supplier_record_id,
    s.legal_name,
    s.internal_reference,
    l.supplier_product_code,
    l.supplier_reference_label,
    l.sourcing_priority,
    l.purchase_unit_id,
    u.code,
    l.conversion_factor,
    l.conversion_reference_um,
    l.manual_cost,
    l.manual_cost_at,
    c.supplier_net_price,
    c.supplier_gross_price,
    c.received_at,
    l.min_quantity,
    l.lead_time_days,
    l.is_preferred,
    l.is_active,
    l.notes,
    l.origin,
    r.status,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', lu.id,
               'unit_id', lu.unit_id,
               'code', lum.code,
               'description', lum.description,
               'is_default', lu.is_default,
               'is_active', lu.is_active,
               'conversion_factor', lu.conversion_factor,
               'conversion_type', lu.conversion_type
             ) ORDER BY lu.is_default DESC, lum.code)
      FROM public.product_supplier_link_units lu
      JOIN public.units_of_measure lum ON lum.id = lu.unit_id
      WHERE lu.link_id = l.id
    ), '[]'::jsonb)
  FROM public.product_supplier_links l
  JOIN public.supplier_records s ON s.id = l.supplier_record_id
  LEFT JOIN public.units_of_measure u ON u.id = l.purchase_unit_id
  LEFT JOIN public.product_supplier_costs c
    ON c.product_id = l.product_id
   AND btrim(COALESCE(c.supplier_code, '')) = btrim(COALESCE(s.internal_reference, '#'))
  LEFT JOIN public.supplier_customer_relations r ON r.supplier_record_id = s.id
  WHERE l.product_id = _product_id
    AND public.is_company_member(l.company_id)
  ORDER BY l.sourcing_priority ASC NULLS LAST, l.manual_cost ASC NULLS LAST, s.legal_name, l.supplier_product_code NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.product_supplier_overview(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.product_supplier_overview(uuid) TO authenticated, service_role;
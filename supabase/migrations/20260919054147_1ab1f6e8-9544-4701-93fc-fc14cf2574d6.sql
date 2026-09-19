-- 1. Tabella associazioni prodotto <-> fornitore (condizioni Trevi Fruit)
CREATE TYPE public.product_supplier_origin AS ENUM ('manuale', 'danea');
CREATE TYPE public.danea_supplier_match_status AS ENUM ('da_associare', 'associato', 'ignorato');

CREATE TABLE public.product_supplier_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_record_id uuid NOT NULL REFERENCES public.supplier_records(id),
  supplier_product_code text,
  purchase_unit_id uuid REFERENCES public.units_of_measure(id),
  conversion_factor numeric,
  conversion_reference_um text,
  manual_cost numeric,
  manual_cost_at timestamptz,
  min_quantity numeric,
  lead_time_days integer,
  is_preferred boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  origin public.product_supplier_origin NOT NULL DEFAULT 'manuale',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX product_supplier_links_unique ON public.product_supplier_links (product_id, supplier_record_id);
CREATE UNIQUE INDEX product_supplier_links_one_preferred ON public.product_supplier_links (product_id) WHERE is_preferred;
CREATE INDEX product_supplier_links_supplier_idx ON public.product_supplier_links (supplier_record_id);
CREATE INDEX product_supplier_links_company_idx ON public.product_supplier_links (company_id);

GRANT SELECT ON public.product_supplier_links TO authenticated;
GRANT ALL ON public.product_supplier_links TO service_role;
ALTER TABLE public.product_supplier_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_supplier_links_select" ON public.product_supplier_links
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

CREATE TRIGGER product_supplier_links_updated_at
  BEFORE UPDATE ON public.product_supplier_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Coerenza azienda / archivio / conversione
CREATE OR REPLACE FUNCTION public.validate_product_supplier_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_company uuid;
  v_product_archive uuid;
  v_supplier_company uuid;
  v_supplier_archive uuid;
  v_unit_company uuid;
BEGIN
  SELECT company_id, archive_id INTO v_product_company, v_product_archive
  FROM public.products WHERE id = NEW.product_id;
  IF v_product_company IS NULL THEN
    RAISE EXCEPTION 'Prodotto non trovato';
  END IF;
  IF v_product_company <> NEW.company_id THEN
    RAISE EXCEPTION 'Il prodotto non appartiene a questa azienda';
  END IF;

  SELECT buyer_company_id, archive_id INTO v_supplier_company, v_supplier_archive
  FROM public.supplier_records WHERE id = NEW.supplier_record_id;
  IF v_supplier_company IS NULL THEN
    RAISE EXCEPTION 'Fornitore non trovato';
  END IF;
  IF v_supplier_company <> NEW.company_id THEN
    RAISE EXCEPTION 'Il fornitore non appartiene a questa azienda';
  END IF;
  IF v_supplier_archive IS NOT NULL AND v_supplier_archive <> v_product_archive THEN
    RAISE EXCEPTION 'Il fornitore appartiene a un altro archivio Danea';
  END IF;

  IF NEW.purchase_unit_id IS NOT NULL THEN
    SELECT company_id INTO v_unit_company FROM public.units_of_measure WHERE id = NEW.purchase_unit_id;
    IF v_unit_company IS NULL OR v_unit_company <> NEW.company_id THEN
      RAISE EXCEPTION 'U.M. di acquisto non valida per questa azienda';
    END IF;
  END IF;

  IF NEW.conversion_factor IS NOT NULL THEN
    IF NEW.conversion_factor <= 0 THEN
      RAISE EXCEPTION 'La conversione deve essere maggiore di zero';
    END IF;
    IF COALESCE(NEW.conversion_reference_um, '') = '' THEN
      NEW.conversion_reference_um := NULLIF(v_product_archive::text, '');
      SELECT danea_um INTO NEW.conversion_reference_um FROM public.products WHERE id = NEW.product_id;
    END IF;
  END IF;

  IF NOT NEW.is_active THEN
    NEW.is_preferred := false;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_product_supplier_link_trg
  BEFORE INSERT OR UPDATE ON public.product_supplier_links
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_supplier_link();

-- 2. Coda riconciliazione fornitore Danea
CREATE TABLE public.product_danea_supplier_matches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  danea_supplier_code text,
  danea_supplier_name text,
  status public.danea_supplier_match_status NOT NULL DEFAULT 'da_associare',
  supplier_record_id uuid REFERENCES public.supplier_records(id),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX product_danea_supplier_matches_unique
  ON public.product_danea_supplier_matches (product_id, COALESCE(danea_supplier_code, ''), COALESCE(danea_supplier_name, ''));
CREATE INDEX product_danea_supplier_matches_pending_idx
  ON public.product_danea_supplier_matches (company_id, status);

GRANT SELECT ON public.product_danea_supplier_matches TO authenticated;
GRANT ALL ON public.product_danea_supplier_matches TO service_role;
ALTER TABLE public.product_danea_supplier_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_danea_supplier_matches_select" ON public.product_danea_supplier_matches
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

CREATE TRIGGER product_danea_supplier_matches_updated_at
  BEFORE UPDATE ON public.product_danea_supplier_matches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Gestione associazione
CREATE OR REPLACE FUNCTION public.manage_product_supplier_link(
  _company_id uuid,
  _action text,
  _link_id uuid DEFAULT NULL,
  _product_id uuid DEFAULT NULL,
  _supplier_record_id uuid DEFAULT NULL,
  _supplier_product_code text DEFAULT NULL,
  _purchase_unit_id uuid DEFAULT NULL,
  _conversion_factor numeric DEFAULT NULL,
  _conversion_reference_um text DEFAULT NULL,
  _manual_cost numeric DEFAULT NULL,
  _min_quantity numeric DEFAULT NULL,
  _lead_time_days integer DEFAULT NULL,
  _notes text DEFAULT NULL,
  _is_preferred boolean DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_product uuid;
  v_previous_cost numeric;
BEGIN
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Permessi insufficienti';
  END IF;

  IF _action = 'create' THEN
    IF _product_id IS NULL OR _supplier_record_id IS NULL THEN
      RAISE EXCEPTION 'Prodotto e fornitore obbligatori';
    END IF;
    INSERT INTO public.product_supplier_links (
      company_id, product_id, supplier_record_id, supplier_product_code, purchase_unit_id,
      conversion_factor, conversion_reference_um, manual_cost, manual_cost_at, min_quantity,
      lead_time_days, notes, origin, created_by, is_preferred
    ) VALUES (
      _company_id, _product_id, _supplier_record_id, NULLIF(btrim(_supplier_product_code), ''), _purchase_unit_id,
      _conversion_factor, NULLIF(btrim(_conversion_reference_um), ''), _manual_cost,
      CASE WHEN _manual_cost IS NULL THEN NULL ELSE now() END, _min_quantity,
      _lead_time_days, NULLIF(btrim(_notes), ''), 'manuale', auth.uid(), false
    )
    RETURNING id, product_id INTO v_id, v_product;

    IF COALESCE(_is_preferred, false) THEN
      PERFORM public.set_preferred_product_supplier(_company_id, v_product, _supplier_record_id);
    END IF;
    RETURN v_id;
  END IF;

  IF _link_id IS NULL THEN
    RAISE EXCEPTION 'Associazione non indicata';
  END IF;

  SELECT product_id, manual_cost INTO v_product, v_previous_cost
  FROM public.product_supplier_links
  WHERE id = _link_id AND company_id = _company_id;
  IF v_product IS NULL THEN
    RAISE EXCEPTION 'Associazione non trovata';
  END IF;

  IF _action = 'update' THEN
    UPDATE public.product_supplier_links SET
      supplier_product_code = NULLIF(btrim(_supplier_product_code), ''),
      purchase_unit_id = _purchase_unit_id,
      conversion_factor = _conversion_factor,
      conversion_reference_um = NULLIF(btrim(_conversion_reference_um), ''),
      manual_cost = _manual_cost,
      manual_cost_at = CASE
        WHEN _manual_cost IS NULL THEN NULL
        WHEN v_previous_cost IS DISTINCT FROM _manual_cost THEN now()
        ELSE manual_cost_at END,
      min_quantity = _min_quantity,
      lead_time_days = _lead_time_days,
      notes = NULLIF(btrim(_notes), '')
    WHERE id = _link_id;
  ELSIF _action = 'activate' THEN
    UPDATE public.product_supplier_links SET is_active = true WHERE id = _link_id;
  ELSIF _action = 'deactivate' THEN
    UPDATE public.product_supplier_links SET is_active = false, is_preferred = false WHERE id = _link_id;
  ELSIF _action = 'delete_link' THEN
    DELETE FROM public.product_supplier_links WHERE id = _link_id;
  ELSE
    RAISE EXCEPTION 'Azione non valida: %', _action;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id)
  VALUES (_company_id, auth.uid(), 'product_supplier_link.' || _action, 'product_supplier_link', _link_id);

  RETURN _link_id;
END;
$$;

REVOKE ALL ON FUNCTION public.manage_product_supplier_link(uuid, text, uuid, uuid, uuid, text, uuid, numeric, text, numeric, numeric, integer, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manage_product_supplier_link(uuid, text, uuid, uuid, uuid, text, uuid, numeric, text, numeric, numeric, integer, text, boolean) TO authenticated;

-- 4. Fornitore preferito (atomico, al massimo uno)
CREATE OR REPLACE FUNCTION public.set_preferred_product_supplier(
  _company_id uuid,
  _product_id uuid,
  _supplier_record_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Permessi insufficienti';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _product_id AND company_id = _company_id) THEN
    RAISE EXCEPTION 'Il prodotto non appartiene a questa azienda';
  END IF;

  UPDATE public.product_supplier_links
  SET is_preferred = false
  WHERE product_id = _product_id AND company_id = _company_id AND is_preferred
    AND (_supplier_record_id IS NULL OR supplier_record_id <> _supplier_record_id);

  IF _supplier_record_id IS NOT NULL THEN
    UPDATE public.product_supplier_links
    SET is_preferred = true, is_active = true
    WHERE product_id = _product_id AND company_id = _company_id AND supplier_record_id = _supplier_record_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Associazione non trovata';
    END IF;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, auth.uid(), 'product_supplier_link.preferred', 'product', _product_id,
          jsonb_build_object('supplier_record_id', _supplier_record_id));
END;
$$;

REVOKE ALL ON FUNCTION public.set_preferred_product_supplier(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_preferred_product_supplier(uuid, uuid, uuid) TO authenticated;

-- 5. Riconciliazione fornitore Danea
CREATE OR REPLACE FUNCTION public.resolve_danea_supplier_match(
  _company_id uuid,
  _match_id uuid,
  _action text,
  _supplier_record_id uuid DEFAULT NULL,
  _legal_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match public.product_danea_supplier_matches;
  v_archive uuid;
  v_supplier uuid;
  v_link uuid;
BEGIN
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Permessi insufficienti';
  END IF;

  SELECT * INTO v_match FROM public.product_danea_supplier_matches
  WHERE id = _match_id AND company_id = _company_id;
  IF v_match.id IS NULL THEN
    RAISE EXCEPTION 'Voce non trovata';
  END IF;

  IF _action = 'ignore' THEN
    UPDATE public.product_danea_supplier_matches
    SET status = 'ignorato', supplier_record_id = NULL, decided_by = auth.uid(), decided_at = now()
    WHERE id = _match_id;
    RETURN NULL;
  END IF;

  SELECT archive_id INTO v_archive FROM public.products WHERE id = v_match.product_id AND company_id = _company_id;
  IF v_archive IS NULL THEN
    RAISE EXCEPTION 'Prodotto non valido';
  END IF;

  IF _action = 'link_existing' THEN
    IF _supplier_record_id IS NULL THEN
      RAISE EXCEPTION 'Fornitore non indicato';
    END IF;
    v_supplier := _supplier_record_id;
  ELSIF _action = 'create_supplier' THEN
    INSERT INTO public.supplier_records (
      buyer_company_id, archive_id, internal_reference, legal_name, created_by
    ) VALUES (
      _company_id, v_archive, NULLIF(btrim(v_match.danea_supplier_code), ''),
      COALESCE(NULLIF(btrim(_legal_name), ''), NULLIF(btrim(v_match.danea_supplier_name), ''), 'Fornitore Danea'),
      auth.uid()
    )
    RETURNING id INTO v_supplier;
  ELSE
    RAISE EXCEPTION 'Azione non valida: %', _action;
  END IF;

  INSERT INTO public.product_supplier_links (
    company_id, product_id, supplier_record_id, supplier_product_code, origin, created_by
  )
  SELECT _company_id, v_match.product_id, v_supplier, c.supplier_product_code, 'danea', auth.uid()
  FROM public.product_supplier_costs c
  WHERE c.product_id = v_match.product_id
  UNION ALL
  SELECT _company_id, v_match.product_id, v_supplier, NULL, 'danea', auth.uid()
  WHERE NOT EXISTS (SELECT 1 FROM public.product_supplier_costs c2 WHERE c2.product_id = v_match.product_id)
  ON CONFLICT (product_id, supplier_record_id) DO NOTHING;

  SELECT id INTO v_link FROM public.product_supplier_links
  WHERE product_id = v_match.product_id AND supplier_record_id = v_supplier;

  UPDATE public.product_danea_supplier_matches
  SET status = 'associato', supplier_record_id = v_supplier, decided_by = auth.uid(), decided_at = now()
  WHERE id = _match_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, auth.uid(), 'danea_supplier_match.' || _action, 'product', v_match.product_id,
          jsonb_build_object('supplier_record_id', v_supplier));

  RETURN v_link;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_danea_supplier_match(uuid, uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_danea_supplier_match(uuid, uuid, text, uuid, text) TO authenticated;

-- 6. Abbinamento automatico dai dati Danea (solo archivio + codice)
CREATE OR REPLACE FUNCTION public.sync_danea_product_supplier_links(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linked integer := 0;
  v_pending integer := 0;
  v_row record;
  v_supplier uuid;
BEGIN
  FOR v_row IN
    SELECT c.product_id, c.supplier_code, c.supplier_name, c.supplier_product_code, p.archive_id
    FROM public.product_supplier_costs c
    JOIN public.products p ON p.id = c.product_id
    WHERE c.company_id = _company_id
      AND (NULLIF(btrim(COALESCE(c.supplier_code, '')), '') IS NOT NULL
        OR NULLIF(btrim(COALESCE(c.supplier_name, '')), '') IS NOT NULL)
  LOOP
    v_supplier := NULL;
    IF NULLIF(btrim(COALESCE(v_row.supplier_code, '')), '') IS NOT NULL THEN
      SELECT id INTO v_supplier
      FROM public.supplier_records
      WHERE buyer_company_id = _company_id
        AND archive_id = v_row.archive_id
        AND btrim(COALESCE(internal_reference, '')) = btrim(v_row.supplier_code)
        AND status <> 'revocato'
      LIMIT 1;
    END IF;

    IF v_supplier IS NOT NULL THEN
      INSERT INTO public.product_supplier_links (
        company_id, product_id, supplier_record_id, supplier_product_code, origin
      ) VALUES (
        _company_id, v_row.product_id, v_supplier, NULLIF(btrim(COALESCE(v_row.supplier_product_code, '')), ''), 'danea'
      )
      ON CONFLICT (product_id, supplier_record_id) DO NOTHING;

      INSERT INTO public.product_danea_supplier_matches (
        company_id, product_id, danea_supplier_code, danea_supplier_name, status, supplier_record_id, decided_at
      ) VALUES (
        _company_id, v_row.product_id, v_row.supplier_code, v_row.supplier_name, 'associato', v_supplier, now()
      )
      ON CONFLICT (product_id, COALESCE(danea_supplier_code, ''), COALESCE(danea_supplier_name, ''))
      DO UPDATE SET status = 'associato', supplier_record_id = v_supplier, decided_at = now()
      WHERE public.product_danea_supplier_matches.status <> 'ignorato';

      v_linked := v_linked + 1;
    ELSE
      INSERT INTO public.product_danea_supplier_matches (
        company_id, product_id, danea_supplier_code, danea_supplier_name
      ) VALUES (
        _company_id, v_row.product_id, v_row.supplier_code, v_row.supplier_name
      )
      ON CONFLICT (product_id, COALESCE(danea_supplier_code, ''), COALESCE(danea_supplier_name, '')) DO NOTHING;
      v_pending := v_pending + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('linked', v_linked, 'pending', v_pending);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_danea_product_supplier_links(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_danea_product_supplier_links(uuid) TO service_role;

-- 7. Elenco fornitori del prodotto per la scheda
CREATE OR REPLACE FUNCTION public.product_supplier_overview(_product_id uuid)
RETURNS TABLE (
  link_id uuid,
  supplier_record_id uuid,
  supplier_name text,
  supplier_internal_reference text,
  supplier_product_code text,
  purchase_unit_id uuid,
  purchase_unit_code text,
  conversion_factor numeric,
  conversion_reference_um text,
  manual_cost numeric,
  manual_cost_at timestamptz,
  danea_net_cost numeric,
  danea_gross_cost numeric,
  danea_cost_at timestamptz,
  min_quantity numeric,
  lead_time_days integer,
  is_preferred boolean,
  is_active boolean,
  notes text,
  origin public.product_supplier_origin,
  b2b_relation_status public.relation_status
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.supplier_record_id,
    s.legal_name,
    s.internal_reference,
    l.supplier_product_code,
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
    r.status
  FROM public.product_supplier_links l
  JOIN public.supplier_records s ON s.id = l.supplier_record_id
  LEFT JOIN public.units_of_measure u ON u.id = l.purchase_unit_id
  LEFT JOIN public.product_supplier_costs c
    ON c.product_id = l.product_id
   AND btrim(COALESCE(c.supplier_code, '')) = btrim(COALESCE(s.internal_reference, '#'))
  LEFT JOIN public.supplier_customer_relations r ON r.supplier_record_id = s.id
  WHERE l.product_id = _product_id
    AND public.is_company_member(l.company_id)
  ORDER BY l.is_preferred DESC, s.legal_name;
$$;

REVOKE ALL ON FUNCTION public.product_supplier_overview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_supplier_overview(uuid) TO authenticated;
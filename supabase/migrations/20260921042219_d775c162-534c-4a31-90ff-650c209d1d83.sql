-- 1. Referenze fornitore: più referenze per fornitore, priorità facoltativa e ripetibile
DROP INDEX IF EXISTS public.product_supplier_links_unique;
DROP INDEX IF EXISTS public.product_supplier_links_one_preferred;

ALTER TABLE public.product_supplier_links
  ADD COLUMN IF NOT EXISTS supplier_reference_label text,
  ADD COLUMN IF NOT EXISTS sourcing_priority smallint;

ALTER TABLE public.product_supplier_links
  ADD CONSTRAINT product_supplier_links_priority_positive
  CHECK (sourcing_priority IS NULL OR sourcing_priority > 0);

-- deduplica sicura: con codice articolo valorizzato
CREATE UNIQUE INDEX IF NOT EXISTS product_supplier_links_ref_code_unique
  ON public.product_supplier_links (product_id, supplier_record_id, supplier_product_code)
  WHERE supplier_product_code IS NOT NULL;

-- deduplica sicura: senza codice articolo, sulla descrizione della referenza (vuota compresa)
CREATE UNIQUE INDEX IF NOT EXISTS product_supplier_links_ref_label_unique
  ON public.product_supplier_links (product_id, supplier_record_id, lower(btrim(COALESCE(supplier_reference_label, ''))))
  WHERE supplier_product_code IS NULL;

-- ordinamento per priorità (non unico: priorità ripetibili)
CREATE INDEX IF NOT EXISTS product_supplier_links_priority_idx
  ON public.product_supplier_links (product_id, sourcing_priority);

-- migrazione del vecchio preferito: solo quello attuale prende priorità 1
UPDATE public.product_supplier_links
SET sourcing_priority = 1
WHERE is_preferred AND sourcing_priority IS NULL;

-- 2. Disponibilità commerciale del prodotto
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_commercial_availability') THEN
    CREATE TYPE public.product_commercial_availability AS ENUM ('available', 'on_order', 'temporarily_unavailable');
  END IF;
END $$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS commercial_availability public.product_commercial_availability NOT NULL DEFAULT 'available';

-- 3. Nessuna sincronizzazione automatica fra priorità e vecchio preferito
CREATE OR REPLACE FUNCTION public.validate_product_supplier_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      SELECT danea_um INTO NEW.conversion_reference_um FROM public.products WHERE id = NEW.product_id;
    END IF;
  END IF;

  NEW.supplier_reference_label := NULLIF(btrim(COALESCE(NEW.supplier_reference_label, '')), '');

  IF NOT NEW.is_active THEN
    NEW.is_preferred := false;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4. Gestione referenze: descrizione, priorità, deduplica
CREATE OR REPLACE FUNCTION public.manage_product_supplier_link(
  _company_id uuid,
  _action text,
  _link_id uuid DEFAULT NULL::uuid,
  _product_id uuid DEFAULT NULL::uuid,
  _supplier_record_id uuid DEFAULT NULL::uuid,
  _supplier_product_code text DEFAULT NULL::text,
  _purchase_unit_id uuid DEFAULT NULL::uuid,
  _conversion_factor numeric DEFAULT NULL::numeric,
  _conversion_reference_um text DEFAULT NULL::text,
  _manual_cost numeric DEFAULT NULL::numeric,
  _min_quantity numeric DEFAULT NULL::numeric,
  _lead_time_days integer DEFAULT NULL::integer,
  _notes text DEFAULT NULL::text,
  _is_preferred boolean DEFAULT NULL::boolean,
  _supplier_reference_label text DEFAULT NULL::text,
  _sourcing_priority smallint DEFAULT NULL::smallint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_product uuid;
  v_previous_cost numeric;
  v_code text := NULLIF(btrim(COALESCE(_supplier_product_code, '')), '');
  v_label text := NULLIF(btrim(COALESCE(_supplier_reference_label, '')), '');
BEGIN
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Permessi insufficienti';
  END IF;

  IF _action = 'create' THEN
    IF _product_id IS NULL OR _supplier_record_id IS NULL THEN
      RAISE EXCEPTION 'Prodotto e fornitore obbligatori';
    END IF;

    -- deduplica: stessa referenza già presente (per codice, oppure per descrizione se il codice manca)
    SELECT id INTO v_id FROM public.product_supplier_links
    WHERE company_id = _company_id
      AND product_id = _product_id
      AND supplier_record_id = _supplier_record_id
      AND (
        (v_code IS NOT NULL AND supplier_product_code = v_code)
        OR (v_code IS NULL AND supplier_product_code IS NULL
            AND lower(btrim(COALESCE(supplier_reference_label, ''))) = lower(COALESCE(v_label, '')))
      )
    LIMIT 1;

    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;

    INSERT INTO public.product_supplier_links (
      company_id, product_id, supplier_record_id, supplier_product_code, purchase_unit_id,
      conversion_factor, conversion_reference_um, manual_cost, manual_cost_at, min_quantity,
      lead_time_days, notes, origin, created_by, is_preferred,
      supplier_reference_label, sourcing_priority
    ) VALUES (
      _company_id, _product_id, _supplier_record_id, v_code, _purchase_unit_id,
      _conversion_factor, NULLIF(btrim(_conversion_reference_um), ''), _manual_cost,
      CASE WHEN _manual_cost IS NULL THEN NULL ELSE now() END, _min_quantity,
      _lead_time_days, NULLIF(btrim(_notes), ''), 'manuale', auth.uid(), false,
      v_label, _sourcing_priority
    )
    RETURNING id, product_id INTO v_id, v_product;

    INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id)
    VALUES (_company_id, auth.uid(), 'product_supplier_link.create', 'product_supplier_link', v_id);

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
      supplier_product_code = v_code,
      supplier_reference_label = v_label,
      sourcing_priority = _sourcing_priority,
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
  ELSIF _action = 'set_priority' THEN
    UPDATE public.product_supplier_links SET sourcing_priority = _sourcing_priority WHERE id = _link_id;
  ELSIF _action = 'activate' THEN
    UPDATE public.product_supplier_links SET is_active = true WHERE id = _link_id;
  ELSIF _action = 'deactivate' THEN
    UPDATE public.product_supplier_links SET is_active = false WHERE id = _link_id;
  ELSIF _action = 'delete_link' THEN
    DELETE FROM public.product_supplier_links WHERE id = _link_id;
  ELSE
    RAISE EXCEPTION 'Azione non valida: %', _action;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id)
  VALUES (_company_id, auth.uid(), 'product_supplier_link.' || _action, 'product_supplier_link', _link_id);

  RETURN _link_id;
END;
$function$;

-- 5. Panoramica fornitori del prodotto: descrizione referenza, priorità e ordinamento
DROP FUNCTION IF EXISTS public.product_supplier_overview(uuid);
CREATE FUNCTION public.product_supplier_overview(_product_id uuid)
RETURNS TABLE(
  link_id uuid, supplier_record_id uuid, supplier_name text, supplier_internal_reference text,
  supplier_product_code text, supplier_reference_label text, sourcing_priority smallint,
  purchase_unit_id uuid, purchase_unit_code text, conversion_factor numeric, conversion_reference_um text,
  manual_cost numeric, manual_cost_at timestamp with time zone, danea_net_cost numeric,
  danea_gross_cost numeric, danea_cost_at timestamp with time zone, min_quantity numeric,
  lead_time_days integer, is_preferred boolean, is_active boolean, notes text,
  origin product_supplier_origin, b2b_relation_status relation_status
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  ORDER BY l.sourcing_priority ASC NULLS LAST, l.manual_cost ASC NULLS LAST, s.legal_name, l.supplier_product_code NULLS LAST;
$function$;

REVOKE ALL ON FUNCTION public.product_supplier_overview(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.product_supplier_overview(uuid) TO authenticated, service_role;

-- 6. Disponibilità commerciale: gestione manuale riservata agli amministratori
CREATE OR REPLACE FUNCTION public.set_product_commercial_availability(
  _company_id uuid,
  _product_id uuid,
  _availability public.product_commercial_availability
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Permessi insufficienti';
  END IF;
  UPDATE public.products
  SET commercial_availability = _availability
  WHERE id = _product_id AND company_id = _company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prodotto non trovato';
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, auth.uid(), 'product.commercial_availability', 'product', _product_id,
          jsonb_build_object('commercial_availability', _availability));
END;
$function$;

REVOKE ALL ON FUNCTION public.set_product_commercial_availability(uuid, uuid, public.product_commercial_availability) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_product_commercial_availability(uuid, uuid, public.product_commercial_availability) TO authenticated, service_role;
-- 1) Origine prodotto
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_origin') THEN
    CREATE TYPE public.product_origin AS ENUM ('danea', 'interno');
  END IF;
END $$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS origin public.product_origin NOT NULL DEFAULT 'danea',
  ADD COLUMN IF NOT EXISTS is_managed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_from_product_id uuid,
  ADD COLUMN IF NOT EXISTS created_from_company_id uuid;

CREATE INDEX IF NOT EXISTS products_company_origin_idx ON public.products (company_id, origin);

-- 2) Archivio interno
ALTER TABLE public.danea_archives
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS danea_archives_one_internal
  ON public.danea_archives (company_id) WHERE is_internal;

CREATE OR REPLACE FUNCTION public.ensure_internal_archive(_company_id uuid, _actor_user_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;

  SELECT id INTO v_id FROM public.danea_archives
  WHERE company_id = _company_id AND is_internal LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.danea_archives (company_id, name, is_internal, is_default, created_by, notes)
  VALUES (_company_id, 'Prodotti propri', true, false, _actor_user_id,
          'Archivio interno per i prodotti creati manualmente o aggiunti dai cataloghi fornitore')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- 3) Le postazioni Danea non possono usare un archivio interno
CREATE OR REPLACE FUNCTION public.danea_station_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _active integer;
BEGIN
  IF NOT public.company_sells(NEW.company_id) THEN
    RAISE EXCEPTION 'Le postazioni Danea sono disponibili solo per le aziende che vendono';
  END IF;

  IF NEW.archive_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.danea_archives a WHERE a.id = NEW.archive_id AND a.is_internal
  ) THEN
    RAISE EXCEPTION 'L''archivio dei prodotti propri non può essere usato da una postazione Danea';
  END IF;

  IF NEW.status = 'attivo' THEN
    SELECT count(*) INTO _active
    FROM public.danea_stations s
    WHERE s.company_id = NEW.company_id
      AND s.status = 'attivo'
      AND s.id <> NEW.id;

    IF _active >= 5 THEN
      RAISE EXCEPTION 'Massimo 5 postazioni Danea attive per azienda';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4) Prossimo codice interno
CREATE OR REPLACE FUNCTION public.next_internal_product_code(_company_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_max integer;
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;

  SELECT COALESCE(max((regexp_replace(p.code, '^00-', ''))::integer), 0) INTO v_max
  FROM public.products p
  WHERE p.company_id = _company_id
    AND p.origin = 'interno'
    AND p.code ~ '^00-[0-9]+$';

  RETURN '00-' || lpad((v_max + 1)::text, 3, '0');
END;
$function$;

-- 5) Gestione prodotto interno
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
  _actor_user_id uuid DEFAULT NULL::uuid
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
      barcode, producer_name, notes, publish_status, origin, is_managed, b2b_visible
    ) VALUES (
      _company_id, v_archive, v_code, btrim(_description),
      NULLIF(btrim(COALESCE(_category, '')), ''), NULLIF(btrim(COALESCE(_subcategory, '')), ''),
      NULLIF(btrim(COALESCE(_danea_um, '')), ''), NULLIF(btrim(COALESCE(_barcode, '')), ''),
      NULLIF(btrim(COALESCE(_producer_name, '')), ''), NULLIF(btrim(COALESCE(_notes, '')), ''),
      'pubblicato', 'interno', true, false
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

-- 6) Aggiungi ai miei prodotti da un catalogo fornitore
CREATE OR REPLACE FUNCTION public.add_catalog_product_to_own_products(
  _buyer_company_id uuid,
  _seller_company_id uuid,
  _seller_product_id uuid,
  _own_product_id uuid DEFAULT NULL::uuid,
  _supplier_product_code text DEFAULT NULL::text,
  _purchase_unit_id uuid DEFAULT NULL::uuid,
  _conversion_factor numeric DEFAULT NULL::numeric,
  _actor_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_seller public.products;
  v_relation uuid;
  v_supplier_record uuid;
  v_product uuid;
  v_link uuid;
  v_created_product boolean := false;
  v_created_link boolean := false;
  v_code text := NULLIF(btrim(COALESCE(_supplier_product_code, '')), '');
  v_archive uuid;
  v_seller_name text;
BEGIN
  IF NOT public.is_company_admin(_buyer_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;
  IF NOT public.can_view_seller_catalogue(_buyer_company_id, _seller_company_id) THEN
    RAISE EXCEPTION 'Catalogo fornitore non accessibile';
  END IF;

  SELECT * INTO v_seller FROM public.products
  WHERE id = _seller_product_id AND company_id = _seller_company_id;
  IF v_seller.id IS NULL THEN
    RAISE EXCEPTION 'Articolo di catalogo non trovato';
  END IF;

  IF v_code IS NULL THEN v_code := v_seller.code; END IF;

  -- anagrafica fornitore collegata al rapporto B2B
  SELECT r.id, r.supplier_record_id INTO v_relation, v_supplier_record
  FROM public.supplier_customer_relations r
  WHERE r.buyer_company_id = _buyer_company_id
    AND r.supplier_company_id = _seller_company_id
  ORDER BY (r.status = 'attivo') DESC, r.created_at DESC
  LIMIT 1;

  IF v_supplier_record IS NULL THEN
    SELECT legal_name INTO v_seller_name FROM public.companies WHERE id = _seller_company_id;
    SELECT s.id INTO v_supplier_record
    FROM public.supplier_records s
    WHERE s.buyer_company_id = _buyer_company_id
      AND lower(s.legal_name) = lower(COALESCE(v_seller_name, ''))
    ORDER BY s.created_at
    LIMIT 1;

    IF v_supplier_record IS NULL THEN
      INSERT INTO public.supplier_records (buyer_company_id, legal_name, created_by)
      VALUES (_buyer_company_id, COALESCE(NULLIF(btrim(COALESCE(v_seller_name, '')), ''), 'Fornitore'),
              COALESCE(_actor_user_id, auth.uid()))
      RETURNING id INTO v_supplier_record;
    END IF;

    IF v_relation IS NOT NULL THEN
      UPDATE public.supplier_customer_relations
      SET supplier_record_id = v_supplier_record, supplier_record_match_required = false
      WHERE id = v_relation AND supplier_record_id IS NULL;
    END IF;
  END IF;

  -- prodotto interno dell'acquirente
  IF _own_product_id IS NOT NULL THEN
    SELECT id INTO v_product FROM public.products
    WHERE id = _own_product_id AND company_id = _buyer_company_id;
    IF v_product IS NULL THEN
      RAISE EXCEPTION 'Prodotto non trovato fra i tuoi prodotti';
    END IF;
  ELSE
    SELECT id INTO v_product FROM public.products
    WHERE company_id = _buyer_company_id
      AND created_from_product_id = _seller_product_id
      AND origin = 'interno'
    LIMIT 1;

    IF v_product IS NULL THEN
      v_archive := public.ensure_internal_archive(_buyer_company_id, COALESCE(_actor_user_id, auth.uid()));
      INSERT INTO public.products (
        company_id, archive_id, code, description, category, subcategory, danea_um,
        barcode, producer_name, publish_status, origin, is_managed, b2b_visible,
        created_from_product_id, created_from_company_id
      ) VALUES (
        _buyer_company_id, v_archive, public.next_internal_product_code(_buyer_company_id),
        COALESCE(v_seller.description, v_seller.code), v_seller.category, v_seller.subcategory,
        v_seller.danea_um, v_seller.barcode, v_seller.producer_name,
        'pubblicato', 'interno', true, false,
        _seller_product_id, _seller_company_id
      ) RETURNING id INTO v_product;
      v_created_product := true;
    END IF;
  END IF;

  -- collegamento fornitore (deduplica applicativa, codice vuoto incluso)
  SELECT id INTO v_link FROM public.product_supplier_links
  WHERE company_id = _buyer_company_id
    AND product_id = v_product
    AND supplier_record_id = v_supplier_record
    AND COALESCE(supplier_product_code, '') = COALESCE(v_code, '')
  LIMIT 1;

  IF v_link IS NULL THEN
    INSERT INTO public.product_supplier_links (
      company_id, product_id, supplier_record_id, supplier_product_code,
      purchase_unit_id, conversion_factor, origin, created_by
    ) VALUES (
      _buyer_company_id, v_product, v_supplier_record, v_code,
      _purchase_unit_id, _conversion_factor, 'manuale', COALESCE(_actor_user_id, auth.uid())
    ) RETURNING id INTO v_link;
    v_created_link := true;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_buyer_company_id, COALESCE(_actor_user_id, auth.uid()), 'catalog_product.add_to_own', 'product', v_product,
          jsonb_build_object('seller_company_id', _seller_company_id,
                             'seller_product_id', _seller_product_id,
                             'link_id', v_link,
                             'created_product', v_created_product,
                             'created_link', v_created_link));

  RETURN jsonb_build_object(
    'product_id', v_product,
    'link_id', v_link,
    'supplier_record_id', v_supplier_record,
    'created_product', v_created_product,
    'created_link', v_created_link
  );
END;
$function$;

-- 7) Inventario: archivio opzionale, solo prodotti gestiti
CREATE OR REPLACE FUNCTION public.start_general_inventory(_company_id uuid, _archive_id uuid DEFAULT NULL::uuid, _name text DEFAULT NULL::text, _actor_user_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_id uuid;
  v_default uuid;
  v_archive uuid := _archive_id;
BEGIN
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Solo un amministratore può avviare un inventario';
  END IF;

  IF v_archive IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.danea_archives WHERE id = v_archive AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Archivio non valido';
  END IF;

  IF v_archive IS NULL THEN
    SELECT id INTO v_archive FROM public.danea_archives
    WHERE company_id = _company_id AND is_default LIMIT 1;
  END IF;
  IF v_archive IS NULL THEN
    v_archive := public.ensure_internal_archive(_company_id, _actor_user_id);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('general_inventory:' || _company_id::text, 0));

  SELECT id INTO v_id
  FROM public.inventory_sessions
  WHERE company_id = _company_id
    AND scope = 'generale' AND status = 'in_corso'
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.inventory_sessions (company_id, archive_id, name, scope, location_id, created_by)
    VALUES (_company_id, v_archive,
            COALESCE(NULLIF(btrim(_name), ''), 'Inventario generale ' || to_char(now(), 'DD/MM/YYYY')),
            'generale', NULL, _actor_user_id)
    RETURNING id INTO v_id;

    INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
    VALUES (_company_id, _actor_user_id, 'inventory_session_open', 'inventory_session', v_id,
            jsonb_build_object('scope', 'generale'));
  END IF;

  IF EXISTS (SELECT 1 FROM public.inventory_session_products WHERE session_id = v_id) THEN
    RETURN v_id;
  END IF;

  v_default := public.ensure_default_inventory_location(_company_id, _actor_user_id);

  WITH own_products AS (
    SELECT p.id
    FROM public.products p
    WHERE p.company_id = _company_id
      AND p.publish_status = 'pubblicato'
      AND p.is_managed
  ), active_locations AS (
    SELECT l.id
    FROM public.inventory_locations l
    WHERE l.company_id = _company_id AND l.status = 'attivo'
  ), presence AS (
    SELECT c.product_id, c.location_id
    FROM public.inventory_counts c
    JOIN public.inventory_sessions s ON s.id = c.session_id
    WHERE c.company_id = _company_id AND s.status = 'completata'
    UNION
    SELECT a.product_id, a.location_id FROM public.inventory_adjustments a WHERE a.company_id = _company_id
    UNION
    SELECT m.product_id, m.location_id FROM public.inventory_movements m WHERE m.company_id = _company_id
    UNION
    SELECT sl.product_id, sl.location_id FROM public.stock_lots sl WHERE sl.company_id = _company_id
  ), known AS (
    SELECT DISTINCT pr.product_id, pr.location_id
    FROM presence pr
    JOIN own_products ap ON ap.id = pr.product_id
    JOIN active_locations al ON al.id = pr.location_id
  ), fallback AS (
    SELECT ap.id AS product_id, v_default AS location_id
    FROM own_products ap
    WHERE NOT EXISTS (SELECT 1 FROM known k WHERE k.product_id = ap.id)
  )
  INSERT INTO public.inventory_session_products (company_id, session_id, product_id, location_id)
  SELECT _company_id, v_id, product_id, location_id FROM known
  UNION
  SELECT _company_id, v_id, product_id, location_id FROM fallback
  ON CONFLICT (session_id, product_id, location_id) DO NOTHING;

  RETURN v_id;
END;
$function$;
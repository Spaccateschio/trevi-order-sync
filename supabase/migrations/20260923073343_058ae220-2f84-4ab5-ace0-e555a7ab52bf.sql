
-- =============================================================
-- Controllo andamento prezzo: registro osservazioni + serie
-- =============================================================

CREATE TYPE public.price_observation_kind AS ENUM ('observed_price', 'actual_purchase_cost');
CREATE TYPE public.price_basis AS ENUM ('netto', 'lordo');
CREATE TYPE public.price_observation_source AS ENUM (
  'danea_supplier_cost', 'danea_price_list', 'b2b_price_list',
  'manual_cost', 'supplier_confirmation', 'goods_receipt', 'backfill_initial'
);

-- Identità della serie: azienda monitorante + fornitore + referenza.
CREATE OR REPLACE FUNCTION public.price_series_key(
  _company_id uuid,
  _supplier_company_id uuid,
  _supplier_record_id uuid,
  _supplier_label text,
  _supplier_product_id uuid,
  _supplier_reference text
) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT _company_id::text || '|'
    || CASE
         WHEN _supplier_company_id IS NOT NULL THEN 'co:' || _supplier_company_id::text
         WHEN _supplier_record_id IS NOT NULL THEN 'rec:' || _supplier_record_id::text
         ELSE 'lbl:' || lower(btrim(COALESCE(_supplier_label, '')))
       END
    || '|'
    || CASE
         WHEN _supplier_product_id IS NOT NULL THEN 'prod:' || _supplier_product_id::text
         ELSE 'ref:' || lower(btrim(COALESCE(_supplier_reference, '')))
       END
$$;

CREATE TABLE public.supplier_price_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  series_key text NOT NULL,
  kind public.price_observation_kind NOT NULL DEFAULT 'observed_price',
  supplier_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  supplier_record_id uuid REFERENCES public.supplier_records(id) ON DELETE SET NULL,
  supplier_label text,
  supplier_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  supplier_reference text,
  net_price numeric(14,4),
  gross_price numeric(14,4),
  currency text NOT NULL DEFAULT 'EUR',
  price_basis public.price_basis NOT NULL DEFAULT 'netto',
  price_unit_code text,
  conversion_factor numeric(14,4),
  conversion_reference_um text,
  source public.price_observation_source NOT NULL,
  price_list_number smallint,
  price_list_id uuid,
  source_event_key text,
  source_ref_table text,
  source_ref_id uuid,
  observed_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_price_observations_price_present
    CHECK (net_price IS NOT NULL OR gross_price IS NOT NULL),
  CONSTRAINT supplier_price_observations_supplier_present
    CHECK (supplier_company_id IS NOT NULL OR supplier_record_id IS NOT NULL
           OR NULLIF(btrim(COALESCE(supplier_label, '')), '') IS NOT NULL),
  CONSTRAINT supplier_price_observations_reference_present
    CHECK (supplier_product_id IS NOT NULL
           OR NULLIF(btrim(COALESCE(supplier_reference, '')), '') IS NOT NULL)
);

CREATE UNIQUE INDEX supplier_price_observations_event_uniq
  ON public.supplier_price_observations (company_id, source, source_event_key)
  WHERE source_event_key IS NOT NULL;
CREATE INDEX supplier_price_observations_series_idx
  ON public.supplier_price_observations (series_key, kind, observed_at DESC);
CREATE INDEX supplier_price_observations_company_idx
  ON public.supplier_price_observations (company_id, observed_at DESC);

GRANT SELECT ON public.supplier_price_observations TO authenticated;
GRANT ALL ON public.supplier_price_observations TO service_role;

ALTER TABLE public.supplier_price_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membri leggono le osservazioni della propria azienda"
  ON public.supplier_price_observations FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE TABLE public.supplier_price_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  series_key text NOT NULL,
  kind public.price_observation_kind NOT NULL DEFAULT 'observed_price',
  supplier_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  supplier_record_id uuid REFERENCES public.supplier_records(id) ON DELETE SET NULL,
  supplier_label text,
  supplier_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  supplier_reference text,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_supplier_link_id uuid REFERENCES public.product_supplier_links(id) ON DELETE SET NULL,
  current_observation_id uuid REFERENCES public.supplier_price_observations(id) ON DELETE SET NULL,
  previous_observation_id uuid REFERENCES public.supplier_price_observations(id) ON DELETE SET NULL,
  current_net_price numeric(14,4),
  current_gross_price numeric(14,4),
  current_currency text,
  current_price_basis public.price_basis,
  current_price_unit_code text,
  current_source public.price_observation_source,
  current_price_list_number smallint,
  current_observed_at timestamptz,
  previous_net_price numeric(14,4),
  previous_gross_price numeric(14,4),
  previous_currency text,
  previous_price_basis public.price_basis,
  previous_price_unit_code text,
  previous_source public.price_observation_source,
  previous_observed_at timestamptz,
  comparable boolean NOT NULL DEFAULT false,
  delta_amount numeric(14,4),
  delta_percent numeric(9,2),
  direction text NOT NULL DEFAULT 'not_comparable',
  observation_count integer NOT NULL DEFAULT 0,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_price_series_direction_check
    CHECK (direction IN ('up', 'down', 'equal', 'first', 'not_comparable'))
);

CREATE UNIQUE INDEX supplier_price_series_uniq
  ON public.supplier_price_series (series_key, kind);
CREATE INDEX supplier_price_series_product_idx
  ON public.supplier_price_series (company_id, product_id, kind);
CREATE INDEX supplier_price_series_catalog_idx
  ON public.supplier_price_series (company_id, supplier_company_id, supplier_product_id, kind);

GRANT SELECT ON public.supplier_price_series TO authenticated;
GRANT ALL ON public.supplier_price_series TO service_role;

ALTER TABLE public.supplier_price_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membri leggono le serie prezzo della propria azienda"
  ON public.supplier_price_series FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

-- Storico immutabile: si può aggiornare solo la data di ultima verifica.
CREATE OR REPLACE FUNCTION public.guard_price_observation_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Le osservazioni di prezzo non possono essere eliminate';
  END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.series_key IS DISTINCT FROM OLD.series_key
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.net_price IS DISTINCT FROM OLD.net_price
     OR NEW.gross_price IS DISTINCT FROM OLD.gross_price
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.price_basis IS DISTINCT FROM OLD.price_basis
     OR NEW.price_unit_code IS DISTINCT FROM OLD.price_unit_code
     OR NEW.conversion_factor IS DISTINCT FROM OLD.conversion_factor
     OR NEW.conversion_reference_um IS DISTINCT FROM OLD.conversion_reference_um
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.price_list_number IS DISTINCT FROM OLD.price_list_number
     OR NEW.observed_at IS DISTINCT FROM OLD.observed_at THEN
    RAISE EXCEPTION 'Le osservazioni di prezzo sono in sola aggiunta: modificabile solo la data di ultima verifica';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER supplier_price_observations_immutable
  BEFORE UPDATE OR DELETE ON public.supplier_price_observations
  FOR EACH ROW EXECUTE FUNCTION public.guard_price_observation_immutable();

CREATE TRIGGER supplier_price_series_updated_at
  BEFORE UPDATE ON public.supplier_price_series
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================
-- Scrittura: unica funzione, nessun accesso diretto dal client
-- =============================================================
CREATE OR REPLACE FUNCTION public.record_price_observation(
  _company_id uuid,
  _source public.price_observation_source,
  _kind public.price_observation_kind DEFAULT 'observed_price',
  _supplier_company_id uuid DEFAULT NULL,
  _supplier_record_id uuid DEFAULT NULL,
  _supplier_label text DEFAULT NULL,
  _supplier_product_id uuid DEFAULT NULL,
  _supplier_reference text DEFAULT NULL,
  _net_price numeric DEFAULT NULL,
  _gross_price numeric DEFAULT NULL,
  _currency text DEFAULT 'EUR',
  _price_basis public.price_basis DEFAULT 'netto',
  _price_unit_code text DEFAULT NULL,
  _conversion_factor numeric DEFAULT NULL,
  _conversion_reference_um text DEFAULT NULL,
  _price_list_number smallint DEFAULT NULL,
  _price_list_id uuid DEFAULT NULL,
  _source_event_key text DEFAULT NULL,
  _source_ref_table text DEFAULT NULL,
  _source_ref_id uuid DEFAULT NULL,
  _product_id uuid DEFAULT NULL,
  _product_supplier_link_id uuid DEFAULT NULL,
  _observed_at timestamptz DEFAULT now(),
  _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_existing uuid;
  v_last public.supplier_price_observations;
  v_new public.supplier_price_observations;
  v_same boolean;
  v_cur numeric;
  v_prev numeric;
  v_comparable boolean := false;
  v_direction text := 'not_comparable';
  v_delta numeric;
  v_percent numeric;
BEGIN
  IF _company_id IS NULL OR _source IS NULL THEN
    RETURN NULL;
  END IF;
  IF _net_price IS NULL AND _gross_price IS NULL THEN
    RETURN NULL;
  END IF;
  IF _supplier_company_id IS NULL AND _supplier_record_id IS NULL
     AND NULLIF(btrim(COALESCE(_supplier_label, '')), '') IS NULL THEN
    RETURN NULL;
  END IF;
  IF _supplier_product_id IS NULL
     AND NULLIF(btrim(COALESCE(_supplier_reference, '')), '') IS NULL THEN
    RETURN NULL;
  END IF;

  v_key := public.price_series_key(_company_id, _supplier_company_id, _supplier_record_id,
                                   _supplier_label, _supplier_product_id, _supplier_reference);

  -- 1) stesso evento sorgente: nessun duplicato
  IF _source_event_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.supplier_price_observations
    WHERE company_id = _company_id AND source = _source AND source_event_key = _source_event_key;
    IF v_existing IS NOT NULL THEN
      UPDATE public.supplier_price_observations SET last_seen_at = now() WHERE id = v_existing;
      UPDATE public.supplier_price_series SET last_seen_at = now()
      WHERE series_key = v_key AND kind = _kind AND current_observation_id = v_existing;
      RETURN v_existing;
    END IF;
  END IF;

  SELECT * INTO v_last FROM public.supplier_price_observations
  WHERE series_key = v_key AND kind = _kind
  ORDER BY observed_at DESC, created_at DESC
  LIMIT 1;

  -- 2) stesso contenuto: nessuna falsa variazione, solo ultima verifica
  IF v_last.id IS NOT NULL THEN
    v_same := v_last.net_price IS NOT DISTINCT FROM _net_price
      AND v_last.gross_price IS NOT DISTINCT FROM _gross_price
      AND v_last.currency IS NOT DISTINCT FROM COALESCE(_currency, 'EUR')
      AND v_last.price_basis IS NOT DISTINCT FROM _price_basis
      AND v_last.price_unit_code IS NOT DISTINCT FROM _price_unit_code
      AND v_last.conversion_factor IS NOT DISTINCT FROM _conversion_factor
      AND v_last.source IS NOT DISTINCT FROM _source
      AND v_last.price_list_number IS NOT DISTINCT FROM _price_list_number;
    IF v_same THEN
      UPDATE public.supplier_price_observations SET last_seen_at = now() WHERE id = v_last.id;
      UPDATE public.supplier_price_series SET last_seen_at = now()
      WHERE series_key = v_key AND kind = _kind;
      RETURN v_last.id;
    END IF;
  END IF;

  INSERT INTO public.supplier_price_observations (
    company_id, series_key, kind, supplier_company_id, supplier_record_id, supplier_label,
    supplier_product_id, supplier_reference, net_price, gross_price, currency, price_basis,
    price_unit_code, conversion_factor, conversion_reference_um, source, price_list_number,
    price_list_id, source_event_key, source_ref_table, source_ref_id, observed_at, last_seen_at, notes
  ) VALUES (
    _company_id, v_key, _kind, _supplier_company_id, _supplier_record_id,
    NULLIF(btrim(COALESCE(_supplier_label, '')), ''), _supplier_product_id,
    NULLIF(btrim(COALESCE(_supplier_reference, '')), ''), _net_price, _gross_price,
    COALESCE(_currency, 'EUR'), _price_basis, _price_unit_code, _conversion_factor,
    _conversion_reference_um, _source, _price_list_number, _price_list_id, _source_event_key,
    _source_ref_table, _source_ref_id, COALESCE(_observed_at, now()), now(), _notes
  ) RETURNING * INTO v_new;

  -- confronto solo fra osservazioni realmente confrontabili
  IF v_last.id IS NOT NULL
     AND v_last.currency IS NOT DISTINCT FROM v_new.currency
     AND v_last.price_basis IS NOT DISTINCT FROM v_new.price_basis
     AND v_last.price_unit_code IS NOT DISTINCT FROM v_new.price_unit_code
     AND v_last.conversion_factor IS NOT DISTINCT FROM v_new.conversion_factor THEN
    IF v_last.net_price IS NOT NULL AND v_new.net_price IS NOT NULL THEN
      v_prev := v_last.net_price; v_cur := v_new.net_price; v_comparable := true;
    ELSIF v_last.gross_price IS NOT NULL AND v_new.gross_price IS NOT NULL THEN
      v_prev := v_last.gross_price; v_cur := v_new.gross_price; v_comparable := true;
    END IF;
  END IF;

  IF v_comparable THEN
    v_delta := v_cur - v_prev;
    IF v_prev <> 0 THEN v_percent := round((v_delta / v_prev) * 100, 2); END IF;
    v_direction := CASE WHEN v_cur = v_prev THEN 'equal' WHEN v_cur > v_prev THEN 'up' ELSE 'down' END;
  ELSIF v_last.id IS NULL THEN
    v_direction := 'first';
  END IF;

  INSERT INTO public.supplier_price_series (
    company_id, series_key, kind, supplier_company_id, supplier_record_id, supplier_label,
    supplier_product_id, supplier_reference, product_id, product_supplier_link_id,
    current_observation_id, previous_observation_id,
    current_net_price, current_gross_price, current_currency, current_price_basis,
    current_price_unit_code, current_source, current_price_list_number, current_observed_at,
    previous_net_price, previous_gross_price, previous_currency, previous_price_basis,
    previous_price_unit_code, previous_source, previous_observed_at,
    comparable, delta_amount, delta_percent, direction, observation_count, last_seen_at
  ) VALUES (
    _company_id, v_key, _kind, _supplier_company_id, _supplier_record_id,
    NULLIF(btrim(COALESCE(_supplier_label, '')), ''), _supplier_product_id,
    NULLIF(btrim(COALESCE(_supplier_reference, '')), ''), _product_id, _product_supplier_link_id,
    v_new.id, v_last.id,
    v_new.net_price, v_new.gross_price, v_new.currency, v_new.price_basis,
    v_new.price_unit_code, v_new.source, v_new.price_list_number, v_new.observed_at,
    v_last.net_price, v_last.gross_price, v_last.currency, v_last.price_basis,
    v_last.price_unit_code, v_last.source, v_last.observed_at,
    v_comparable, v_delta, v_percent, v_direction, 1, now()
  )
  ON CONFLICT (series_key, kind) DO UPDATE SET
    product_id = COALESCE(public.supplier_price_series.product_id, EXCLUDED.product_id),
    product_supplier_link_id = COALESCE(public.supplier_price_series.product_supplier_link_id,
                                        EXCLUDED.product_supplier_link_id),
    current_observation_id = EXCLUDED.current_observation_id,
    previous_observation_id = EXCLUDED.previous_observation_id,
    current_net_price = EXCLUDED.current_net_price,
    current_gross_price = EXCLUDED.current_gross_price,
    current_currency = EXCLUDED.current_currency,
    current_price_basis = EXCLUDED.current_price_basis,
    current_price_unit_code = EXCLUDED.current_price_unit_code,
    current_source = EXCLUDED.current_source,
    current_price_list_number = EXCLUDED.current_price_list_number,
    current_observed_at = EXCLUDED.current_observed_at,
    previous_net_price = EXCLUDED.previous_net_price,
    previous_gross_price = EXCLUDED.previous_gross_price,
    previous_currency = EXCLUDED.previous_currency,
    previous_price_basis = EXCLUDED.previous_price_basis,
    previous_price_unit_code = EXCLUDED.previous_price_unit_code,
    previous_source = EXCLUDED.previous_source,
    previous_observed_at = EXCLUDED.previous_observed_at,
    comparable = EXCLUDED.comparable,
    delta_amount = EXCLUDED.delta_amount,
    delta_percent = EXCLUDED.delta_percent,
    direction = EXCLUDED.direction,
    observation_count = public.supplier_price_series.observation_count + 1,
    last_seen_at = now();

  RETURN v_new.id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_price_observation(uuid, public.price_observation_source,
  public.price_observation_kind, uuid, uuid, text, uuid, text, numeric, numeric, text,
  public.price_basis, text, numeric, text, smallint, uuid, text, text, uuid, uuid, uuid,
  timestamptz, text) FROM PUBLIC, anon, authenticated;

-- Adozione: il prodotto si collega alla serie, lo storico non viene riscritto.
CREATE OR REPLACE FUNCTION public.link_price_series_to_product(
  _company_id uuid,
  _supplier_company_id uuid,
  _supplier_product_id uuid,
  _product_id uuid,
  _product_supplier_link_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Azienda non accessibile';
  END IF;
  UPDATE public.supplier_price_series s
  SET product_id = COALESCE(s.product_id, _product_id),
      product_supplier_link_id = COALESCE(s.product_supplier_link_id, _product_supplier_link_id)
  WHERE s.company_id = _company_id
    AND s.supplier_company_id = _supplier_company_id
    AND s.supplier_product_id = _supplier_product_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_price_series_to_product(uuid, uuid, uuid, uuid, uuid) TO authenticated;

-- =============================================================
-- Prezzo B2B applicabile (stessa logica di buyer_catalog_prices, senza auth.uid())
-- =============================================================
CREATE OR REPLACE FUNCTION public.applicable_b2b_price(
  _seller_company_id uuid,
  _buyer_company_id uuid,
  _product_id uuid
) RETURNS TABLE(list_number smallint, net_price numeric, gross_price numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH assignment AS (
    SELECT cr.assigned_price_list_number AS list_number
    FROM public.supplier_customer_relations r
    JOIN public.customer_records cr
      ON cr.id = r.customer_record_id
     AND cr.seller_company_id = r.seller_company_id
    WHERE r.seller_company_id = _seller_company_id
      AND r.buyer_company_id = _buyer_company_id
      AND r.status = 'attivo'
      AND r.seller_enabled
      AND r.buyer_enabled
      AND cr.assigned_price_list_number IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.danea_price_lists l
        WHERE l.company_id = _seller_company_id
          AND l.list_number = cr.assigned_price_list_number
          AND l.is_active
          AND (cr.archive_id IS NULL OR l.archive_id = cr.archive_id)
      )
    LIMIT 1
  )
  SELECT pp.list_number, pp.net_price, pp.gross_price
  FROM public.product_prices pp
  JOIN assignment a ON a.list_number = pp.list_number
  JOIN public.products p
    ON p.id = pp.product_id AND p.publish_status = 'pubblicato' AND p.b2b_visible
  WHERE pp.company_id = _seller_company_id
    AND pp.product_id = _product_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.applicable_b2b_price(uuid, uuid, uuid) TO authenticated;

-- Registra il prezzo B2B applicabile per una coppia acquirente/articolo.
CREATE OR REPLACE FUNCTION public.record_b2b_price_for_buyer(
  _seller_company_id uuid,
  _buyer_company_id uuid,
  _seller_product_id uuid,
  _event_key text DEFAULT NULL,
  _source public.price_observation_source DEFAULT 'b2b_price_list',
  _observed_at timestamptz DEFAULT now(),
  _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price record;
  v_product public.products;
  v_unit text;
  v_own uuid;
BEGIN
  SELECT * INTO v_price FROM public.applicable_b2b_price(_seller_company_id, _buyer_company_id, _seller_product_id);
  IF v_price.list_number IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_product FROM public.products WHERE id = _seller_product_id;
  IF v_product.id IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE((SELECT u.code FROM public.units_of_measure u WHERE u.id = v_product.price_unit_id),
                  v_product.danea_um)
    INTO v_unit;

  SELECT p.id INTO v_own FROM public.products p
  WHERE p.company_id = _buyer_company_id AND p.created_from_product_id = _seller_product_id
  LIMIT 1;

  RETURN public.record_price_observation(
    _company_id => _buyer_company_id,
    _source => _source,
    _kind => 'observed_price',
    _supplier_company_id => _seller_company_id,
    _supplier_product_id => _seller_product_id,
    _supplier_reference => v_product.code,
    _net_price => v_price.net_price,
    _gross_price => v_price.gross_price,
    _price_basis => CASE WHEN v_price.net_price IS NOT NULL THEN 'netto'::public.price_basis
                         ELSE 'lordo'::public.price_basis END,
    _price_unit_code => v_unit,
    _price_list_number => v_price.list_number,
    _source_event_key => _event_key,
    _source_ref_table => 'product_prices',
    _source_ref_id => _seller_product_id,
    _product_id => v_own,
    _observed_at => _observed_at,
    _notes => _notes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_b2b_price_for_buyer(uuid, uuid, uuid, text,
  public.price_observation_source, timestamptz, text) FROM PUBLIC, anon, authenticated;

-- Propaga un cambio prezzo del venditore a tutte le aziende che monitorano l'articolo
-- (preferiti del catalogo e articoli già adottati), senza attendere l'apertura del catalogo.
CREATE OR REPLACE FUNCTION public.propagate_seller_price_change(
  _seller_company_id uuid,
  _product_ids uuid[],
  _event_key text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_count integer := 0;
  v_key text;
BEGIN
  FOR r IN
    SELECT DISTINCT f.buyer_company_id, f.product_id
    FROM public.buyer_product_favorites f
    WHERE f.seller_company_id = _seller_company_id
      AND f.product_id = ANY(_product_ids)
    UNION
    SELECT DISTINCT p.company_id AS buyer_company_id, p.created_from_product_id AS product_id
    FROM public.products p
    WHERE p.created_from_company_id = _seller_company_id
      AND p.created_from_product_id = ANY(_product_ids)
  LOOP
    v_key := CASE WHEN _event_key IS NULL THEN NULL
                  ELSE _event_key || ':' || r.buyer_company_id::text || ':' || r.product_id::text END;
    IF public.record_b2b_price_for_buyer(_seller_company_id, r.buyer_company_id, r.product_id, v_key)
       IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.propagate_seller_price_change(uuid, uuid[], text)
  FROM PUBLIC, anon, authenticated;

-- Prima stella: il prezzo corrente diventa il primo prezzo conosciuto della serie.
CREATE OR REPLACE FUNCTION public.seed_price_series_for_favorite(
  _buyer_company_id uuid,
  _seller_company_id uuid,
  _seller_product_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_company_member(_buyer_company_id) THEN
    RAISE EXCEPTION 'Azienda non accessibile';
  END IF;
  RETURN public.record_b2b_price_for_buyer(
    _seller_company_id, _buyer_company_id, _seller_product_id,
    'favorite-seed:' || _buyer_company_id::text || ':' || _seller_product_id::text
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_price_series_for_favorite(uuid, uuid, uuid) TO authenticated;

-- =============================================================
-- Agganci: solo cambi reali del dato sorgente
-- =============================================================

-- Costo fornitore importato da Danea
CREATE OR REPLACE FUNCTION public.hook_price_from_supplier_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product public.products;
  v_unit text;
  v_link public.product_supplier_links;
BEGIN
  IF NEW.supplier_net_price IS NULL AND NEW.supplier_gross_price IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = NEW.product_id;
  SELECT COALESCE((SELECT u.code FROM public.units_of_measure u WHERE u.id = v_product.price_unit_id),
                  v_product.danea_um) INTO v_unit;

  SELECT * INTO v_link FROM public.product_supplier_links l
  WHERE l.company_id = NEW.company_id AND l.product_id = NEW.product_id
    AND COALESCE(l.supplier_product_code, '') = COALESCE(NEW.supplier_product_code, '')
  ORDER BY l.created_at LIMIT 1;

  PERFORM public.record_price_observation(
    _company_id => NEW.company_id,
    _source => 'danea_supplier_cost',
    _kind => 'observed_price',
    _supplier_record_id => v_link.supplier_record_id,
    _supplier_label => COALESCE(NEW.supplier_name, NEW.supplier_code),
    _supplier_reference => COALESCE(NULLIF(NEW.supplier_product_code, ''), v_product.code),
    _net_price => NEW.supplier_net_price,
    _gross_price => NEW.supplier_gross_price,
    _price_basis => CASE WHEN NEW.supplier_net_price IS NOT NULL THEN 'netto'::public.price_basis
                         ELSE 'lordo'::public.price_basis END,
    _price_unit_code => v_unit,
    _source_ref_table => 'product_supplier_costs',
    _source_ref_id => NEW.id,
    _product_id => NEW.product_id,
    _product_supplier_link_id => v_link.id,
    _observed_at => COALESCE(NEW.received_at, now())
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_supplier_costs_price_history
  AFTER INSERT OR UPDATE OF supplier_net_price, supplier_gross_price, supplier_name, supplier_product_code
  ON public.product_supplier_costs
  FOR EACH ROW EXECUTE FUNCTION public.hook_price_from_supplier_cost();

-- Costo manuale del collegamento fornitore
CREATE OR REPLACE FUNCTION public.hook_price_from_manual_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product public.products;
  v_unit text;
BEGIN
  IF NEW.manual_cost IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.manual_cost IS NOT DISTINCT FROM OLD.manual_cost THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = NEW.product_id;
  SELECT COALESCE((SELECT u.code FROM public.units_of_measure u WHERE u.id = NEW.purchase_unit_id),
                  (SELECT u.code FROM public.units_of_measure u WHERE u.id = v_product.price_unit_id),
                  v_product.danea_um) INTO v_unit;

  PERFORM public.record_price_observation(
    _company_id => NEW.company_id,
    _source => 'manual_cost',
    _kind => 'observed_price',
    _supplier_record_id => NEW.supplier_record_id,
    _supplier_reference => COALESCE(NULLIF(NEW.supplier_product_code, ''), v_product.code),
    _net_price => NEW.manual_cost,
    _price_basis => 'netto',
    _price_unit_code => v_unit,
    _conversion_factor => NEW.conversion_factor,
    _conversion_reference_um => NEW.conversion_reference_um,
    _source_ref_table => 'product_supplier_links',
    _source_ref_id => NEW.id,
    _product_id => NEW.product_id,
    _product_supplier_link_id => NEW.id,
    _observed_at => COALESCE(NEW.manual_cost_at, now())
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_supplier_links_price_history
  AFTER INSERT OR UPDATE OF manual_cost, manual_cost_at
  ON public.product_supplier_links
  FOR EACH ROW EXECUTE FUNCTION public.hook_price_from_manual_cost();

-- Listini del venditore: propaga a chi monitora l'articolo
CREATE OR REPLACE FUNCTION public.hook_price_from_product_prices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row public.product_prices;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  PERFORM public.propagate_seller_price_change(v_row.company_id, ARRAY[v_row.product_id], NULL);
  RETURN NULL;
END;
$$;

CREATE TRIGGER product_prices_price_history
  AFTER INSERT OR UPDATE OR DELETE ON public.product_prices
  FOR EACH ROW EXECUTE FUNCTION public.hook_price_from_product_prices();

-- Cambio del listino assegnato al cliente
CREATE OR REPLACE FUNCTION public.hook_price_from_customer_price_list()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer uuid;
  v_products uuid[];
BEGIN
  IF NEW.assigned_price_list_number IS NOT DISTINCT FROM OLD.assigned_price_list_number THEN
    RETURN NEW;
  END IF;

  SELECT r.buyer_company_id INTO v_buyer
  FROM public.supplier_customer_relations r
  WHERE r.customer_record_id = NEW.id AND r.seller_company_id = NEW.seller_company_id
    AND r.status = 'attivo'
  LIMIT 1;
  IF v_buyer IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(array_agg(DISTINCT pid), '{}') INTO v_products FROM (
    SELECT f.product_id AS pid FROM public.buyer_product_favorites f
    WHERE f.buyer_company_id = v_buyer AND f.seller_company_id = NEW.seller_company_id
    UNION
    SELECT p.created_from_product_id AS pid FROM public.products p
    WHERE p.company_id = v_buyer AND p.created_from_company_id = NEW.seller_company_id
      AND p.created_from_product_id IS NOT NULL
  ) s;

  IF array_length(v_products, 1) IS NULL THEN RETURN NEW; END IF;
  PERFORM public.propagate_seller_price_change(NEW.seller_company_id, v_products, NULL);
  RETURN NEW;
END;
$$;

CREATE TRIGGER customer_records_price_history
  AFTER UPDATE OF assigned_price_list_number ON public.customer_records
  FOR EACH ROW EXECUTE FUNCTION public.hook_price_from_customer_price_list();

-- Costo realmente pagato: solo alla conferma del carico merce
CREATE OR REPLACE FUNCTION public.hook_price_from_goods_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  IF NEW.status <> 'confermato' OR OLD.status = 'confermato' THEN RETURN NEW; END IF;

  FOR r IN
    SELECT i.id, i.product_id, i.unit_cost, i.unit_code, p.code AS product_code,
           l.id AS link_id, l.supplier_product_code
    FROM public.goods_receipt_items i
    JOIN public.products p ON p.id = i.product_id
    LEFT JOIN public.product_supplier_links l
      ON l.company_id = i.company_id AND l.product_id = i.product_id
     AND l.supplier_record_id = NEW.supplier_record_id
    WHERE i.receipt_id = NEW.id AND i.unit_cost IS NOT NULL
  LOOP
    PERFORM public.record_price_observation(
      _company_id => NEW.company_id,
      _source => 'goods_receipt',
      _kind => 'actual_purchase_cost',
      _supplier_record_id => NEW.supplier_record_id,
      _supplier_reference => COALESCE(NULLIF(r.supplier_product_code, ''), r.product_code),
      _net_price => r.unit_cost,
      _price_basis => 'netto',
      _price_unit_code => r.unit_code,
      _source_event_key => 'goods_receipt:' || r.id::text,
      _source_ref_table => 'goods_receipt_items',
      _source_ref_id => r.id,
      _product_id => r.product_id,
      _product_supplier_link_id => r.link_id,
      _observed_at => COALESCE(NEW.confirmed_at, NEW.received_at, now())
    );
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER goods_receipts_price_history
  AFTER UPDATE OF status ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.hook_price_from_goods_receipt();

-- =============================================================
-- Dato iniziale (nessuna cronologia inventata)
-- =============================================================
DO $backfill$
DECLARE r record;
BEGIN
  -- costo fornitore Danea
  FOR r IN
    SELECT c.*, p.code AS product_code, p.danea_um, p.price_unit_id
    FROM public.product_supplier_costs c
    JOIN public.products p ON p.id = c.product_id
    WHERE c.supplier_net_price IS NOT NULL OR c.supplier_gross_price IS NOT NULL
  LOOP
    PERFORM public.record_price_observation(
      _company_id => r.company_id,
      _source => 'backfill_initial',
      _supplier_record_id => (SELECT l.supplier_record_id FROM public.product_supplier_links l
                              WHERE l.company_id = r.company_id AND l.product_id = r.product_id
                              ORDER BY l.created_at LIMIT 1),
      _supplier_label => COALESCE(r.supplier_name, r.supplier_code),
      _supplier_reference => COALESCE(NULLIF(r.supplier_product_code, ''), r.product_code),
      _net_price => r.supplier_net_price,
      _gross_price => r.supplier_gross_price,
      _price_basis => CASE WHEN r.supplier_net_price IS NOT NULL THEN 'netto'::public.price_basis
                           ELSE 'lordo'::public.price_basis END,
      _price_unit_code => COALESCE((SELECT u.code FROM public.units_of_measure u WHERE u.id = r.price_unit_id), r.danea_um),
      _source_event_key => 'backfill:product_supplier_costs:' || r.id::text,
      _source_ref_table => 'product_supplier_costs',
      _source_ref_id => r.id,
      _product_id => r.product_id,
      _observed_at => COALESCE(r.received_at, r.created_at),
      _notes => 'Dato iniziale: costo fornitore Danea'
    );
  END LOOP;

  -- costo manuale del collegamento fornitore
  FOR r IN
    SELECT l.*, p.code AS product_code, p.danea_um, p.price_unit_id
    FROM public.product_supplier_links l
    JOIN public.products p ON p.id = l.product_id
    WHERE l.manual_cost IS NOT NULL
  LOOP
    PERFORM public.record_price_observation(
      _company_id => r.company_id,
      _source => 'backfill_initial',
      _supplier_record_id => r.supplier_record_id,
      _supplier_reference => COALESCE(NULLIF(r.supplier_product_code, ''), r.product_code),
      _net_price => r.manual_cost,
      _price_basis => 'netto',
      _price_unit_code => COALESCE((SELECT u.code FROM public.units_of_measure u WHERE u.id = r.purchase_unit_id),
                                   (SELECT u.code FROM public.units_of_measure u WHERE u.id = r.price_unit_id), r.danea_um),
      _conversion_factor => r.conversion_factor,
      _conversion_reference_um => r.conversion_reference_um,
      _source_event_key => 'backfill:product_supplier_links:' || r.id::text,
      _source_ref_table => 'product_supplier_links',
      _source_ref_id => r.id,
      _product_id => r.product_id,
      _product_supplier_link_id => r.id,
      _observed_at => COALESCE(r.manual_cost_at, r.created_at),
      _notes => 'Dato iniziale: costo manuale'
    );
  END LOOP;

  -- costo realmente pagato sui carichi confermati
  FOR r IN
    SELECT i.id, i.company_id, i.product_id, i.unit_cost, i.unit_code, i.created_at,
           g.supplier_record_id, g.confirmed_at, g.received_at, p.code AS product_code
    FROM public.goods_receipt_items i
    JOIN public.goods_receipts g ON g.id = i.receipt_id AND g.status = 'confermato'
    JOIN public.products p ON p.id = i.product_id
    WHERE i.unit_cost IS NOT NULL
  LOOP
    PERFORM public.record_price_observation(
      _company_id => r.company_id,
      _source => 'backfill_initial',
      _kind => 'actual_purchase_cost',
      _supplier_record_id => r.supplier_record_id,
      _supplier_reference => r.product_code,
      _net_price => r.unit_cost,
      _price_basis => 'netto',
      _price_unit_code => r.unit_code,
      _source_event_key => 'backfill:goods_receipt_items:' || r.id::text,
      _source_ref_table => 'goods_receipt_items',
      _source_ref_id => r.id,
      _product_id => r.product_id,
      _observed_at => COALESCE(r.confirmed_at, r.received_at, r.created_at),
      _notes => 'Dato iniziale: costo realmente pagato'
    );
  END LOOP;

  -- prezzo B2B applicabile, solo su relazioni reali con listino assegnato
  FOR r IN
    SELECT DISTINCT f.buyer_company_id, f.seller_company_id, f.product_id
    FROM public.buyer_product_favorites f
    UNION
    SELECT DISTINCT p.company_id, p.created_from_company_id, p.created_from_product_id
    FROM public.products p
    WHERE p.created_from_company_id IS NOT NULL AND p.created_from_product_id IS NOT NULL
  LOOP
    PERFORM public.record_b2b_price_for_buyer(
      r.seller_company_id, r.buyer_company_id, r.product_id,
      'backfill:b2b:' || r.buyer_company_id::text || ':' || r.product_id::text,
      'backfill_initial', now(), 'Dato iniziale: prezzo di listino B2B applicabile'
    );
  END LOOP;
END;
$backfill$;

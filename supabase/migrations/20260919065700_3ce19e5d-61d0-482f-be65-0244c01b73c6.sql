-- ============ Tipi ============
CREATE TYPE public.inventory_session_scope AS ENUM ('generale', 'ubicazione');
CREATE TYPE public.inventory_session_status AS ENUM ('in_corso', 'completata', 'annullata');

-- ============ Ubicazioni ============
CREATE TABLE public.inventory_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  name text NOT NULL,
  code text,
  is_default boolean NOT NULL DEFAULT false,
  status public.entity_status NOT NULL DEFAULT 'attivo',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.inventory_locations TO authenticated;
GRANT ALL ON public.inventory_locations TO service_role;
ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_locations_select ON public.inventory_locations
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE UNIQUE INDEX inventory_locations_name_key ON public.inventory_locations (company_id, lower(name));
CREATE UNIQUE INDEX inventory_locations_default_key ON public.inventory_locations (company_id) WHERE is_default;
CREATE TRIGGER inventory_locations_set_updated_at BEFORE UPDATE ON public.inventory_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Parametri magazzino del prodotto (solo valori manuali) ============
CREATE TABLE public.product_stock_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  min_stock numeric,
  order_multiple numeric,
  stock_unit_id uuid REFERENCES public.units_of_measure(id),
  coverage_days integer,
  perishability text,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_stock_settings_min_stock_check CHECK (min_stock IS NULL OR min_stock >= 0),
  CONSTRAINT product_stock_settings_multiple_check CHECK (order_multiple IS NULL OR order_multiple > 0),
  CONSTRAINT product_stock_settings_coverage_check CHECK (coverage_days IS NULL OR coverage_days >= 0)
);
GRANT SELECT ON public.product_stock_settings TO authenticated;
GRANT ALL ON public.product_stock_settings TO service_role;
ALTER TABLE public.product_stock_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_stock_settings_select ON public.product_stock_settings
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE UNIQUE INDEX product_stock_settings_product_key ON public.product_stock_settings (company_id, product_id);
CREATE TRIGGER product_stock_settings_set_updated_at BEFORE UPDATE ON public.product_stock_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Sessioni di inventario ============
CREATE TABLE public.inventory_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  archive_id uuid NOT NULL REFERENCES public.danea_archives(id),
  name text NOT NULL,
  scope public.inventory_session_scope NOT NULL DEFAULT 'generale',
  location_id uuid REFERENCES public.inventory_locations(id),
  status public.inventory_session_status NOT NULL DEFAULT 'in_corso',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_sessions_scope_check CHECK (
    (scope = 'ubicazione' AND location_id IS NOT NULL) OR (scope = 'generale' AND location_id IS NULL)
  )
);
GRANT SELECT ON public.inventory_sessions TO authenticated;
GRANT ALL ON public.inventory_sessions TO service_role;
ALTER TABLE public.inventory_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_sessions_select ON public.inventory_sessions
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE INDEX inventory_sessions_company_idx ON public.inventory_sessions (company_id, status, started_at DESC);
-- Regola operativa della prima versione (rimovibile senza toccare il modello dati):
-- una sola sessione aperta per ubicazione e una sola sessione generale aperta per archivio.
CREATE UNIQUE INDEX inventory_sessions_open_location_key ON public.inventory_sessions (location_id)
  WHERE status = 'in_corso' AND scope = 'ubicazione';
CREATE UNIQUE INDEX inventory_sessions_open_general_key ON public.inventory_sessions (company_id, archive_id)
  WHERE status = 'in_corso' AND scope = 'generale';
CREATE TRIGGER inventory_sessions_set_updated_at BEFORE UPDATE ON public.inventory_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Conteggi ============
CREATE TABLE public.inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  session_id uuid NOT NULL REFERENCES public.inventory_sessions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.inventory_locations(id),
  counted_quantity numeric NOT NULL,
  unit_id uuid REFERENCES public.units_of_measure(id),
  unit_code text,
  previous_quantity numeric NOT NULL DEFAULT 0,
  difference numeric GENERATED ALWAYS AS (counted_quantity - previous_quantity) STORED,
  counted_at timestamptz NOT NULL DEFAULT now(),
  counted_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_counts_quantity_check CHECK (counted_quantity >= 0)
);
GRANT SELECT ON public.inventory_counts TO authenticated;
GRANT ALL ON public.inventory_counts TO service_role;
ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_counts_select ON public.inventory_counts
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE UNIQUE INDEX inventory_counts_unique_key ON public.inventory_counts (session_id, product_id, location_id);
CREATE INDEX inventory_counts_stock_idx ON public.inventory_counts (product_id, location_id, counted_at DESC);
CREATE TRIGGER inventory_counts_set_updated_at BEFORE UPDATE ON public.inventory_counts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Rettifiche (solo aggiunta) ============
CREATE TABLE public.inventory_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.inventory_locations(id),
  quantity numeric NOT NULL,
  reason text NOT NULL,
  reference_count_id uuid REFERENCES public.inventory_counts(id),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_adjustments_quantity_check CHECK (quantity <> 0),
  CONSTRAINT inventory_adjustments_reason_check CHECK (length(btrim(reason)) > 0)
);
GRANT SELECT ON public.inventory_adjustments TO authenticated;
GRANT ALL ON public.inventory_adjustments TO service_role;
ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_adjustments_select ON public.inventory_adjustments
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE INDEX inventory_adjustments_stock_idx ON public.inventory_adjustments (product_id, location_id, created_at DESC);

-- ============ Coerenza ============
CREATE OR REPLACE FUNCTION public.validate_inventory_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.inventory_sessions;
  v_product public.products;
  v_location public.inventory_locations;
BEGIN
  SELECT * INTO v_session FROM public.inventory_sessions WHERE id = NEW.session_id;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Sessione di inventario inesistente';
  END IF;
  IF v_session.status <> 'in_corso' THEN
    RAISE EXCEPTION 'La sessione non è aperta: i conteggi non sono modificabili';
  END IF;
  IF v_session.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'La sessione appartiene a un''altra azienda';
  END IF;
  IF v_session.scope = 'ubicazione' AND v_session.location_id <> NEW.location_id THEN
    RAISE EXCEPTION 'La sessione è riferita a un''altra ubicazione';
  END IF;

  SELECT * INTO v_location FROM public.inventory_locations WHERE id = NEW.location_id;
  IF v_location.id IS NULL OR v_location.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'Ubicazione non valida per questa azienda';
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = NEW.product_id;
  IF v_product.id IS NULL OR v_product.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'Prodotto non valido per questa azienda';
  END IF;
  IF v_product.archive_id <> v_session.archive_id THEN
    RAISE EXCEPTION 'Il prodotto appartiene a un altro archivio Danea';
  END IF;

  IF NEW.unit_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.units_of_measure u WHERE u.id = NEW.unit_id AND u.company_id = NEW.company_id) THEN
      RAISE EXCEPTION 'U.M. non valida per questa azienda';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_inventory_count() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER inventory_counts_validate BEFORE INSERT OR UPDATE ON public.inventory_counts
  FOR EACH ROW EXECUTE FUNCTION public.validate_inventory_count();

CREATE OR REPLACE FUNCTION public.validate_inventory_adjustment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inventory_locations l WHERE l.id = NEW.location_id AND l.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'Ubicazione non valida per questa azienda';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = NEW.product_id AND p.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'Prodotto non valido per questa azienda';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_inventory_adjustment() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER inventory_adjustments_validate BEFORE INSERT ON public.inventory_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.validate_inventory_adjustment();

-- ============ Giacenza: unica fonte di verità ============
-- Ultimo conteggio valido (sessione completata) + rettifiche successive a quel conteggio.
CREATE OR REPLACE FUNCTION public.inventory_location_stock(_product_id uuid, _location_id uuid)
RETURNS TABLE (has_count boolean, quantity numeric, counted_at timestamptz, counted_by uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH last_count AS (
    SELECT c.counted_quantity, c.counted_at, c.counted_by
    FROM public.inventory_counts c
    JOIN public.inventory_sessions s ON s.id = c.session_id
    WHERE c.product_id = _product_id
      AND c.location_id = _location_id
      AND s.status = 'completata'
    ORDER BY c.counted_at DESC, c.id DESC
    LIMIT 1
  )
  SELECT
    EXISTS (SELECT 1 FROM last_count),
    CASE WHEN EXISTS (SELECT 1 FROM last_count)
      THEN (SELECT counted_quantity FROM last_count)
           + COALESCE((
               SELECT sum(a.quantity) FROM public.inventory_adjustments a
               WHERE a.product_id = _product_id AND a.location_id = _location_id
                 AND a.created_at >= (SELECT counted_at FROM last_count)
             ), 0)
      ELSE 0
    END,
    (SELECT counted_at FROM last_count),
    (SELECT counted_by FROM last_count);
$$;
GRANT EXECUTE ON FUNCTION public.inventory_location_stock(uuid, uuid) TO authenticated;

-- Fabbisogno: unico punto di calcolo.
CREATE OR REPLACE FUNCTION public.compute_purchase_need(
  _needed numeric,
  _min_stock numeric,
  _available numeric,
  _order_multiple numeric DEFAULT NULL
)
RETURNS TABLE (raw_need numeric, suggested numeric, rounded boolean)
LANGUAGE sql
IMMUTABLE
AS $$
  WITH base AS (
    SELECT greatest(0, COALESCE(_needed, 0) + COALESCE(_min_stock, 0) - COALESCE(_available, 0)) AS raw_need
  )
  SELECT
    b.raw_need,
    CASE
      WHEN b.raw_need = 0 THEN 0
      WHEN _order_multiple IS NULL OR _order_multiple <= 0 THEN b.raw_need
      ELSE ceil(b.raw_need / _order_multiple) * _order_multiple
    END,
    CASE
      WHEN b.raw_need = 0 OR _order_multiple IS NULL OR _order_multiple <= 0 THEN false
      ELSE ceil(b.raw_need / _order_multiple) * _order_multiple <> b.raw_need
    END
  FROM base b;
$$;
GRANT EXECUTE ON FUNCTION public.compute_purchase_need(numeric, numeric, numeric, numeric) TO authenticated;

-- Giacenza per ubicazione e complessiva di un prodotto, con stato di conteggio.
CREATE OR REPLACE FUNCTION public.product_stock_overview(_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_locations jsonb;
  v_total numeric := 0;
  v_counted integer := 0;
  v_total_locations integer := 0;
  v_settings public.product_stock_settings;
BEGIN
  SELECT company_id INTO v_company FROM public.products WHERE id = _product_id;
  IF v_company IS NULL OR NOT public.is_company_member(v_company) THEN
    RETURN jsonb_build_object('locations', '[]'::jsonb, 'total', 0, 'status', 'mai_contato');
  END IF;

  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'location_id', l.id,
      'location_name', l.name,
      'is_default', l.is_default,
      'has_count', s.has_count,
      'quantity', s.quantity,
      'counted_at', s.counted_at,
      'counted_by', s.counted_by
    ) ORDER BY l.is_default DESC, l.name), '[]'::jsonb),
    COALESCE(sum(CASE WHEN s.has_count THEN s.quantity ELSE 0 END), 0),
    count(*) FILTER (WHERE s.has_count),
    count(*)
  INTO v_locations, v_total, v_counted, v_total_locations
  FROM public.inventory_locations l
  CROSS JOIN LATERAL public.inventory_location_stock(_product_id, l.id) s
  WHERE l.company_id = v_company AND l.status = 'attivo';

  SELECT * INTO v_settings FROM public.product_stock_settings WHERE product_id = _product_id;

  RETURN jsonb_build_object(
    'locations', v_locations,
    'total', v_total,
    'counted_locations', v_counted,
    'total_locations', v_total_locations,
    'status', CASE WHEN v_counted = 0 THEN 'mai_contato'
                   WHEN v_counted < v_total_locations THEN 'parziale'
                   ELSE 'completo' END,
    'min_stock', v_settings.min_stock,
    'order_multiple', v_settings.order_multiple,
    'stock_unit_id', v_settings.stock_unit_id,
    'coverage_days', v_settings.coverage_days
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.product_stock_overview(uuid) TO authenticated;

-- Vista fabbisogno dell'archivio: disponibile, scorta minima, necessario (per ora manuale), fabbisogno.
CREATE OR REPLACE FUNCTION public.inventory_requirements(
  _company_id uuid,
  _archive_id uuid,
  _needs jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  product_id uuid,
  code text,
  description text,
  danea_um text,
  available numeric,
  counted_locations integer,
  total_locations integer,
  count_status text,
  min_stock numeric,
  order_multiple numeric,
  needed numeric,
  raw_need numeric,
  suggested numeric,
  rounded boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;

  RETURN QUERY
  WITH locs AS (
    SELECT l.id FROM public.inventory_locations l
    WHERE l.company_id = _company_id AND l.status = 'attivo'
  ),
  stock AS (
    SELECT p.id AS product_id,
           COALESCE(sum(CASE WHEN s.has_count THEN s.quantity ELSE 0 END), 0) AS available,
           COALESCE(count(*) FILTER (WHERE s.has_count), 0) AS counted_locations,
           COALESCE(count(s.*), 0) AS total_locations
    FROM public.products p
    LEFT JOIN locs l ON true
    LEFT JOIN LATERAL public.inventory_location_stock(p.id, l.id) s ON true
    WHERE p.company_id = _company_id AND p.archive_id = _archive_id
    GROUP BY p.id
  )
  SELECT
    p.id,
    p.code,
    p.description,
    p.danea_um,
    st.available,
    st.counted_locations::integer,
    st.total_locations::integer,
    CASE WHEN st.counted_locations = 0 THEN 'mai_contato'
         WHEN st.counted_locations < st.total_locations THEN 'parziale'
         ELSE 'completo' END,
    ss.min_stock,
    ss.order_multiple,
    COALESCE((_needs ->> p.id::text)::numeric, 0),
    n.raw_need,
    n.suggested,
    n.rounded
  FROM public.products p
  JOIN stock st ON st.product_id = p.id
  LEFT JOIN public.product_stock_settings ss ON ss.product_id = p.id
  CROSS JOIN LATERAL public.compute_purchase_need(
    COALESCE((_needs ->> p.id::text)::numeric, 0),
    ss.min_stock,
    st.available,
    ss.order_multiple
  ) n
  WHERE p.company_id = _company_id AND p.archive_id = _archive_id
  ORDER BY p.code;
END;
$$;
GRANT EXECUTE ON FUNCTION public.inventory_requirements(uuid, uuid, jsonb) TO authenticated;

-- ============ Operazioni protette ============
CREATE OR REPLACE FUNCTION public.ensure_default_inventory_location(_company_id uuid, _actor_user_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.inventory_locations
  WHERE company_id = _company_id AND is_default AND status = 'attivo';
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.inventory_locations (company_id, name, is_default, created_by)
  VALUES (_company_id, 'Magazzino', true, _actor_user_id)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.inventory_locations
    WHERE company_id = _company_id ORDER BY created_at LIMIT 1;
  END IF;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_default_inventory_location(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.manage_inventory_location(
  _company_id uuid,
  _action text,
  _location_id uuid DEFAULT NULL,
  _name text DEFAULT NULL,
  _code text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _is_default boolean DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := _location_id;
BEGIN
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;

  IF _action = 'create' THEN
    IF _name IS NULL OR length(btrim(_name)) = 0 THEN RAISE EXCEPTION 'Nome ubicazione obbligatorio'; END IF;
    INSERT INTO public.inventory_locations (company_id, name, code, notes, created_by, is_default)
    VALUES (_company_id, btrim(_name), _code, _notes, _actor_user_id,
            COALESCE(_is_default, NOT EXISTS (SELECT 1 FROM public.inventory_locations WHERE company_id = _company_id)))
    RETURNING id INTO v_id;
  ELSIF _action IN ('update', 'activate', 'deactivate', 'set_default') THEN
    IF v_id IS NULL THEN RAISE EXCEPTION 'Ubicazione non indicata'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.inventory_locations WHERE id = v_id AND company_id = _company_id) THEN
      RAISE EXCEPTION 'Ubicazione non trovata';
    END IF;
    IF _action = 'update' THEN
      UPDATE public.inventory_locations
      SET name = COALESCE(NULLIF(btrim(_name), ''), name), code = COALESCE(_code, code), notes = COALESCE(_notes, notes)
      WHERE id = v_id;
    ELSIF _action = 'activate' THEN
      UPDATE public.inventory_locations SET status = 'attivo' WHERE id = v_id;
    ELSIF _action = 'deactivate' THEN
      IF EXISTS (SELECT 1 FROM public.inventory_locations WHERE id = v_id AND is_default) THEN
        RAISE EXCEPTION 'L''ubicazione predefinita non può essere disattivata';
      END IF;
      UPDATE public.inventory_locations SET status = 'disattivato' WHERE id = v_id;
    ELSE
      UPDATE public.inventory_locations SET is_default = false WHERE company_id = _company_id AND is_default;
      UPDATE public.inventory_locations SET is_default = true, status = 'attivo' WHERE id = v_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Azione non riconosciuta: %', _action;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, _actor_user_id, 'inventory_location_' || _action, 'inventory_location', v_id,
          jsonb_build_object('name', _name));
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.manage_inventory_location(uuid, text, uuid, text, text, text, boolean, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.manage_product_stock_settings(
  _company_id uuid,
  _product_ids uuid[],
  _min_stock numeric DEFAULT NULL,
  _order_multiple numeric DEFAULT NULL,
  _stock_unit_id uuid DEFAULT NULL,
  _coverage_days integer DEFAULT NULL,
  _perishability text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _clear_fields text[] DEFAULT '{}',
  _actor_user_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product uuid;
  v_changed integer := 0;
BEGIN
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;
  IF _order_multiple IS NOT NULL AND _order_multiple <= 0 THEN
    RAISE EXCEPTION 'Il multiplo di riordino deve essere maggiore di zero';
  END IF;
  IF _min_stock IS NOT NULL AND _min_stock < 0 THEN
    RAISE EXCEPTION 'La scorta minima non può essere negativa';
  END IF;
  IF _stock_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.units_of_measure WHERE id = _stock_unit_id AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'U.M. non valida per questa azienda';
  END IF;

  FOREACH v_product IN ARRAY _product_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_product AND company_id = _company_id) THEN
      RAISE EXCEPTION 'Prodotto non valido per questa azienda';
    END IF;

    INSERT INTO public.product_stock_settings (company_id, product_id, min_stock, order_multiple, stock_unit_id, coverage_days, perishability, notes, created_by, updated_by)
    VALUES (_company_id, v_product, _min_stock, _order_multiple, _stock_unit_id, _coverage_days, _perishability, _notes, _actor_user_id, _actor_user_id)
    ON CONFLICT (company_id, product_id) DO UPDATE SET
      min_stock = CASE WHEN 'min_stock' = ANY(_clear_fields) THEN NULL ELSE COALESCE(EXCLUDED.min_stock, public.product_stock_settings.min_stock) END,
      order_multiple = CASE WHEN 'order_multiple' = ANY(_clear_fields) THEN NULL ELSE COALESCE(EXCLUDED.order_multiple, public.product_stock_settings.order_multiple) END,
      stock_unit_id = CASE WHEN 'stock_unit_id' = ANY(_clear_fields) THEN NULL ELSE COALESCE(EXCLUDED.stock_unit_id, public.product_stock_settings.stock_unit_id) END,
      coverage_days = CASE WHEN 'coverage_days' = ANY(_clear_fields) THEN NULL ELSE COALESCE(EXCLUDED.coverage_days, public.product_stock_settings.coverage_days) END,
      perishability = CASE WHEN 'perishability' = ANY(_clear_fields) THEN NULL ELSE COALESCE(EXCLUDED.perishability, public.product_stock_settings.perishability) END,
      notes = CASE WHEN 'notes' = ANY(_clear_fields) THEN NULL ELSE COALESCE(EXCLUDED.notes, public.product_stock_settings.notes) END,
      updated_by = _actor_user_id;
    v_changed := v_changed + 1;
  END LOOP;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, _actor_user_id, 'product_stock_settings_set', 'product', NULL,
          jsonb_build_object('products', v_changed, 'min_stock', _min_stock, 'order_multiple', _order_multiple));
  RETURN v_changed;
END;
$$;
GRANT EXECUTE ON FUNCTION public.manage_product_stock_settings(uuid, uuid[], numeric, numeric, uuid, integer, text, text, text[], uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.manage_inventory_session(
  _company_id uuid,
  _action text,
  _session_id uuid DEFAULT NULL,
  _archive_id uuid DEFAULT NULL,
  _name text DEFAULT NULL,
  _scope public.inventory_session_scope DEFAULT 'generale',
  _location_id uuid DEFAULT NULL,
  _notes text DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := _session_id;
  v_status public.inventory_session_status;
BEGIN
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;

  IF _action = 'open' THEN
    IF _archive_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.danea_archives WHERE id = _archive_id AND company_id = _company_id
    ) THEN
      RAISE EXCEPTION 'Archivio Danea non valido';
    END IF;
    IF _scope = 'ubicazione' THEN
      IF _location_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.inventory_locations WHERE id = _location_id AND company_id = _company_id AND status = 'attivo'
      ) THEN
        RAISE EXCEPTION 'Ubicazione non valida';
      END IF;
    END IF;
    INSERT INTO public.inventory_sessions (company_id, archive_id, name, scope, location_id, notes, created_by)
    VALUES (_company_id, _archive_id, COALESCE(NULLIF(btrim(_name), ''), 'Inventario ' || to_char(now(), 'DD/MM/YYYY')),
            _scope, CASE WHEN _scope = 'ubicazione' THEN _location_id ELSE NULL END, _notes, _actor_user_id)
    RETURNING id INTO v_id;
  ELSE
    IF v_id IS NULL THEN RAISE EXCEPTION 'Sessione non indicata'; END IF;
    SELECT status INTO v_status FROM public.inventory_sessions WHERE id = v_id AND company_id = _company_id;
    IF v_status IS NULL THEN RAISE EXCEPTION 'Sessione non trovata'; END IF;

    IF _action = 'rename' THEN
      IF v_status <> 'in_corso' THEN RAISE EXCEPTION 'La sessione è chiusa e non è modificabile'; END IF;
      UPDATE public.inventory_sessions
      SET name = COALESCE(NULLIF(btrim(_name), ''), name), notes = COALESCE(_notes, notes)
      WHERE id = v_id;
    ELSIF _action = 'close' THEN
      IF v_status <> 'in_corso' THEN RAISE EXCEPTION 'La sessione è già chiusa'; END IF;
      UPDATE public.inventory_sessions SET status = 'completata', finished_at = now() WHERE id = v_id;
    ELSIF _action = 'cancel' THEN
      IF v_status = 'completata' THEN RAISE EXCEPTION 'Una sessione completata non può essere annullata'; END IF;
      UPDATE public.inventory_sessions SET status = 'annullata', finished_at = now() WHERE id = v_id;
    ELSE
      RAISE EXCEPTION 'Azione non riconosciuta: %', _action;
    END IF;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, _actor_user_id, 'inventory_session_' || _action, 'inventory_session', v_id,
          jsonb_build_object('scope', _scope, 'location_id', _location_id));
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.manage_inventory_session(uuid, text, uuid, uuid, text, public.inventory_session_scope, uuid, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_inventory_count(
  _company_id uuid,
  _session_id uuid,
  _product_id uuid,
  _location_id uuid,
  _counted_quantity numeric,
  _unit_id uuid DEFAULT NULL,
  _unit_code text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_previous numeric;
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  IF _counted_quantity IS NULL OR _counted_quantity < 0 THEN
    RAISE EXCEPTION 'Quantità contata non valida';
  END IF;

  SELECT quantity INTO v_previous FROM public.inventory_location_stock(_product_id, _location_id);

  INSERT INTO public.inventory_counts (
    company_id, session_id, product_id, location_id, counted_quantity, unit_id, unit_code,
    previous_quantity, counted_at, counted_by, notes
  )
  VALUES (_company_id, _session_id, _product_id, _location_id, _counted_quantity, _unit_id, _unit_code,
          COALESCE(v_previous, 0), now(), _actor_user_id, _notes)
  ON CONFLICT (session_id, product_id, location_id) DO UPDATE SET
    counted_quantity = EXCLUDED.counted_quantity,
    unit_id = EXCLUDED.unit_id,
    unit_code = EXCLUDED.unit_code,
    counted_at = now(),
    counted_by = EXCLUDED.counted_by,
    notes = EXCLUDED.notes
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_inventory_count(uuid, uuid, uuid, uuid, numeric, uuid, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_inventory_adjustment(
  _company_id uuid,
  _product_id uuid,
  _location_id uuid,
  _quantity numeric,
  _reason text,
  _notes text DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;
  IF _quantity IS NULL OR _quantity = 0 THEN
    RAISE EXCEPTION 'La rettifica deve avere una quantità diversa da zero';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) = 0 THEN
    RAISE EXCEPTION 'Il motivo della rettifica è obbligatorio';
  END IF;

  INSERT INTO public.inventory_adjustments (company_id, product_id, location_id, quantity, reason, notes, created_by)
  VALUES (_company_id, _product_id, _location_id, _quantity, btrim(_reason), _notes, _actor_user_id)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, _actor_user_id, 'inventory_adjustment', 'product', _product_id,
          jsonb_build_object('location_id', _location_id, 'quantity', _quantity, 'reason', btrim(_reason)));
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_inventory_adjustment(uuid, uuid, uuid, numeric, text, text, uuid) TO authenticated;
-- 1. Snapshot dei prodotti previsti nella sessione di inventario
CREATE TABLE public.inventory_session_products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  session_id uuid NOT NULL REFERENCES public.inventory_sessions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.inventory_locations(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.inventory_session_products TO authenticated;
GRANT ALL ON public.inventory_session_products TO service_role;

ALTER TABLE public.inventory_session_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_session_products_select" ON public.inventory_session_products
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE UNIQUE INDEX inventory_session_products_key
  ON public.inventory_session_products (session_id, product_id, location_id);
CREATE INDEX inventory_session_products_session_idx
  ON public.inventory_session_products (session_id, location_id);

-- 2. Preferiti aziendali sui propri prodotti (condivisi fra gli operatori)
CREATE TABLE public.company_product_favorites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (company_id, product_id)
);

GRANT SELECT ON public.company_product_favorites TO authenticated;
GRANT ALL ON public.company_product_favorites TO service_role;

ALTER TABLE public.company_product_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_product_favorites_select" ON public.company_product_favorites
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

-- 3. Gestione preferiti aziendali (solo amministratori)
CREATE OR REPLACE FUNCTION public.manage_company_product_favorite(
  _company_id uuid,
  _product_id uuid,
  _favorite boolean,
  _actor_user_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _product_id AND company_id = _company_id) THEN
    RAISE EXCEPTION 'Prodotto non valido per questa azienda';
  END IF;

  IF _favorite THEN
    INSERT INTO public.company_product_favorites (company_id, product_id, created_by)
    VALUES (_company_id, _product_id, _actor_user_id)
    ON CONFLICT (company_id, product_id) DO NOTHING;
  ELSE
    DELETE FROM public.company_product_favorites
    WHERE company_id = _company_id AND product_id = _product_id;
  END IF;

  RETURN _favorite;
END;
$$;

-- 4. Avvio o ripresa dell'inventario generale, con snapshot fisso prodotto+zona
CREATE OR REPLACE FUNCTION public.start_general_inventory(
  _company_id uuid,
  _archive_id uuid,
  _name text DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_default uuid;
BEGIN
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Solo un amministratore può avviare un inventario';
  END IF;
  IF _archive_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.danea_archives WHERE id = _archive_id AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Archivio Danea non valido';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('general_inventory:' || _company_id::text || ':' || _archive_id::text, 0));

  SELECT id INTO v_id
  FROM public.inventory_sessions
  WHERE company_id = _company_id AND archive_id = _archive_id
    AND scope = 'generale' AND status = 'in_corso'
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.inventory_sessions (company_id, archive_id, name, scope, location_id, created_by)
    VALUES (_company_id, _archive_id,
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

  WITH archive_products AS (
    SELECT p.id
    FROM public.products p
    WHERE p.company_id = _company_id AND p.archive_id = _archive_id
      AND p.publish_status = 'pubblicato'
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
    JOIN archive_products ap ON ap.id = pr.product_id
    JOIN active_locations al ON al.id = pr.location_id
  ), fallback AS (
    SELECT ap.id AS product_id, v_default AS location_id
    FROM archive_products ap
    WHERE NOT EXISTS (SELECT 1 FROM known k WHERE k.product_id = ap.id)
  )
  INSERT INTO public.inventory_session_products (company_id, session_id, product_id, location_id)
  SELECT _company_id, v_id, product_id, location_id FROM known
  UNION
  SELECT _company_id, v_id, product_id, location_id FROM fallback
  ON CONFLICT (session_id, product_id, location_id) DO NOTHING;

  RETURN v_id;
END;
$$;

-- 5. Avanzamento dell'inventario: generale e per zona / categoria / sottocategoria
CREATE OR REPLACE FUNCTION public.inventory_session_progress(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.inventory_sessions;
  v_result jsonb;
BEGIN
  SELECT * INTO v_session FROM public.inventory_sessions WHERE id = _session_id;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Sessione di inventario inesistente';
  END IF;
  IF NOT public.is_company_member(v_session.company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;

  WITH rows AS (
    SELECT sp.product_id, sp.location_id, l.name AS location_name, l.code AS location_code,
           p.category, p.subcategory,
           c.id AS count_id, c.counted_quantity, c.previous_quantity, c.difference
    FROM public.inventory_session_products sp
    JOIN public.inventory_locations l ON l.id = sp.location_id
    JOIN public.products p ON p.id = sp.product_id
    LEFT JOIN public.inventory_counts c
      ON c.session_id = sp.session_id AND c.product_id = sp.product_id AND c.location_id = sp.location_id
    WHERE sp.session_id = _session_id
  )
  SELECT jsonb_build_object(
    'session_id', v_session.id,
    'session_name', v_session.name,
    'status', v_session.status,
    'started_at', v_session.started_at,
    'finished_at', v_session.finished_at,
    'total', (SELECT count(*) FROM rows),
    'completed', (SELECT count(*) FROM rows WHERE count_id IS NOT NULL),
    'differences', (SELECT count(*) FROM rows WHERE count_id IS NOT NULL AND COALESCE(difference, 0) <> 0),
    'unchanged', (SELECT count(*) FROM rows WHERE count_id IS NOT NULL AND COALESCE(difference, 0) = 0),
    'pending', (SELECT count(*) FROM rows WHERE count_id IS NULL),
    'zones', COALESCE((
      SELECT jsonb_agg(z ORDER BY z->>'name')
      FROM (
        SELECT jsonb_build_object(
          'location_id', location_id, 'name', location_name, 'code', location_code,
          'total', count(*), 'completed', count(count_id),
          'differences', count(*) FILTER (WHERE count_id IS NOT NULL AND COALESCE(difference, 0) <> 0)
        ) AS z
        FROM rows GROUP BY location_id, location_name, location_code
      ) q
    ), '[]'::jsonb),
    'categories', COALESCE((
      SELECT jsonb_agg(c ORDER BY c->>'name')
      FROM (
        SELECT jsonb_build_object(
          'name', COALESCE(NULLIF(btrim(category), ''), 'Senza categoria'),
          'total', count(*), 'completed', count(count_id)
        ) AS c
        FROM rows GROUP BY COALESCE(NULLIF(btrim(category), ''), 'Senza categoria')
      ) q
    ), '[]'::jsonb),
    'subcategories', COALESCE((
      SELECT jsonb_agg(s ORDER BY s->>'category', s->>'name')
      FROM (
        SELECT jsonb_build_object(
          'category', COALESCE(NULLIF(btrim(category), ''), 'Senza categoria'),
          'name', COALESCE(NULLIF(btrim(subcategory), ''), 'Senza sottocategoria'),
          'total', count(*), 'completed', count(count_id)
        ) AS s
        FROM rows
        GROUP BY COALESCE(NULLIF(btrim(category), ''), 'Senza categoria'),
                 COALESCE(NULLIF(btrim(subcategory), ''), 'Senza sottocategoria')
      ) q
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 6. Righe da contare con giacenza calcolata (formula esistente) e conteggio della sessione
CREATE OR REPLACE FUNCTION public.inventory_session_rows(
  _session_id uuid,
  _location_id uuid DEFAULT NULL,
  _category text DEFAULT NULL,
  _subcategory text DEFAULT NULL,
  _search text DEFAULT NULL,
  _favorites_only boolean DEFAULT false,
  _limit integer DEFAULT 300
) RETURNS TABLE (
  product_id uuid,
  location_id uuid,
  location_name text,
  code text,
  description text,
  danea_um text,
  category text,
  subcategory text,
  is_favorite boolean,
  image_path text,
  thumbnail_path text,
  calculated numeric,
  counted numeric,
  difference numeric,
  counted_at timestamp with time zone,
  counted_by uuid,
  note text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.inventory_sessions;
  v_term text := NULLIF(btrim(COALESCE(_search, '')), '');
BEGIN
  SELECT * INTO v_session FROM public.inventory_sessions WHERE id = _session_id;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Sessione di inventario inesistente';
  END IF;
  IF NOT public.is_company_member(v_session.company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;

  RETURN QUERY
  SELECT
    sp.product_id,
    sp.location_id,
    l.name,
    p.code,
    p.description,
    p.danea_um,
    p.category,
    p.subcategory,
    f.product_id IS NOT NULL,
    img.image_path,
    img.thumbnail_path,
    COALESCE(st.quantity, 0),
    c.counted_quantity,
    c.difference,
    c.counted_at,
    c.counted_by,
    c.notes
  FROM public.inventory_session_products sp
  JOIN public.inventory_locations l ON l.id = sp.location_id
  JOIN public.products p ON p.id = sp.product_id
  LEFT JOIN public.company_product_favorites f
    ON f.company_id = sp.company_id AND f.product_id = sp.product_id
  LEFT JOIN public.product_images img ON img.product_id = sp.product_id
  LEFT JOIN public.inventory_counts c
    ON c.session_id = sp.session_id AND c.product_id = sp.product_id AND c.location_id = sp.location_id
  LEFT JOIN LATERAL public.inventory_location_stock(sp.product_id, sp.location_id) st ON true
  WHERE sp.session_id = _session_id
    AND (_location_id IS NULL OR sp.location_id = _location_id)
    AND (_category IS NULL OR COALESCE(NULLIF(btrim(p.category), ''), 'Senza categoria') = _category)
    AND (_subcategory IS NULL OR COALESCE(NULLIF(btrim(p.subcategory), ''), 'Senza sottocategoria') = _subcategory)
    AND (NOT _favorites_only OR f.product_id IS NOT NULL)
    AND (v_term IS NULL OR p.code ILIKE '%' || v_term || '%' OR p.description ILIKE '%' || v_term || '%')
  ORDER BY p.description NULLS LAST, p.code
  LIMIT GREATEST(COALESCE(_limit, 300), 1);
END;
$$;

-- 7. Chiusura dell'inventario generale con riepilogo (solo amministratori, idempotente)
CREATE OR REPLACE FUNCTION public.close_general_inventory(
  _company_id uuid,
  _session_id uuid,
  _actor_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.inventory_sessions;
  v_total integer;
  v_completed integer;
  v_differences integer;
  v_already boolean := false;
BEGIN
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Solo un amministratore può chiudere l''inventario';
  END IF;

  SELECT * INTO v_session FROM public.inventory_sessions
  WHERE id = _session_id AND company_id = _company_id
  FOR UPDATE;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Sessione di inventario non trovata';
  END IF;

  SELECT count(*), count(c.id), count(c.id) FILTER (WHERE COALESCE(c.difference, 0) <> 0)
  INTO v_total, v_completed, v_differences
  FROM public.inventory_session_products sp
  LEFT JOIN public.inventory_counts c
    ON c.session_id = sp.session_id AND c.product_id = sp.product_id AND c.location_id = sp.location_id
  WHERE sp.session_id = _session_id;

  IF v_session.status = 'completata' THEN
    v_already := true;
  ELSIF v_session.status <> 'in_corso' THEN
    RAISE EXCEPTION 'La sessione è stata annullata e non può essere chiusa';
  ELSE
    IF v_completed < v_total THEN
      RAISE EXCEPTION 'Mancano ancora % prodotti da controllare', v_total - v_completed;
    END IF;
    UPDATE public.inventory_sessions
    SET status = 'completata', finished_at = now()
    WHERE id = _session_id;

    INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
    VALUES (_company_id, _actor_user_id, 'inventory_session_close', 'inventory_session', _session_id,
            jsonb_build_object('total', v_total, 'differences', v_differences));
  END IF;

  RETURN jsonb_build_object(
    'session_id', _session_id,
    'already_closed', v_already,
    'total', v_total,
    'completed', v_completed,
    'differences', v_differences,
    'unchanged', v_completed - v_differences
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.manage_company_product_favorite(uuid, uuid, boolean, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_general_inventory(uuid, uuid, text, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inventory_session_progress(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inventory_session_rows(uuid, uuid, text, text, text, boolean, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_general_inventory(uuid, uuid, uuid) FROM anon, PUBLIC;
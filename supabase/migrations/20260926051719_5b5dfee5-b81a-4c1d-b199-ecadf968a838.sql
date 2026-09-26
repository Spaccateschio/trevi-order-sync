DROP FUNCTION IF EXISTS public.inventory_session_rows(uuid,uuid,text,text,text,boolean,integer);
DROP FUNCTION IF EXISTS public.inventory_requirements(uuid,uuid,jsonb);

-- 1) Righe sessione: espone la U.M. registrata e annulla la differenza se le U.M. non sono confrontabili
CREATE OR REPLACE FUNCTION public.inventory_session_rows(_session_id uuid, _location_id uuid DEFAULT NULL::uuid, _category text DEFAULT NULL::text, _subcategory text DEFAULT NULL::text, _search text DEFAULT NULL::text, _favorites_only boolean DEFAULT false, _limit integer DEFAULT 300)
 RETURNS TABLE(product_id uuid, location_id uuid, location_name text, code text, description text, danea_um text, category text, subcategory text, is_favorite boolean, image_path text, thumbnail_path text, calculated numeric, counted numeric, difference numeric, counted_at timestamp with time zone, counted_by uuid, note text, recount_requested_at timestamp with time zone, non_compliant boolean, non_compliant_quantity numeric, non_compliant_note text, proposal_status text, proposal_flagged_at timestamp with time zone, min_stock numeric, order_multiple numeric, counted_unit_code text, units_comparable boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    CASE
      WHEN c.counted_quantity IS NULL THEN NULL
      WHEN NULLIF(btrim(COALESCE(c.unit_code, '')), '') IS NULL THEN c.difference
      WHEN NULLIF(btrim(COALESCE(p.danea_um, '')), '') IS NULL THEN c.difference
      WHEN lower(btrim(c.unit_code)) = lower(btrim(p.danea_um)) THEN c.difference
      ELSE NULL
    END,
    c.counted_at,
    c.counted_by,
    c.notes,
    c.recount_requested_at,
    COALESCE(c.non_compliant, false),
    c.non_compliant_quantity,
    c.non_compliant_note,
    pr.status,
    pr.last_flagged_at,
    ss.min_stock,
    ss.order_multiple,
    NULLIF(btrim(COALESCE(c.unit_code, '')), ''),
    CASE
      WHEN c.counted_quantity IS NULL THEN NULL
      WHEN NULLIF(btrim(COALESCE(c.unit_code, '')), '') IS NULL THEN true
      WHEN NULLIF(btrim(COALESCE(p.danea_um, '')), '') IS NULL THEN true
      ELSE lower(btrim(c.unit_code)) = lower(btrim(p.danea_um))
    END
  FROM public.inventory_session_products sp
  JOIN public.inventory_locations l ON l.id = sp.location_id
  JOIN public.products p ON p.id = sp.product_id
  LEFT JOIN public.company_product_favorites f
    ON f.company_id = sp.company_id AND f.product_id = sp.product_id
  LEFT JOIN public.product_images img ON img.product_id = sp.product_id
  LEFT JOIN public.inventory_counts c
    ON c.session_id = sp.session_id AND c.product_id = sp.product_id AND c.location_id = sp.location_id
  LEFT JOIN public.product_purchase_proposals pr
    ON pr.company_id = sp.company_id AND pr.product_id = sp.product_id AND pr.status = 'aperta'
  LEFT JOIN public.product_stock_settings ss
    ON ss.company_id = sp.company_id AND ss.product_id = sp.product_id
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
$function$;

-- 2) U.M. ammissibili per il conteggio: unione deduplicata delle U.M. gia configurate sul prodotto
CREATE OR REPLACE FUNCTION public.product_count_units(_company_id uuid, _product_ids uuid[])
 RETURNS TABLE(product_id uuid, unit_code text, unit_label text, is_base boolean, sources text[], conversion_factor numeric, conversion_reference_um text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;

  RETURN QUERY
  WITH wanted AS (
    SELECT p.id, NULLIF(btrim(COALESCE(p.danea_um, '')), '') AS base_um
    FROM public.products p
    WHERE p.company_id = _company_id
      AND p.id = ANY(COALESCE(_product_ids, ARRAY[]::uuid[]))
  ),
  base AS (
    SELECT w.id AS product_id, w.base_um AS unit_code, w.base_um AS unit_label,
           true AS is_base, 'base'::text AS source,
           NULL::numeric AS conversion_factor, NULL::text AS conversion_reference_um
    FROM wanted w
    WHERE w.base_um IS NOT NULL
  ),
  sale AS (
    SELECT w.id AS product_id, NULLIF(btrim(u.code), '') AS unit_code, u.description AS unit_label,
           false AS is_base, 'vendita'::text AS source,
           su.conversion_factor, su.conversion_reference_um
    FROM wanted w
    JOIN public.product_sale_units su ON su.product_id = w.id AND su.company_id = _company_id AND su.is_active
    JOIN public.units_of_measure u ON u.id = su.unit_id AND u.status = 'attivo'
  ),
  purchase_units AS (
    SELECT w.id AS product_id, NULLIF(btrim(u.code), '') AS unit_code, u.description AS unit_label,
           false AS is_base, 'acquisto'::text AS source,
           lu.conversion_factor, NULL::text AS conversion_reference_um
    FROM wanted w
    JOIN public.product_supplier_links pl ON pl.product_id = w.id AND pl.company_id = _company_id AND pl.is_active
    JOIN public.product_supplier_link_units lu ON lu.link_id = pl.id AND lu.company_id = _company_id AND lu.is_active
    JOIN public.units_of_measure u ON u.id = lu.unit_id AND u.status = 'attivo'
  ),
  purchase_default AS (
    SELECT w.id AS product_id, NULLIF(btrim(u.code), '') AS unit_code, u.description AS unit_label,
           false AS is_base, 'acquisto'::text AS source,
           NULL::numeric AS conversion_factor, NULL::text AS conversion_reference_um
    FROM wanted w
    JOIN public.product_supplier_links pl ON pl.product_id = w.id AND pl.company_id = _company_id AND pl.is_active
    JOIN public.units_of_measure u ON u.id = pl.purchase_unit_id AND u.status = 'attivo'
  ),
  stock_unit AS (
    SELECT w.id AS product_id, NULLIF(btrim(u.code), '') AS unit_code, u.description AS unit_label,
           false AS is_base, 'scorta'::text AS source,
           NULL::numeric AS conversion_factor, NULL::text AS conversion_reference_um
    FROM wanted w
    JOIN public.product_stock_settings ss ON ss.product_id = w.id AND ss.company_id = _company_id
    JOIN public.units_of_measure u ON u.id = ss.stock_unit_id AND u.status = 'attivo'
  ),
  merged AS (
    SELECT * FROM base
    UNION ALL SELECT * FROM sale
    UNION ALL SELECT * FROM purchase_units
    UNION ALL SELECT * FROM purchase_default
    UNION ALL SELECT * FROM stock_unit
  )
  SELECT
    m.product_id,
    lower(m.unit_code) AS unit_code,
    (array_agg(m.unit_label ORDER BY m.is_base DESC))[1] AS unit_label,
    bool_or(m.is_base) AS is_base,
    array_agg(DISTINCT m.source) AS sources,
    (array_agg(m.conversion_factor ORDER BY m.conversion_factor NULLS LAST))[1] AS conversion_factor,
    (array_agg(m.conversion_reference_um ORDER BY m.conversion_reference_um NULLS LAST))[1] AS conversion_reference_um
  FROM merged m
  WHERE m.unit_code IS NOT NULL
  GROUP BY m.product_id, lower(m.unit_code)
  ORDER BY m.product_id, bool_or(m.is_base) DESC, lower(m.unit_code);
END;
$function$;

-- 3) Fabbisogno: riferimento informativo all'ultimo conteggio (quantita + U.M.), formule invariate
CREATE OR REPLACE FUNCTION public.inventory_requirements(_company_id uuid, _archive_id uuid, _needs jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(product_id uuid, code text, description text, danea_um text, available numeric, counted_locations integer, total_locations integer, count_status text, min_stock numeric, order_multiple numeric, needed numeric, raw_need numeric, suggested numeric, rounded boolean, last_count_quantity numeric, last_count_unit_code text, last_count_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    n.rounded,
    lc.counted_quantity,
    NULLIF(btrim(COALESCE(lc.unit_code, '')), ''),
    lc.counted_at
  FROM public.products p
  JOIN stock st ON st.product_id = p.id
  LEFT JOIN public.product_stock_settings ss ON ss.product_id = p.id
  LEFT JOIN LATERAL (
    SELECT c.counted_quantity, c.unit_code, c.counted_at
    FROM public.inventory_counts c
    WHERE c.company_id = _company_id AND c.product_id = p.id AND c.counted_at IS NOT NULL
    ORDER BY c.counted_at DESC
    LIMIT 1
  ) lc ON true
  CROSS JOIN LATERAL public.compute_purchase_need(
    COALESCE((_needs ->> p.id::text)::numeric, 0),
    ss.min_stock,
    st.available,
    ss.order_multiple
  ) n
  WHERE p.company_id = _company_id AND p.archive_id = _archive_id
  ORDER BY p.code;
END;
$function$;
CREATE OR REPLACE FUNCTION public.inventory_session_progress(_session_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_session public.inventory_sessions;
  v_result jsonb;
BEGIN
  SELECT * INTO v_session FROM public.inventory_sessions WHERE id = _session_id;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Sessione di inventario inesistente'; END IF;
  IF NOT public.is_company_member(v_session.company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;

  WITH rows AS (
    SELECT sp.product_id, sp.location_id, l.name AS location_name, l.code AS location_code,
           p.category, p.subcategory,
           c.id AS count_id, c.counted_quantity, c.previous_quantity, c.difference,
           CASE
             WHEN c.id IS NULL THEN true
             WHEN NULLIF(btrim(COALESCE(c.unit_code, '')), '') IS NULL THEN true
             WHEN NULLIF(btrim(COALESCE(p.danea_um, '')), '') IS NULL THEN true
             ELSE lower(btrim(c.unit_code)) = lower(btrim(p.danea_um))
           END AS comparable
    FROM public.inventory_session_products sp
    JOIN public.inventory_locations l ON l.id = sp.location_id
    JOIN public.products p ON p.id = sp.product_id
    LEFT JOIN public.inventory_counts c
      ON c.session_id = sp.session_id AND c.product_id = sp.product_id AND c.location_id = sp.location_id
    WHERE sp.session_id = _session_id
  )
  SELECT jsonb_build_object(
    'session_id', v_session.id, 'session_name', v_session.name, 'status', v_session.status,
    'started_at', v_session.started_at, 'finished_at', v_session.finished_at,
    'total', (SELECT count(*) FROM rows),
    'completed', (SELECT count(*) FROM rows WHERE count_id IS NOT NULL),
    'differences', (SELECT count(*) FROM rows WHERE count_id IS NOT NULL AND comparable AND COALESCE(difference, 0) <> 0),
    'unchanged', (SELECT count(*) FROM rows WHERE count_id IS NOT NULL AND comparable AND COALESCE(difference, 0) = 0),
    'not_comparable', (SELECT count(*) FROM rows WHERE count_id IS NOT NULL AND NOT comparable),
    'pending', (SELECT count(*) FROM rows WHERE count_id IS NULL),
    'zones', COALESCE((
      SELECT jsonb_agg(z ORDER BY z->>'name') FROM (
        SELECT jsonb_build_object('location_id', location_id, 'name', location_name, 'code', location_code,
          'total', count(*), 'completed', count(count_id),
          'differences', count(*) FILTER (WHERE count_id IS NOT NULL AND comparable AND COALESCE(difference, 0) <> 0),
          'not_comparable', count(*) FILTER (WHERE count_id IS NOT NULL AND NOT comparable)) AS z
        FROM rows GROUP BY location_id, location_name, location_code) q), '[]'::jsonb),
    'categories', COALESCE((
      SELECT jsonb_agg(c ORDER BY c->>'name') FROM (
        SELECT jsonb_build_object('name', COALESCE(NULLIF(btrim(category), ''), 'Senza categoria'),
          'total', count(*), 'completed', count(count_id)) AS c
        FROM rows GROUP BY COALESCE(NULLIF(btrim(category), ''), 'Senza categoria')) q), '[]'::jsonb),
    'subcategories', COALESCE((
      SELECT jsonb_agg(s ORDER BY s->>'category', s->>'name') FROM (
        SELECT jsonb_build_object('category', COALESCE(NULLIF(btrim(category), ''), 'Senza categoria'),
          'name', COALESCE(NULLIF(btrim(subcategory), ''), 'Senza sottocategoria'),
          'total', count(*), 'completed', count(count_id)) AS s
        FROM rows GROUP BY COALESCE(NULLIF(btrim(category), ''), 'Senza categoria'),
                 COALESCE(NULLIF(btrim(subcategory), ''), 'Senza sottocategoria')) q), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_general_inventory(_company_id uuid, _session_id uuid, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_session public.inventory_sessions;
  v_total integer; v_completed integer; v_differences integer; v_unchanged integer; v_not_comparable integer;
  v_already boolean := false;
BEGIN
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Solo un amministratore può chiudere l''inventario';
  END IF;
  SELECT * INTO v_session FROM public.inventory_sessions WHERE id = _session_id AND company_id = _company_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Sessione di inventario non trovata'; END IF;

  SELECT count(*), count(x.cid),
         count(*) FILTER (WHERE x.cid IS NOT NULL AND x.comparable AND COALESCE(x.difference, 0) <> 0),
         count(*) FILTER (WHERE x.cid IS NOT NULL AND x.comparable AND COALESCE(x.difference, 0) = 0),
         count(*) FILTER (WHERE x.cid IS NOT NULL AND NOT x.comparable)
  INTO v_total, v_completed, v_differences, v_unchanged, v_not_comparable
  FROM (
    SELECT c.id AS cid, c.difference,
      CASE
        WHEN c.id IS NULL THEN true
        WHEN NULLIF(btrim(COALESCE(c.unit_code, '')), '') IS NULL THEN true
        WHEN NULLIF(btrim(COALESCE(p.danea_um, '')), '') IS NULL THEN true
        ELSE lower(btrim(c.unit_code)) = lower(btrim(p.danea_um))
      END AS comparable
    FROM public.inventory_session_products sp
    JOIN public.products p ON p.id = sp.product_id
    LEFT JOIN public.inventory_counts c
      ON c.session_id = sp.session_id AND c.product_id = sp.product_id AND c.location_id = sp.location_id
    WHERE sp.session_id = _session_id
  ) x;

  IF v_session.status = 'completata' THEN
    v_already := true;
  ELSIF v_session.status <> 'in_corso' THEN
    RAISE EXCEPTION 'La sessione è stata annullata e non può essere chiusa';
  ELSE
    IF v_completed < v_total THEN
      RAISE EXCEPTION 'Mancano ancora % prodotti da controllare', v_total - v_completed;
    END IF;
    UPDATE public.inventory_sessions SET status = 'completata', finished_at = now() WHERE id = _session_id;
    INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
    VALUES (_company_id, _actor_user_id, 'inventory_session_close', 'inventory_session', _session_id,
            jsonb_build_object('total', v_total, 'differences', v_differences, 'not_comparable', v_not_comparable));
  END IF;

  RETURN jsonb_build_object('session_id', _session_id, 'already_closed', v_already,
    'total', v_total, 'completed', v_completed, 'differences', v_differences,
    'unchanged', v_unchanged, 'not_comparable', v_not_comparable);
END;
$function$;
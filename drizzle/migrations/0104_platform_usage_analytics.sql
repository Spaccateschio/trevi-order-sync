CREATE TABLE public.platform_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  page_key text NOT NULL,
  element_key text,
  area text NOT NULL,
  device text NOT NULL,
  visit_id uuid NOT NULL,
  metric_value numeric,
  CONSTRAINT platform_usage_events_type_check CHECK (event_type IN ('page_view', 'click', 'page_load', 'page_engagement', 'error')),
  CONSTRAINT platform_usage_events_area_check CHECK (area IN ('aziende', 'piattaforma')),
  CONSTRAINT platform_usage_events_device_check CHECK (device IN ('smartphone', 'computer')),
  CONSTRAINT platform_usage_events_metric_check CHECK (metric_value IS NULL OR metric_value >= 0)
);

REVOKE ALL ON public.platform_usage_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_usage_events TO service_role;
ALTER TABLE public.platform_usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_usage_events_no_direct_read
ON public.platform_usage_events FOR SELECT TO authenticated
USING (false);

CREATE INDEX platform_usage_events_occurred_idx ON public.platform_usage_events (occurred_at DESC);
CREATE INDEX platform_usage_events_page_occurred_idx ON public.platform_usage_events (page_key, occurred_at DESC);
CREATE INDEX platform_usage_events_element_occurred_idx ON public.platform_usage_events (element_key, occurred_at DESC) WHERE element_key IS NOT NULL;

CREATE FUNCTION public.record_platform_usage_event(
  _event_type text,
  _page_key text,
  _element_key text,
  _device text,
  _visit_id uuid,
  _metric_value numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _area text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta';
  END IF;
  IF _event_type NOT IN ('page_view', 'click', 'page_load', 'page_engagement', 'error') THEN
    RAISE EXCEPTION 'Tipo evento non valido';
  END IF;
  IF _page_key NOT IN (
    'lista-spesa', 'ordini-clienti', 'inventario', 'prodotti', 'preparazione', 'catalogo',
    'piattaforma-pannello', 'piattaforma-aziende', 'piattaforma-utenti', 'piattaforma-registro',
    'piattaforma-statistiche'
  ) THEN
    RAISE EXCEPTION 'Pagina non valida';
  END IF;
  IF _device NOT IN ('smartphone', 'computer') THEN
    RAISE EXCEPTION 'Dispositivo non valido';
  END IF;
  IF _visit_id IS NULL THEN
    RAISE EXCEPTION 'Visita non valida';
  END IF;
  IF _event_type = 'click' AND (_element_key IS NULL OR _element_key !~ '^[a-z0-9][a-z0-9-]{0,79}$') THEN
    RAISE EXCEPTION 'Comando non valido';
  END IF;
  IF _event_type <> 'click' AND _element_key IS NOT NULL THEN
    RAISE EXCEPTION 'Comando non ammesso per questo evento';
  END IF;
  IF _event_type IN ('page_load', 'page_engagement') AND (_metric_value IS NULL OR _metric_value < 0 OR _metric_value > 86400000) THEN
    RAISE EXCEPTION 'Durata non valida';
  END IF;
  IF _event_type NOT IN ('page_load', 'page_engagement') AND _metric_value IS NOT NULL THEN
    RAISE EXCEPTION 'Durata non ammessa per questo evento';
  END IF;

  _area := CASE WHEN _page_key LIKE 'piattaforma-%' THEN 'piattaforma' ELSE 'aziende' END;

  INSERT INTO public.platform_usage_events (
    event_type, page_key, element_key, area, device, visit_id, metric_value
  ) VALUES (
    _event_type, _page_key, _element_key, _area, _device, _visit_id, _metric_value
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_platform_usage_event(text, text, text, text, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_platform_usage_event(text, text, text, text, uuid, numeric) TO authenticated;

CREATE FUNCTION public.platform_usage_snapshot(
  _days integer,
  _area text DEFAULT 'tutte',
  _device text DEFAULT 'tutti',
  _page_key text DEFAULT 'tutte'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _start timestamptz;
  _previous_start timestamptz;
  _result jsonb;
BEGIN
  IF NOT public._is_active_platform_super() THEN
    RAISE EXCEPTION 'Accesso riservato al super amministratore';
  END IF;
  IF _days NOT IN (7, 30, 90) THEN
    RAISE EXCEPTION 'Periodo non valido';
  END IF;
  IF _area NOT IN ('tutte', 'aziende', 'piattaforma') THEN
    RAISE EXCEPTION 'Area non valida';
  END IF;
  IF _device NOT IN ('tutti', 'smartphone', 'computer') THEN
    RAISE EXCEPTION 'Dispositivo non valido';
  END IF;

  _start := date_trunc('day', now()) - (_days - 1) * interval '1 day';
  _previous_start := _start - _days * interval '1 day';

  WITH current_events AS (
    SELECT * FROM public.platform_usage_events e
    WHERE e.occurred_at >= _start
      AND (_area = 'tutte' OR e.area = _area)
      AND (_device = 'tutti' OR e.device = _device)
      AND (_page_key = 'tutte' OR e.page_key = _page_key)
  ), previous_events AS (
    SELECT * FROM public.platform_usage_events e
    WHERE e.occurred_at >= _previous_start AND e.occurred_at < _start
      AND (_area = 'tutte' OR e.area = _area)
      AND (_device = 'tutti' OR e.device = _device)
      AND (_page_key = 'tutte' OR e.page_key = _page_key)
  ), daily_counts AS (
    SELECT e.occurred_at::date AS day,
      count(*) FILTER (WHERE e.event_type = 'page_view') AS views,
      count(*) FILTER (WHERE e.event_type = 'click') AS clicks
    FROM current_events e GROUP BY e.occurred_at::date
  ), page_stats AS (
    SELECT e.page_key,
      count(*) FILTER (WHERE e.event_type = 'page_view') AS views,
      count(*) FILTER (WHERE e.event_type = 'click') AS clicks,
      count(DISTINCT e.visit_id) FILTER (WHERE e.event_type = 'page_view') AS visits,
      count(*) FILTER (WHERE e.event_type = 'error') AS errors,
      avg(e.metric_value) FILTER (WHERE e.event_type = 'page_load') AS avg_load_ms,
      sum(e.metric_value) FILTER (WHERE e.event_type = 'page_engagement') AS active_ms,
      count(*) FILTER (WHERE e.event_type = 'page_view' AND e.device = 'smartphone') AS smartphone_views,
      count(*) FILTER (WHERE e.event_type = 'page_view' AND e.device = 'computer') AS computer_views,
      count(*) FILTER (WHERE e.event_type = 'error' AND e.device = 'smartphone') AS smartphone_errors,
      count(*) FILTER (WHERE e.event_type = 'error' AND e.device = 'computer') AS computer_errors,
      avg(e.metric_value) FILTER (WHERE e.event_type = 'page_load' AND e.device = 'smartphone') AS smartphone_load_ms,
      avg(e.metric_value) FILTER (WHERE e.event_type = 'page_load' AND e.device = 'computer') AS computer_load_ms
    FROM current_events e GROUP BY e.page_key
  ), element_visit_counts AS (
    SELECT e.page_key, e.element_key, e.visit_id, count(*) AS clicks
    FROM current_events e
    WHERE e.event_type = 'click' AND e.element_key IS NOT NULL
    GROUP BY e.page_key, e.element_key, e.visit_id
  ), element_stats AS (
    SELECT v.page_key, v.element_key,
      sum(v.clicks) AS clicks,
      count(*) AS visits,
      count(*) FILTER (WHERE v.clicks > 1) AS repeated_visits,
      max(v.clicks) AS max_clicks_in_visit
    FROM element_visit_counts v
    GROUP BY v.page_key, v.element_key
  ), current_totals AS (
    SELECT count(*) FILTER (WHERE e.event_type = 'page_view') AS views,
      count(*) FILTER (WHERE e.event_type = 'click') AS clicks,
      count(DISTINCT e.visit_id) FILTER (WHERE e.event_type = 'page_view') AS visits
    FROM current_events e
  ), previous_totals AS (
    SELECT count(*) FILTER (WHERE e.event_type = 'page_view') AS views,
      count(*) FILTER (WHERE e.event_type = 'click') AS clicks
    FROM previous_events e
  ), calendar AS (
    SELECT day::date FROM generate_series(_start::date, now()::date, interval '1 day') day
  )
  SELECT jsonb_build_object(
    'days', _days,
    'totals', (SELECT jsonb_build_object('views', c.views, 'clicks', c.clicks, 'visits', c.visits) FROM current_totals c),
    'previousTotals', (SELECT jsonb_build_object('views', p.views, 'clicks', p.clicks) FROM previous_totals p),
    'daily', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', c.day, 'views', COALESCE(d.views, 0), 'clicks', COALESCE(d.clicks, 0)) ORDER BY c.day)
      FROM calendar c LEFT JOIN daily_counts d ON d.day = c.day
    ), '[]'::jsonb),
    'pages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', p.page_key, 'views', p.views, 'clicks', p.clicks, 'visits', p.visits,
        'errors', p.errors, 'avgLoadMs', p.avg_load_ms, 'activeMs', COALESCE(p.active_ms, 0),
        'smartphoneViews', p.smartphone_views, 'computerViews', p.computer_views,
        'smartphoneErrors', p.smartphone_errors, 'computerErrors', p.computer_errors,
        'smartphoneLoadMs', p.smartphone_load_ms, 'computerLoadMs', p.computer_load_ms
      ) ORDER BY p.views DESC, p.page_key)
      FROM page_stats p
    ), '[]'::jsonb),
    'clickedElements', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', e.element_key, 'pageKey', e.page_key, 'clicks', e.clicks, 'visits', e.visits,
        'repeatedVisits', e.repeated_visits, 'maxClicksInVisit', e.max_clicks_in_visit
      ) ORDER BY e.clicks DESC, e.element_key)
      FROM element_stats e
    ), '[]'::jsonb),
    'collectionStartedAt', (SELECT min(e.occurred_at) FROM public.platform_usage_events e)
  ) INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_usage_snapshot(integer, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_usage_snapshot(integer, text, text, text) TO authenticated;
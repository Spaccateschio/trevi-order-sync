CREATE OR REPLACE FUNCTION public.record_platform_usage_event(
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
  _element_key := NULLIF(_element_key, '');
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
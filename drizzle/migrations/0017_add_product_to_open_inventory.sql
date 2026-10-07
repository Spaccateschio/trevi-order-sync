CREATE OR REPLACE FUNCTION public.add_product_to_open_inventory(_company_id uuid, _product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session uuid;
  v_default uuid;
  v_added int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = _product_id AND p.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Prodotto non valido';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('general_inventory:' || _company_id::text, 0));

  -- Solo l'inventario generale attualmente in corso: chiusi e annullati mai toccati.
  SELECT id INTO v_session FROM public.inventory_sessions
  WHERE company_id = _company_id AND scope = 'generale' AND status = 'in_corso'
  LIMIT 1;
  IF v_session IS NULL THEN
    RETURN jsonb_build_object('session_id', NULL, 'added', 0);
  END IF;

  -- Già presente nell'inventario (in qualsiasi zona): nulla da fare.
  IF EXISTS (
    SELECT 1 FROM public.inventory_session_products
    WHERE session_id = v_session AND product_id = _product_id
  ) THEN
    RETURN jsonb_build_object('session_id', v_session, 'added', 0);
  END IF;

  -- Stessa regola zone dell'apertura inventario: zone già note, altrimenti la predefinita.
  WITH active_locations AS (
    SELECT l.id FROM public.inventory_locations l
    WHERE l.company_id = _company_id AND l.status = 'attivo'
  ), presence AS (
    SELECT c.location_id FROM public.inventory_counts c
    JOIN public.inventory_sessions s ON s.id = c.session_id
    WHERE c.company_id = _company_id AND c.product_id = _product_id AND s.status = 'completata'
    UNION
    SELECT a.location_id FROM public.inventory_adjustments a
    WHERE a.company_id = _company_id AND a.product_id = _product_id
    UNION
    SELECT m.location_id FROM public.inventory_movements m
    WHERE m.company_id = _company_id AND m.product_id = _product_id
    UNION
    SELECT sl.location_id FROM public.stock_lots sl
    WHERE sl.company_id = _company_id AND sl.product_id = _product_id
  )
  INSERT INTO public.inventory_session_products (company_id, session_id, product_id, location_id)
  SELECT DISTINCT _company_id, v_session, _product_id, pr.location_id
  FROM presence pr JOIN active_locations al ON al.id = pr.location_id
  ON CONFLICT (session_id, product_id, location_id) DO NOTHING;
  GET DIAGNOSTICS v_added = ROW_COUNT;

  IF v_added = 0 THEN
    v_default := public.ensure_default_inventory_location(_company_id, auth.uid());
    INSERT INTO public.inventory_session_products (company_id, session_id, product_id, location_id)
    VALUES (_company_id, v_session, _product_id, v_default)
    ON CONFLICT (session_id, product_id, location_id) DO NOTHING;
    GET DIAGNOSTICS v_added = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('session_id', v_session, 'added', v_added);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.add_product_to_open_inventory(uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_product_to_open_inventory(uuid, uuid) TO authenticated, service_role;
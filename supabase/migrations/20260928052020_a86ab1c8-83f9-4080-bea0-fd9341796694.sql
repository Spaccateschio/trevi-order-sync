CREATE OR REPLACE FUNCTION public.start_general_inventory(_company_id uuid, _archive_id uuid DEFAULT NULL::uuid, _name text DEFAULT NULL::text, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_default uuid;
  v_archive uuid := _archive_id;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Solo un amministratore può avviare un inventario';
  END IF;

  -- Con semaforo rosso non si apre un nuovo inventario (quello in corso si può riprendere).
  IF NOT EXISTS (SELECT 1 FROM public.inventory_sessions WHERE company_id = _company_id AND scope = 'generale' AND status = 'in_corso')
     AND (public.inventory_purchase_cycle_status(_company_id) ->> 'color') = 'rosso' THEN
    RAISE EXCEPTION 'Ciclo acquisti ancora da gestire: completa Lista della Spesa e ordini prima di un nuovo inventario';
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
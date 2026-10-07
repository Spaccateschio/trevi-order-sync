-- Passo 3: l'Inventario legge solo products.stock_unit_id come U.M. della giacenza.
-- danea_um resta solo informativa; nessuna conversione; fattore 1; storico mai riscritto.

-- 1) Giacenza: vale solo l'ultimo conteggio nella U.M. di magazzino attuale e successivo
--    a stock_base_at. Senza base valida: nessun numero ("Da verificare"), mai zero implicito.
CREATE OR REPLACE FUNCTION public.inventory_location_stock(_product_id uuid, _location_id uuid)
  RETURNS TABLE(has_count boolean, quantity numeric, counted_at timestamp with time zone, counted_by uuid)
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  WITH last_count AS (
    SELECT c.counted_quantity, c.counted_at, c.counted_by
    FROM public.inventory_counts c
    JOIN public.inventory_sessions s ON s.id = c.session_id
    JOIN public.products p ON p.id = c.product_id
    LEFT JOIN public.units_of_measure su ON su.id = p.stock_unit_id
    WHERE c.product_id = _product_id
      AND c.location_id = _location_id
      AND s.status = 'completata'
      AND p.stock_unit_id IS NOT NULL
      AND su.code IS NOT NULL
      AND NULLIF(btrim(COALESCE(c.unit_code, '')), '') IS NOT NULL
      AND lower(btrim(c.unit_code)) = lower(btrim(su.code))
      AND (p.stock_base_at IS NULL OR c.counted_at >= p.stock_base_at)
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
           + COALESCE((
               SELECT sum(m.quantity) FROM public.inventory_movements m
               WHERE m.product_id = _product_id AND m.location_id = _location_id
                 AND m.created_at >= (SELECT counted_at FROM last_count)
             ), 0)
      ELSE NULL
    END,
    (SELECT counted_at FROM last_count),
    (SELECT counted_by FROM last_count);
$function$;

-- 2) Righe della sessione: aggiunge stock_unit_code e stock_unit_missing (cambio di firma: DROP + CREATE).
DROP FUNCTION public.inventory_session_rows(uuid, uuid, text, text, text, boolean, integer);
CREATE FUNCTION public.inventory_session_rows(_session_id uuid, _location_id uuid DEFAULT NULL::uuid, _category text DEFAULT NULL::text, _subcategory text DEFAULT NULL::text, _search text DEFAULT NULL::text, _favorites_only boolean DEFAULT false, _limit integer DEFAULT 300)
  RETURNS TABLE(product_id uuid, location_id uuid, location_name text, code text, description text, danea_um text, category text, subcategory text, is_favorite boolean, image_path text, thumbnail_path text, calculated numeric, counted numeric, difference numeric, counted_at timestamp with time zone, counted_by uuid, note text, recount_requested_at timestamp with time zone, non_compliant boolean, non_compliant_quantity numeric, non_compliant_note text, proposal_status text, proposal_flagged_at timestamp with time zone, min_stock numeric, order_multiple numeric, counted_unit_code text, units_comparable boolean, stock_unit_code text, stock_unit_missing boolean)
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
    st.quantity,
    c.counted_quantity,
    CASE
      WHEN c.counted_quantity IS NULL THEN NULL
      WHEN p.stock_unit_id IS NULL OR su.code IS NULL THEN NULL
      WHEN NULLIF(btrim(COALESCE(c.unit_code, '')), '') IS NULL THEN NULL
      WHEN lower(btrim(c.unit_code)) = lower(btrim(su.code)) THEN c.difference
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
      WHEN p.stock_unit_id IS NULL OR su.code IS NULL THEN false
      WHEN NULLIF(btrim(COALESCE(c.unit_code, '')), '') IS NULL THEN false
      ELSE lower(btrim(c.unit_code)) = lower(btrim(su.code))
    END,
    su.code,
    p.stock_unit_id IS NULL
  FROM public.inventory_session_products sp
  JOIN public.inventory_locations l ON l.id = sp.location_id
  JOIN public.products p ON p.id = sp.product_id
  LEFT JOIN public.units_of_measure su ON su.id = p.stock_unit_id
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

-- 3) Avanzamento: confronto con la U.M. di magazzino + conteggio dei prodotti senza U.M.
CREATE OR REPLACE FUNCTION public.inventory_session_progress(_session_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
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
           p.category, p.subcategory, p.stock_unit_id,
           c.id AS count_id, c.counted_quantity, c.previous_quantity, c.difference,
           CASE
             WHEN c.id IS NULL THEN true
             WHEN p.stock_unit_id IS NULL OR su.code IS NULL THEN false
             WHEN NULLIF(btrim(COALESCE(c.unit_code, '')), '') IS NULL THEN false
             ELSE lower(btrim(c.unit_code)) = lower(btrim(su.code))
           END AS comparable
    FROM public.inventory_session_products sp
    JOIN public.inventory_locations l ON l.id = sp.location_id
    JOIN public.products p ON p.id = sp.product_id
    LEFT JOIN public.units_of_measure su ON su.id = p.stock_unit_id
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
    'missing_unit', (SELECT count(*) FROM rows WHERE stock_unit_id IS NULL),
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

-- 4) Chiusura: confronto con la U.M. di magazzino; blocco se manca la U.M. su un prodotto.
CREATE OR REPLACE FUNCTION public.close_general_inventory(_company_id uuid, _session_id uuid, _actor_user_id uuid DEFAULT NULL::uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_session public.inventory_sessions;
  v_total integer; v_completed integer; v_differences integer; v_unchanged integer; v_not_comparable integer;
  v_missing_unit integer;
  v_already boolean := false;
  v_item record;
  v_old numeric; v_new numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Solo un amministratore può chiudere l''inventario';
  END IF;
  SELECT * INTO v_session FROM public.inventory_sessions WHERE id = _session_id AND company_id = _company_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Sessione di inventario non trovata'; END IF;

  SELECT count(*), count(x.cid),
         count(*) FILTER (WHERE x.cid IS NOT NULL AND x.comparable AND COALESCE(x.difference, 0) <> 0),
         count(*) FILTER (WHERE x.cid IS NOT NULL AND x.comparable AND COALESCE(x.difference, 0) = 0),
         count(*) FILTER (WHERE x.cid IS NOT NULL AND NOT x.comparable),
         count(*) FILTER (WHERE x.stock_unit_id IS NULL)
  INTO v_total, v_completed, v_differences, v_unchanged, v_not_comparable, v_missing_unit
  FROM (
    SELECT c.id AS cid, c.difference, p.stock_unit_id,
      CASE
        WHEN c.id IS NULL THEN true
        WHEN p.stock_unit_id IS NULL OR su.code IS NULL THEN false
        WHEN NULLIF(btrim(COALESCE(c.unit_code, '')), '') IS NULL THEN false
        ELSE lower(btrim(c.unit_code)) = lower(btrim(su.code))
      END AS comparable
    FROM public.inventory_session_products sp
    JOIN public.products p ON p.id = sp.product_id
    LEFT JOIN public.units_of_measure su ON su.id = p.stock_unit_id
    LEFT JOIN public.inventory_counts c
      ON c.session_id = sp.session_id AND c.product_id = sp.product_id AND c.location_id = sp.location_id
    WHERE sp.session_id = _session_id
  ) x;

  IF v_session.status = 'completata' THEN
    v_already := true;
  ELSIF v_session.status <> 'in_corso' THEN
    RAISE EXCEPTION 'La sessione è stata annullata e non può essere chiusa';
  ELSE
    IF v_missing_unit > 0 THEN
      RAISE EXCEPTION 'Impossibile chiudere l''inventario: % prodotti senza U.M. di magazzino. Imposta la U.M. nella scheda prodotto (Inventario).', v_missing_unit;
    END IF;
    IF v_completed < v_total THEN
      RAISE EXCEPTION 'Mancano ancora % prodotti da controllare', v_total - v_completed;
    END IF;
    UPDATE public.inventory_sessions SET status = 'completata', finished_at = now() WHERE id = _session_id;
    INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
    VALUES (_company_id, _actor_user_id, 'inventory_session_close', 'inventory_session', _session_id,
            jsonb_build_object('total', v_total, 'differences', v_differences, 'not_comparable', v_not_comparable));

    -- Sessione riaperta: segnala in Lista solo i prodotti la cui quantità contata è cambiata.
    IF v_session.reopen_baseline IS NOT NULL AND v_session.purchase_list_id IS NOT NULL THEN
      FOR v_item IN
        SELECT i.id, i.product_id FROM public.shopping_list_items i
         WHERE i.list_id = v_session.purchase_list_id
           AND NOT EXISTS (
             SELECT 1 FROM public.purchase_order_items oi
             JOIN public.purchase_orders o ON o.id = oi.order_id
             WHERE o.shopping_list_id = v_session.purchase_list_id AND o.status <> 'annullato'
               AND oi.product_id = i.product_id)
      LOOP
        SELECT COALESCE(sum(c.counted_quantity), 0) INTO v_new
          FROM public.inventory_counts c
         WHERE c.session_id = _session_id AND c.product_id = v_item.product_id;
        SELECT COALESCE(sum((v_session.reopen_baseline ->> (v_item.product_id::text || '|' || c.location_id::text))::numeric), 0)
          INTO v_old
          FROM public.inventory_session_products c
         WHERE c.session_id = _session_id AND c.product_id = v_item.product_id;
        IF v_new IS DISTINCT FROM v_old THEN
          UPDATE public.shopping_list_items
             SET inventory_changed_at = now(),
                 inventory_previous_quantity = v_old,
                 quantity_locked_at = NULL,
                 quantity_locked_by = NULL
           WHERE id = v_item.id;
        END IF;
      END LOOP;
    END IF;
    UPDATE public.inventory_sessions SET reopen_baseline = NULL WHERE id = _session_id;
  END IF;

  RETURN jsonb_build_object('session_id', _session_id, 'already_closed', v_already,
    'total', v_total, 'completed', v_completed, 'differences', v_differences,
    'unchanged', v_unchanged, 'not_comparable', v_not_comparable, 'missing_unit', v_missing_unit);
END;
$function$;

-- 5) Rettifica su conteggio di riferimento: valido solo se nella U.M. di magazzino attuale.
CREATE OR REPLACE FUNCTION public.record_inventory_adjustment(_company_id uuid, _product_id uuid, _location_id uuid, _quantity numeric, _reason text, _notes text DEFAULT NULL::text, _actor_user_id uuid DEFAULT NULL::uuid, _reference_count_id uuid DEFAULT NULL::uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_cycle jsonb;
  v_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;
  IF _quantity IS NULL OR _quantity = 0 THEN
    RAISE EXCEPTION 'La rettifica deve avere una quantità diversa da zero';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) = 0 THEN
    RAISE EXCEPTION 'Il motivo della rettifica è obbligatorio';
  END IF;

  IF _reference_count_id IS NOT NULL THEN
    v_cycle := public.inventory_purchase_cycle_status(_company_id);
    IF coalesce(v_cycle->>'color', '') <> 'rosso' THEN
      RAISE EXCEPTION 'Correggi conteggio è disponibile solo con ciclo acquisti in corso';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.inventory_counts c
      JOIN public.inventory_sessions s ON s.id = c.session_id
      JOIN public.products p ON p.id = c.product_id
      LEFT JOIN public.units_of_measure su ON su.id = p.stock_unit_id
      WHERE c.id = _reference_count_id
        AND c.company_id = _company_id
        AND c.product_id = _product_id
        AND c.location_id = _location_id
        AND s.status = 'completata'
        AND s.id::text = v_cycle->>'session_id'
        AND p.stock_unit_id IS NOT NULL
        AND su.code IS NOT NULL
        AND NULLIF(btrim(COALESCE(c.unit_code, '')), '') IS NOT NULL
        AND lower(btrim(c.unit_code)) = lower(btrim(su.code))
    ) INTO v_ok;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Conteggio di riferimento non valido per questa correzione';
    END IF;
  END IF;

  INSERT INTO public.inventory_adjustments (company_id, product_id, location_id, quantity, reason, notes, created_by, reference_count_id)
  VALUES (_company_id, _product_id, _location_id, _quantity, btrim(_reason), _notes, _actor_user_id, _reference_count_id)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, _actor_user_id, 'inventory_adjustment', 'product', _product_id,
          jsonb_build_object('location_id', _location_id, 'quantity', _quantity, 'reason', btrim(_reason),
                             'reference_count_id', _reference_count_id));
  RETURN v_id;
END;
$function$;

-- 6) Salvataggio conteggio: U.M. forzata alla U.M. di magazzino, fattore 1, nessuna conversione.
CREATE OR REPLACE FUNCTION public.record_inventory_count_entry(_company_id uuid, _session_id uuid, _product_id uuid, _location_id uuid, _entry_type text DEFAULT 'conteggio'::text, _counted_quantity numeric DEFAULT NULL::numeric, _unit_id uuid DEFAULT NULL::uuid, _unit_code text DEFAULT NULL::text, _notes text DEFAULT NULL::text, _non_compliant boolean DEFAULT NULL::boolean, _non_compliant_quantity numeric DEFAULT NULL::numeric, _actor_user_id uuid DEFAULT NULL::uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_session public.inventory_sessions;
  v_current public.inventory_counts;
  v_previous numeric;
  v_quantity numeric;
  v_non_compliant boolean;
  v_non_compliant_qty numeric;
  v_entry_id uuid;
  v_stock_unit uuid;
  v_stock_code text;
BEGIN
  -- I1: autore = utente realmente autenticato
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  IF _entry_type NOT IN ('conteggio','riconteggio','segnalazione','revoca_segnalazione','richiesta_riconteggio') THEN
    RAISE EXCEPTION 'Tipo di registrazione non valido';
  END IF;

  SELECT * INTO v_session FROM public.inventory_sessions WHERE id = _session_id AND company_id = _company_id;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Sessione di inventario inesistente';
  END IF;
  IF v_session.status <> 'in_corso' THEN
    RAISE EXCEPTION 'Sessione di inventario non aperta';
  END IF;

  -- U.M. del conteggio = U.M. di magazzino del prodotto (products.stock_unit_id).
  -- Senza U.M. di magazzino il conteggio non si può confermare.
  SELECT p.stock_unit_id, su.code INTO v_stock_unit, v_stock_code
    FROM public.products p
    LEFT JOIN public.units_of_measure su ON su.id = p.stock_unit_id
   WHERE p.id = _product_id AND p.company_id = _company_id;
  IF v_stock_unit IS NULL AND _entry_type IN ('conteggio','riconteggio') THEN
    RAISE EXCEPTION 'U.M. di magazzino da impostare per questo prodotto (scheda prodotto → Inventario)';
  END IF;
  IF v_stock_unit IS NOT NULL THEN
    _unit_id := v_stock_unit;
    _unit_code := v_stock_code;
  END IF;

  SELECT * INTO v_current FROM public.inventory_counts
   WHERE session_id = _session_id AND product_id = _product_id AND location_id = _location_id;

  IF _entry_type IN ('conteggio','riconteggio') THEN
    IF _counted_quantity IS NULL OR _counted_quantity < 0 THEN
      RAISE EXCEPTION 'Quantità contata non valida';
    END IF;
    v_quantity := _counted_quantity;
  ELSE
    v_quantity := v_current.counted_quantity;
  END IF;

  IF _entry_type = 'revoca_segnalazione' THEN
    v_non_compliant := false;
    v_non_compliant_qty := NULL;
  ELSE
    v_non_compliant := COALESCE(_non_compliant, COALESCE(v_current.non_compliant, false));
    v_non_compliant_qty := CASE WHEN v_non_compliant
      THEN COALESCE(_non_compliant_quantity, CASE WHEN _non_compliant IS NULL THEN v_current.non_compliant_quantity ELSE NULL END)
      ELSE NULL END;
  END IF;

  IF v_non_compliant AND _entry_type = 'segnalazione' AND COALESCE(NULLIF(btrim(COALESCE(_notes, '')), ''), NULL) IS NULL THEN
    RAISE EXCEPTION 'Motivazione obbligatoria per la segnalazione di non conformità';
  END IF;
  IF v_non_compliant_qty IS NOT NULL AND v_non_compliant_qty < 0 THEN
    RAISE EXCEPTION 'Quantità non conforme non valida';
  END IF;
  IF v_non_compliant_qty IS NOT NULL AND v_quantity IS NOT NULL AND v_non_compliant_qty > v_quantity THEN
    RAISE EXCEPTION 'La quantità non conforme non può superare la quantità fisica confermata';
  END IF;

  SELECT quantity INTO v_previous FROM public.inventory_location_stock(_product_id, _location_id);

  IF _entry_type IN ('conteggio','riconteggio') THEN
    INSERT INTO public.inventory_counts (
      company_id, session_id, product_id, location_id, counted_quantity, unit_id, unit_code,
      previous_quantity, counted_at, counted_by, notes,
      recount_requested_at, recount_requested_by,
      non_compliant, non_compliant_quantity, non_compliant_note,
      stock_unit_id, stock_quantity, conversion_factor
    )
    VALUES (_company_id, _session_id, _product_id, _location_id, v_quantity, _unit_id, _unit_code,
            COALESCE(v_previous, 0), clock_timestamp(), _actor_user_id, _notes,
            NULL, NULL, v_non_compliant, v_non_compliant_qty,
            CASE WHEN v_non_compliant THEN COALESCE(_notes, v_current.non_compliant_note) ELSE NULL END,
            v_stock_unit, v_quantity, 1)
    ON CONFLICT (session_id, product_id, location_id) DO UPDATE SET
      counted_quantity = EXCLUDED.counted_quantity,
      unit_id = EXCLUDED.unit_id,
      unit_code = EXCLUDED.unit_code,
      previous_quantity = EXCLUDED.previous_quantity,
      counted_at = clock_timestamp(),
      counted_by = EXCLUDED.counted_by,
      notes = EXCLUDED.notes,
      recount_requested_at = NULL,
      recount_requested_by = NULL,
      non_compliant = EXCLUDED.non_compliant,
      non_compliant_quantity = EXCLUDED.non_compliant_quantity,
      non_compliant_note = EXCLUDED.non_compliant_note,
      stock_unit_id = EXCLUDED.stock_unit_id,
      stock_quantity = EXCLUDED.stock_quantity,
      conversion_factor = EXCLUDED.conversion_factor;
  ELSIF _entry_type = 'richiesta_riconteggio' THEN
    IF v_current.id IS NULL THEN
      RAISE EXCEPTION 'Nessun conteggio confermato da ricontrollare';
    END IF;
    UPDATE public.inventory_counts
       SET recount_requested_at = clock_timestamp(), recount_requested_by = _actor_user_id
     WHERE id = v_current.id;
  ELSE
    IF v_current.id IS NULL THEN
      INSERT INTO public.inventory_counts (
        company_id, session_id, product_id, location_id, counted_quantity, unit_id, unit_code,
        previous_quantity, counted_at, counted_by, notes,
        non_compliant, non_compliant_quantity, non_compliant_note
      )
      VALUES (_company_id, _session_id, _product_id, _location_id, NULL, _unit_id, _unit_code,
              COALESCE(v_previous, 0), NULL, NULL, NULL,
              v_non_compliant, v_non_compliant_qty, CASE WHEN v_non_compliant THEN _notes ELSE NULL END);
    ELSE
      UPDATE public.inventory_counts
         SET non_compliant = v_non_compliant,
             non_compliant_quantity = v_non_compliant_qty,
             non_compliant_note = CASE WHEN v_non_compliant THEN COALESCE(_notes, non_compliant_note) ELSE NULL END
       WHERE id = v_current.id;
    END IF;
  END IF;

  INSERT INTO public.inventory_count_entries (
    company_id, session_id, product_id, location_id, entry_type, counted_quantity, previous_quantity,
    unit_id, unit_code, non_compliant, non_compliant_quantity, note, created_by
  )
  VALUES (_company_id, _session_id, _product_id, _location_id, _entry_type,
          CASE WHEN _entry_type IN ('conteggio','riconteggio') THEN v_quantity ELSE NULL END,
          COALESCE(v_previous, 0), _unit_id, _unit_code, v_non_compliant, v_non_compliant_qty,
          NULLIF(btrim(COALESCE(_notes, '')), ''), _actor_user_id)
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$function$;
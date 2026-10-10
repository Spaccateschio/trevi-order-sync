-- 0038 v2 Modello 2 — funzioni (card = prodotto + collegamento fornitore; NULL = «Senza fornitore»).
-- Da applicare SOLO subito dopo la 0037 v2 e insieme al frontend della Tappa B.
-- Base: funzioni_attuali/ (09/10/2026). Modificate solo le parti necessarie.

-- ===================================================================
-- 1. Giacenza della card (interna, senza controllo: usata da funzioni SECURITY DEFINER)
--    Sessione di riferimento = sessione dell'ultimo conteggio valido del prodotto nell'ubicazione
--    (stessi filtri di oggi). Istante T = quel conteggio.
--    Card = conteggio valido della card in quella sessione (0 se assente)
--           + rettifiche e movimenti della card da T in poi.
-- ===================================================================
CREATE OR REPLACE FUNCTION public._inventory_card_stock(_product_id uuid, _location_id uuid, _link_id uuid)
 RETURNS TABLE(has_count boolean, quantity numeric, counted_at timestamp with time zone, counted_by uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH valid AS (
    SELECT c.id, c.session_id, c.product_supplier_link_id, c.counted_quantity, c.counted_at, c.counted_by
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
  ), last_count AS (
    SELECT v.session_id, v.counted_at FROM valid v ORDER BY v.counted_at DESC, v.id DESC LIMIT 1
  ), card_count AS (
    SELECT v.counted_quantity, v.counted_at, v.counted_by
    FROM valid v JOIN last_count lc ON lc.session_id = v.session_id
    WHERE v.product_supplier_link_id IS NOT DISTINCT FROM _link_id
    ORDER BY v.counted_at DESC, v.id DESC LIMIT 1
  )
  SELECT
    EXISTS (SELECT 1 FROM last_count),
    CASE WHEN EXISTS (SELECT 1 FROM last_count)
      THEN COALESCE((SELECT counted_quantity FROM card_count), 0)
           + COALESCE((
               SELECT sum(a.quantity) FROM public.inventory_adjustments a
               WHERE a.product_id = _product_id AND a.location_id = _location_id
                 AND a.product_supplier_link_id IS NOT DISTINCT FROM _link_id
                 AND a.created_at >= (SELECT counted_at FROM last_count)
             ), 0)
           + COALESCE((
               SELECT sum(m.quantity) FROM public.inventory_movements m
               WHERE m.product_id = _product_id AND m.location_id = _location_id
                 AND m.product_supplier_link_id IS NOT DISTINCT FROM _link_id
                 AND m.created_at >= (SELECT counted_at FROM last_count)
             ), 0)
      ELSE NULL
    END,
    (SELECT counted_at FROM card_count),
    (SELECT counted_by FROM card_count);
$function$;
REVOKE ALL ON FUNCTION public._inventory_card_stock(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._inventory_card_stock(uuid, uuid, uuid) TO service_role;

-- Versione pubblica con controllo di appartenenza
CREATE OR REPLACE FUNCTION public.inventory_card_stock(_product_id uuid, _location_id uuid, _link_id uuid)
 RETURNS TABLE(has_count boolean, quantity numeric, counted_at timestamp with time zone, counted_by uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.products WHERE id = _product_id;
  IF v_company IS NULL OR NOT public.is_company_member(v_company) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  RETURN QUERY SELECT * FROM public._inventory_card_stock(_product_id, _location_id, _link_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.inventory_card_stock(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_card_stock(uuid, uuid, uuid) TO authenticated, service_role;

-- ===================================================================
-- 2. inventory_location_stock: stessa firma, totale = somma di tutte le card
--    (conteggi validi della sessione di riferimento + tutte le rettifiche/movimenti da T).
--    Con una sola card per sessione il risultato coincide con quello di oggi.
-- ===================================================================
CREATE OR REPLACE FUNCTION public.inventory_location_stock(_product_id uuid, _location_id uuid)
 RETURNS TABLE(has_count boolean, quantity numeric, counted_at timestamp with time zone, counted_by uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH valid AS (
    SELECT c.id, c.session_id, c.counted_quantity, c.counted_at, c.counted_by
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
  ), last_count AS (
    SELECT v.session_id, v.counted_quantity, v.counted_at, v.counted_by
    FROM valid v ORDER BY v.counted_at DESC, v.id DESC LIMIT 1
  )
  SELECT
    EXISTS (SELECT 1 FROM last_count),
    CASE WHEN EXISTS (SELECT 1 FROM last_count)
      THEN (SELECT sum(v.counted_quantity) FROM valid v WHERE v.session_id = (SELECT session_id FROM last_count))
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

-- ===================================================================
-- 3. inventory_cards_for: unica fonte delle regole A–F (sola lettura, interna).
--    _manual = true solo per l'aggiunta a mano: se nessuna card qualifica, restituisce
--    la card «Senza fornitore» (regola M) così il prodotto si può comunque aggiungere.
-- ===================================================================
CREATE OR REPLACE FUNCTION public.inventory_cards_for(_company_id uuid, _product_id uuid, _location_id uuid, _manual boolean DEFAULT false)
 RETURNS TABLE(product_supplier_link_id uuid, rule text, label text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH prod AS (
    SELECT p.id,
           EXISTS (SELECT 1 FROM public.company_product_favorites f
                    WHERE f.company_id = _company_id AND f.product_id = p.id) AS fav,
           EXISTS (SELECT 1 FROM public.company_product_supplier_favorites cf
                    WHERE cf.company_id = _company_id AND cf.product_id = p.id) AS any_card_star,
           EXISTS (SELECT 1 FROM public.product_supplier_links l
                    WHERE l.company_id = _company_id AND l.product_id = p.id AND l.is_active) AS any_active
    FROM public.products p
    WHERE p.id = _product_id AND p.company_id = _company_id
  ), cand AS (
    SELECT l.id AS link_id, l.is_active,
           EXISTS (SELECT 1 FROM public.company_product_supplier_favorites cf
                    WHERE cf.company_id = _company_id AND cf.product_supplier_link_id = l.id) AS star
    FROM public.product_supplier_links l
    WHERE l.company_id = _company_id AND l.product_id = _product_id
    UNION ALL
    SELECT NULL::uuid, NULL::boolean, false
  ), eval AS (
    SELECT c.link_id, c.is_active, c.star,
           COALESCE((SELECT s.quantity FROM public._inventory_card_stock(_product_id, _location_id, c.link_id) s), 0) AS stock
    FROM cand c
  ), ruled AS (
    SELECT e.link_id,
      CASE
        WHEN e.link_id IS NOT NULL AND e.is_active AND e.star THEN 'A'
        WHEN e.link_id IS NOT NULL AND e.is_active AND pr.fav AND NOT pr.any_card_star THEN 'B'
        WHEN e.link_id IS NOT NULL AND e.is_active AND NOT e.star AND e.stock > 0 THEN 'C'
        WHEN e.link_id IS NOT NULL AND NOT e.is_active AND e.stock > 0 THEN 'D'
        WHEN e.link_id IS NULL AND e.stock > 0 THEN 'E'
        WHEN e.link_id IS NULL AND pr.fav AND NOT pr.any_active THEN 'F'
      END AS rule
    FROM eval e CROSS JOIN prod pr
  ), visible AS (
    SELECT r.link_id, r.rule FROM ruled r WHERE r.rule IS NOT NULL
  )
  SELECT v.link_id, v.rule,
         CASE v.rule WHEN 'C' THEN 'Non preferito' WHEN 'D' THEN 'Fornitore scollegato'
                     WHEN 'E' THEN 'Senza fornitore' WHEN 'F' THEN 'Senza fornitore' ELSE NULL END
  FROM visible v
  UNION ALL
  SELECT NULL::uuid, 'M', 'Senza fornitore'
  WHERE _manual AND EXISTS (SELECT 1 FROM prod) AND NOT EXISTS (SELECT 1 FROM visible);
$function$;
REVOKE ALL ON FUNCTION public.inventory_cards_for(uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_cards_for(uuid, uuid, uuid, boolean) TO service_role;

-- ===================================================================
-- 4. start_general_inventory: una riga per card visibile (inventory_cards_for)
-- ===================================================================
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
  ), places AS (
    SELECT product_id, location_id FROM known
    UNION
    SELECT product_id, location_id FROM fallback
  )
  INSERT INTO public.inventory_session_products (company_id, session_id, product_id, location_id, product_supplier_link_id)
  SELECT _company_id, v_id, pl.product_id, pl.location_id, cf.product_supplier_link_id
  FROM places pl
  CROSS JOIN LATERAL public.inventory_cards_for(_company_id, pl.product_id, pl.location_id, false) cf
  ON CONFLICT ON CONSTRAINT inventory_session_products_card_key DO NOTHING;

  RETURN v_id;
END;
$function$;

-- ===================================================================
-- 5. add_product_to_open_inventory: aggiunge solo le card visibili mancanti; idempotente;
--    non tocca le card già presenti nella sessione.
-- ===================================================================
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
  v_places int := 0;
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

  -- Stessa regola zone dell'apertura inventario: zone già note, altrimenti la predefinita.
  SELECT count(*) INTO v_places FROM (
    SELECT c.location_id FROM public.inventory_counts c
    JOIN public.inventory_sessions s ON s.id = c.session_id
    WHERE c.company_id = _company_id AND c.product_id = _product_id AND s.status = 'completata'
    UNION SELECT a.location_id FROM public.inventory_adjustments a WHERE a.company_id = _company_id AND a.product_id = _product_id
    UNION SELECT m.location_id FROM public.inventory_movements m WHERE m.company_id = _company_id AND m.product_id = _product_id
    UNION SELECT sl.location_id FROM public.stock_lots sl WHERE sl.company_id = _company_id AND sl.product_id = _product_id
  ) pr JOIN public.inventory_locations l ON l.id = pr.location_id AND l.company_id = _company_id AND l.status = 'attivo';

  IF v_places > 0 THEN
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
    INSERT INTO public.inventory_session_products (company_id, session_id, product_id, location_id, product_supplier_link_id)
    SELECT _company_id, v_session, _product_id, pr.location_id, cf.product_supplier_link_id
    FROM (SELECT DISTINCT location_id FROM presence) pr
    JOIN active_locations al ON al.id = pr.location_id
    CROSS JOIN LATERAL public.inventory_cards_for(_company_id, _product_id, pr.location_id, true) cf
    ON CONFLICT ON CONSTRAINT inventory_session_products_card_key DO NOTHING;
    GET DIAGNOSTICS v_added = ROW_COUNT;
  ELSE
    v_default := public.ensure_default_inventory_location(_company_id, auth.uid());
    INSERT INTO public.inventory_session_products (company_id, session_id, product_id, location_id, product_supplier_link_id)
    SELECT _company_id, v_session, _product_id, v_default, cf.product_supplier_link_id
    FROM public.inventory_cards_for(_company_id, _product_id, v_default, true) cf
    ON CONFLICT ON CONSTRAINT inventory_session_products_card_key DO NOTHING;
    GET DIAGNOSTICS v_added = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('session_id', v_session, 'added', v_added);
END;
$function$;

-- ===================================================================
-- 5b. Risoluzione della card per le chiamate che non la indicano (schermate vecchie).
--     _explicit = true: si usa esattamente _link_id (NULL = «Senza fornitore»).
--     _explicit = false: se nella sessione/ubicazione il prodotto ha più card → rifiuto;
--     una sola card → quella; nessuna → NULL (comportamento di oggi).
-- ===================================================================
CREATE OR REPLACE FUNCTION public._resolve_session_card(_session_id uuid, _product_id uuid, _location_id uuid, _link_id uuid, _explicit boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_n integer; v_link text;
BEGIN
  IF _explicit OR _link_id IS NOT NULL THEN RETURN _link_id; END IF;
  SELECT count(*), min(sp.product_supplier_link_id::text) INTO v_n, v_link
    FROM public.inventory_session_products sp
   WHERE sp.session_id = _session_id AND sp.product_id = _product_id AND sp.location_id = _location_id;
  IF v_n > 1 THEN
    RAISE EXCEPTION 'Aggiorna la pagina: l''Inventario è stato aggiornato';
  END IF;
  RETURN v_link::uuid;
END;
$function$;
REVOKE ALL ON FUNCTION public._resolve_session_card(uuid, uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._resolve_session_card(uuid, uuid, uuid, uuid, boolean) TO service_role;

-- ===================================================================
-- 6. manage_inventory_count_draft: + _link_id (DEFAULT NULL) → bozza per card
-- ===================================================================
DROP FUNCTION public.manage_inventory_count_draft(text, uuid, uuid, uuid, text, text);
CREATE FUNCTION public.manage_inventory_count_draft(_action text, _session_id uuid, _product_id uuid DEFAULT NULL::uuid, _location_id uuid DEFAULT NULL::uuid, _quantity text DEFAULT NULL::text, _unit_code text DEFAULT NULL::text, _link_id uuid DEFAULT NULL::uuid, _card_explicit boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _company uuid; _status inventory_session_status; _n integer := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT company_id, status INTO _company, _status FROM inventory_sessions WHERE id = _session_id;
  IF _company IS NULL OR NOT is_company_member(_company) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _status <> 'in_corso' THEN RAISE EXCEPTION 'Inventario non aperto'; END IF;
  IF _action IN ('set', 'clear_one') THEN
    _link_id := public._resolve_session_card(_session_id, _product_id, _location_id, _link_id, _card_explicit);
  END IF;

  IF _action = 'set' THEN
    IF _product_id IS NULL OR _location_id IS NULL OR _quantity IS NULL OR btrim(_quantity) = '' THEN
      RAISE EXCEPTION 'Dati bozza incompleti'; END IF;
    IF NOT EXISTS (SELECT 1 FROM products WHERE id = _product_id AND company_id = _company) THEN
      RAISE EXCEPTION 'Prodotto non valido'; END IF;
    IF NOT EXISTS (SELECT 1 FROM inventory_locations WHERE id = _location_id AND company_id = _company) THEN
      RAISE EXCEPTION 'Zona non valida'; END IF;
    IF NOT EXISTS (SELECT 1 FROM inventory_session_products sp
                    WHERE sp.session_id = _session_id AND sp.product_id = _product_id
                      AND sp.location_id = _location_id
                      AND sp.product_supplier_link_id IS NOT DISTINCT FROM _link_id) THEN
      RAISE EXCEPTION 'Card non presente in questo inventario'; END IF;
    INSERT INTO inventory_count_drafts(company_id, session_id, product_id, location_id, product_supplier_link_id, quantity, unit_code, updated_by)
    VALUES (_company, _session_id, _product_id, _location_id, _link_id, left(btrim(_quantity), 30), nullif(btrim(_unit_code), ''), _uid)
    ON CONFLICT ON CONSTRAINT inventory_count_drafts_card_key DO UPDATE
      SET quantity = EXCLUDED.quantity, unit_code = EXCLUDED.unit_code, updated_by = _uid, updated_at = now();
    RETURN 1;
  ELSIF _action = 'clear_one' THEN
    DELETE FROM inventory_count_drafts WHERE session_id = _session_id AND product_id = _product_id AND location_id = _location_id
      AND product_supplier_link_id IS NOT DISTINCT FROM _link_id;
    GET DIAGNOSTICS _n = ROW_COUNT; RETURN _n;
  ELSIF _action = 'clear_all' THEN
    DELETE FROM inventory_count_drafts WHERE session_id = _session_id;
    GET DIAGNOSTICS _n = ROW_COUNT; RETURN _n;
  END IF;
  RAISE EXCEPTION 'Azione non valida';
END $function$;
REVOKE ALL ON FUNCTION public.manage_inventory_count_draft(text, uuid, uuid, uuid, text, text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_inventory_count_draft(text, uuid, uuid, uuid, text, text, uuid, boolean) TO authenticated, service_role;

-- ===================================================================
-- 7. record_inventory_count: + _link_id (DEFAULT NULL)
-- ===================================================================
DROP FUNCTION public.record_inventory_count(uuid, uuid, uuid, uuid, numeric, uuid, text, text, uuid);
CREATE FUNCTION public.record_inventory_count(_company_id uuid, _session_id uuid, _product_id uuid, _location_id uuid, _counted_quantity numeric, _unit_id uuid DEFAULT NULL::uuid, _unit_code text DEFAULT NULL::text, _notes text DEFAULT NULL::text, _actor_user_id uuid DEFAULT NULL::uuid, _link_id uuid DEFAULT NULL::uuid, _card_explicit boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_previous numeric;
BEGIN
  -- I1: autore = utente realmente autenticato
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  IF _counted_quantity IS NULL OR _counted_quantity < 0 THEN
    RAISE EXCEPTION 'Quantità contata non valida';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_sessions WHERE id = _session_id AND company_id = _company_id) THEN
    RAISE EXCEPTION 'Sessione di inventario inesistente';
  END IF;
  _link_id := public._resolve_session_card(_session_id, _product_id, _location_id, _link_id, _card_explicit);
  IF (_card_explicit OR _link_id IS NOT NULL) AND NOT EXISTS (
       SELECT 1 FROM public.inventory_session_products sp
        WHERE sp.session_id = _session_id AND sp.product_id = _product_id AND sp.location_id = _location_id
          AND sp.product_supplier_link_id IS NOT DISTINCT FROM _link_id) THEN
    RAISE EXCEPTION 'Card non presente in questo inventario';
  END IF;

  SELECT quantity INTO v_previous FROM public._inventory_card_stock(_product_id, _location_id, _link_id);

  INSERT INTO public.inventory_counts (
    company_id, session_id, product_id, location_id, product_supplier_link_id, counted_quantity, unit_id, unit_code,
    previous_quantity, counted_at, counted_by, notes
  )
  VALUES (_company_id, _session_id, _product_id, _location_id, _link_id, _counted_quantity, _unit_id, _unit_code,
          COALESCE(v_previous, 0), clock_timestamp(), _actor_user_id, _notes)
  ON CONFLICT ON CONSTRAINT inventory_counts_card_key DO UPDATE SET
    counted_quantity = EXCLUDED.counted_quantity,
    unit_id = EXCLUDED.unit_id,
    unit_code = EXCLUDED.unit_code,
    counted_at = clock_timestamp(),
    counted_by = EXCLUDED.counted_by,
    notes = EXCLUDED.notes
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_inventory_count(uuid, uuid, uuid, uuid, numeric, uuid, text, text, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_inventory_count(uuid, uuid, uuid, uuid, numeric, uuid, text, text, uuid, uuid, boolean) TO authenticated, service_role;

-- ===================================================================
-- 8. record_inventory_count_entry: + _link_id (DEFAULT NULL); la card deve essere nella sessione
-- ===================================================================
DROP FUNCTION public.record_inventory_count_entry(uuid, uuid, uuid, uuid, text, numeric, uuid, text, text, boolean, numeric, uuid);
CREATE FUNCTION public.record_inventory_count_entry(_company_id uuid, _session_id uuid, _product_id uuid, _location_id uuid, _entry_type text DEFAULT 'conteggio'::text, _counted_quantity numeric DEFAULT NULL::numeric, _unit_id uuid DEFAULT NULL::uuid, _unit_code text DEFAULT NULL::text, _notes text DEFAULT NULL::text, _non_compliant boolean DEFAULT NULL::boolean, _non_compliant_quantity numeric DEFAULT NULL::numeric, _actor_user_id uuid DEFAULT NULL::uuid, _link_id uuid DEFAULT NULL::uuid, _card_explicit boolean DEFAULT false)
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
  _link_id := public._resolve_session_card(_session_id, _product_id, _location_id, _link_id, _card_explicit);
  IF NOT EXISTS (SELECT 1 FROM public.inventory_session_products sp
                  WHERE sp.session_id = _session_id AND sp.product_id = _product_id
                    AND sp.location_id = _location_id
                    AND sp.product_supplier_link_id IS NOT DISTINCT FROM _link_id) THEN
    RAISE EXCEPTION 'Card non presente in questo inventario';
  END IF;

  SELECT p.stock_unit_id, su.code INTO v_stock_unit, v_stock_code
    FROM public.products p
    LEFT JOIN public.units_of_measure su ON su.id = p.stock_unit_id
   WHERE p.id = _product_id AND p.company_id = _company_id;
  IF v_stock_unit IS NULL AND _entry_type IN ('conteggio','riconteggio') THEN
    RAISE EXCEPTION 'Nessuna U.M. impostata per questo prodotto (scheda prodotto → Inventario)';
  END IF;
  -- U.M. scelta da chi conta, solo tra quelle ammesse per il prodotto; altrimenti la principale.
  IF v_stock_unit IS NOT NULL THEN
    IF _unit_id IS NULL OR NOT EXISTS (
         SELECT 1 FROM public.product_inventory_units piu
          WHERE piu.product_id = _product_id AND piu.unit_id = _unit_id) THEN
      _unit_id := v_stock_unit;
    END IF;
    SELECT u.code INTO _unit_code FROM public.units_of_measure u WHERE u.id = _unit_id;
  END IF;

  SELECT * INTO v_current FROM public.inventory_counts
   WHERE session_id = _session_id AND product_id = _product_id AND location_id = _location_id
     AND product_supplier_link_id IS NOT DISTINCT FROM _link_id;

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

  SELECT quantity INTO v_previous FROM public._inventory_card_stock(_product_id, _location_id, _link_id);

  IF _entry_type IN ('conteggio','riconteggio') THEN
    INSERT INTO public.inventory_counts (
      company_id, session_id, product_id, location_id, product_supplier_link_id, counted_quantity, unit_id, unit_code,
      previous_quantity, counted_at, counted_by, notes,
      recount_requested_at, recount_requested_by,
      non_compliant, non_compliant_quantity, non_compliant_note,
      stock_unit_id, stock_quantity, conversion_factor
    )
    VALUES (_company_id, _session_id, _product_id, _location_id, _link_id, v_quantity, _unit_id, _unit_code,
            COALESCE(v_previous, 0), clock_timestamp(), _actor_user_id, _notes,
            NULL, NULL, v_non_compliant, v_non_compliant_qty,
            CASE WHEN v_non_compliant THEN COALESCE(_notes, v_current.non_compliant_note) ELSE NULL END,
            _unit_id, v_quantity, 1)
    ON CONFLICT ON CONSTRAINT inventory_counts_card_key DO UPDATE SET
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
        company_id, session_id, product_id, location_id, product_supplier_link_id, counted_quantity, unit_id, unit_code,
        previous_quantity, counted_at, counted_by, notes,
        non_compliant, non_compliant_quantity, non_compliant_note
      )
      VALUES (_company_id, _session_id, _product_id, _location_id, _link_id, NULL, _unit_id, _unit_code,
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
    company_id, session_id, product_id, location_id, product_supplier_link_id, entry_type, counted_quantity, previous_quantity,
    unit_id, unit_code, non_compliant, non_compliant_quantity, note, created_by
  )
  VALUES (_company_id, _session_id, _product_id, _location_id, _link_id, _entry_type,
          CASE WHEN _entry_type IN ('conteggio','riconteggio') THEN v_quantity ELSE NULL END,
          COALESCE(v_previous, 0), _unit_id, _unit_code, v_non_compliant, v_non_compliant_qty,
          NULLIF(btrim(COALESCE(_notes, '')), ''), _actor_user_id)
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_inventory_count_entry(uuid, uuid, uuid, uuid, text, numeric, uuid, text, text, boolean, numeric, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_inventory_count_entry(uuid, uuid, uuid, uuid, text, numeric, uuid, text, text, boolean, numeric, uuid, uuid, boolean) TO authenticated, service_role;

-- ===================================================================
-- 9. record_inventory_adjustment: + _link_id (DEFAULT NULL)
-- ===================================================================
DROP FUNCTION public.record_inventory_adjustment(uuid, uuid, uuid, numeric, text, text, uuid, uuid);
CREATE FUNCTION public.record_inventory_adjustment(_company_id uuid, _product_id uuid, _location_id uuid, _quantity numeric, _reason text, _notes text DEFAULT NULL::text, _actor_user_id uuid DEFAULT NULL::uuid, _reference_count_id uuid DEFAULT NULL::uuid, _link_id uuid DEFAULT NULL::uuid, _card_explicit boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_cycle jsonb;
  v_ok boolean;
  v_cards integer;
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

  -- Card non indicata (schermata vecchia): dal conteggio di riferimento, altrimenti
  -- unica card dell'ultima sessione completata; più card → rifiuto.
  IF NOT _card_explicit AND _link_id IS NULL THEN
    IF _reference_count_id IS NOT NULL THEN
      SELECT c.product_supplier_link_id INTO _link_id FROM public.inventory_counts c
       WHERE c.id = _reference_count_id AND c.company_id = _company_id;
    ELSE
      SELECT count(*) INTO v_cards FROM public.inventory_counts c
       WHERE c.product_id = _product_id AND c.location_id = _location_id
         AND c.session_id = (SELECT c2.session_id FROM public.inventory_counts c2
                              JOIN public.inventory_sessions s2 ON s2.id = c2.session_id AND s2.status = 'completata'
                             WHERE c2.product_id = _product_id AND c2.location_id = _location_id
                             ORDER BY c2.counted_at DESC NULLS LAST, c2.id DESC LIMIT 1);
      IF v_cards > 1 THEN
        RAISE EXCEPTION 'Aggiorna la pagina: l''Inventario è stato aggiornato';
      END IF;
      SELECT c.product_supplier_link_id INTO _link_id FROM public.inventory_counts c
       JOIN public.inventory_sessions s ON s.id = c.session_id AND s.status = 'completata'
       WHERE c.product_id = _product_id AND c.location_id = _location_id
       ORDER BY c.counted_at DESC NULLS LAST, c.id DESC LIMIT 1;
    END IF;
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
        AND c.product_supplier_link_id IS NOT DISTINCT FROM _link_id
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

  INSERT INTO public.inventory_adjustments (company_id, product_id, location_id, product_supplier_link_id, quantity, reason, notes, created_by, reference_count_id)
  VALUES (_company_id, _product_id, _location_id, _link_id, _quantity, btrim(_reason), _notes, _actor_user_id, _reference_count_id)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, _actor_user_id, 'inventory_adjustment', 'product', _product_id,
          jsonb_build_object('location_id', _location_id, 'quantity', _quantity, 'reason', btrim(_reason),
                             'reference_count_id', _reference_count_id, 'product_supplier_link_id', _link_id));
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_inventory_adjustment(uuid, uuid, uuid, numeric, text, text, uuid, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_inventory_adjustment(uuid, uuid, uuid, numeric, text, text, uuid, uuid, uuid, boolean) TO authenticated, service_role;

-- ===================================================================
-- 10. reopen_inventory_count: fotografia per prodotto|ubicazione = SOMMA delle card
--     (con più card la chiave prodotto|ubicazione sarebbe duplicata). Resto invariato.
-- ===================================================================
CREATE OR REPLACE FUNCTION public.reopen_inventory_count(_company_id uuid, _session_id uuid, _reset boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session public.inventory_sessions;
  v_baseline jsonb;
  v_orders integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Solo un amministratore può modificare l''inventario confermato';
  END IF;
  SELECT * INTO v_session FROM public.inventory_sessions
   WHERE id = _session_id AND company_id = _company_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Sessione di inventario non trovata'; END IF;
  IF v_session.status <> 'completata' THEN
    RAISE EXCEPTION 'Solo un conteggio confermato può essere riaperto';
  END IF;

  -- Blocco: se dalla Lista del ciclo è partito almeno un ordine, l'inventario non si tocca più.
  IF v_session.purchase_list_id IS NOT NULL THEN
    SELECT count(*) INTO v_orders FROM public.purchase_orders
     WHERE shopping_list_id = v_session.purchase_list_id
       AND status NOT IN ('bozza', 'annullato');
    IF v_orders > 0 THEN
      RAISE EXCEPTION 'Gli ordini di questo ciclo sono già stati inviati: l''inventario non è più modificabile';
    END IF;
  END IF;

  -- Fotografia delle quantità attuali (somma delle card per prodotto|ubicazione).
  SELECT COALESCE(jsonb_object_agg(k, q), '{}'::jsonb)
    INTO v_baseline
    FROM (SELECT product_id::text || '|' || location_id::text AS k, sum(counted_quantity) AS q
            FROM public.inventory_counts
           WHERE session_id = _session_id
           GROUP BY product_id, location_id) b;

  IF _reset THEN
    DELETE FROM public.inventory_count_drafts WHERE session_id = _session_id;
    DELETE FROM public.inventory_counts WHERE session_id = _session_id;
  END IF;

  UPDATE public.inventory_sessions
     SET status = 'in_corso', finished_at = NULL, reopen_baseline = v_baseline
   WHERE id = _session_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, auth.uid(), 'inventory_session_reopen', 'inventory_session', _session_id,
          jsonb_build_object('reset', _reset));

  RETURN jsonb_build_object('session_id', _session_id, 'reset', _reset);
END;
$function$;

-- ===================================================================
-- 11. close_general_inventory: conteggio per card; blocca se una card conteggiabile
--     (prodotto con U.M. di magazzino, D1) non ha quantità confermata. Controllo prima di ogni scrittura.
-- ===================================================================
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
  v_uncounted integer;
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
         count(*) FILTER (WHERE x.stock_unit_id IS NULL),
         count(*) FILTER (WHERE x.stock_unit_id IS NOT NULL AND x.counted_quantity IS NULL)
  INTO v_total, v_completed, v_differences, v_unchanged, v_not_comparable, v_missing_unit, v_uncounted
  FROM (
    SELECT c.id AS cid, c.difference, c.counted_quantity, p.stock_unit_id,
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
     AND c.product_supplier_link_id IS NOT DISTINCT FROM sp.product_supplier_link_id
    WHERE sp.session_id = _session_id
  ) x;

  IF v_session.status = 'completata' THEN
    v_already := true;
  ELSIF v_session.status <> 'in_corso' THEN
    RAISE EXCEPTION 'La sessione è stata annullata e non può essere chiusa';
  ELSE
    IF v_uncounted > 0 THEN
      RAISE EXCEPTION 'Inventario non completo: % card ancora da contare (la quantità 0 è ammessa)', v_uncounted;
    END IF;
    UPDATE public.inventory_sessions SET status = 'completata', finished_at = now() WHERE id = _session_id;
    INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
    VALUES (_company_id, _actor_user_id, 'inventory_session_close', 'inventory_session', _session_id,
            jsonb_build_object('total', v_total, 'differences', v_differences, 'not_comparable', v_not_comparable));

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
        -- una sola volta per ubicazione (più card nella stessa ubicazione condividono la chiave)
        SELECT COALESCE(sum((v_session.reopen_baseline ->> (v_item.product_id::text || '|' || z.location_id::text))::numeric), 0)
          INTO v_old
          FROM (SELECT DISTINCT c.location_id FROM public.inventory_session_products c
                 WHERE c.session_id = _session_id AND c.product_id = v_item.product_id) z;
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

-- ===================================================================
-- 12. inventory_session_rows: una riga per card (+ colonne della card in coda)
-- ===================================================================
DROP FUNCTION public.inventory_session_rows(uuid, uuid, text, text, text, boolean, integer);
CREATE FUNCTION public.inventory_session_rows(_session_id uuid, _location_id uuid DEFAULT NULL::uuid, _category text DEFAULT NULL::text, _subcategory text DEFAULT NULL::text, _search text DEFAULT NULL::text, _favorites_only boolean DEFAULT false, _limit integer DEFAULT 300)
 RETURNS TABLE(product_id uuid, location_id uuid, location_name text, code text, description text, danea_um text, category text, subcategory text, is_favorite boolean, image_path text, thumbnail_path text, calculated numeric, counted numeric, difference numeric, counted_at timestamp with time zone, counted_by uuid, note text, recount_requested_at timestamp with time zone, non_compliant boolean, non_compliant_quantity numeric, non_compliant_note text, proposal_status text, proposal_flagged_at timestamp with time zone, min_stock numeric, order_multiple numeric, counted_unit_code text, units_comparable boolean, stock_unit_code text, stock_unit_missing boolean,
   product_supplier_link_id uuid, supplier_record_id uuid, supplier_name text, link_active boolean, card_favorite boolean, card_label text)
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
    p.stock_unit_id IS NULL,
    sp.product_supplier_link_id,
    lk.supplier_record_id,
    sr.legal_name,
    lk.is_active,
    cf.id IS NOT NULL,
    CASE
      WHEN sp.product_supplier_link_id IS NULL THEN 'Senza fornitore'
      WHEN NOT lk.is_active THEN 'Fornitore scollegato'
      WHEN cf.id IS NULL AND (f.product_id IS NULL OR EXISTS (
             SELECT 1 FROM public.company_product_supplier_favorites x
              WHERE x.company_id = sp.company_id AND x.product_id = sp.product_id)) THEN 'Non preferito'
      ELSE NULL
    END
  FROM public.inventory_session_products sp
  JOIN public.inventory_locations l ON l.id = sp.location_id
  JOIN public.products p ON p.id = sp.product_id
  LEFT JOIN public.units_of_measure su ON su.id = p.stock_unit_id
  LEFT JOIN public.company_product_favorites f
    ON f.company_id = sp.company_id AND f.product_id = sp.product_id
  LEFT JOIN public.product_supplier_links lk ON lk.id = sp.product_supplier_link_id
  LEFT JOIN public.supplier_records sr ON sr.id = lk.supplier_record_id
  LEFT JOIN public.company_product_supplier_favorites cf
    ON cf.company_id = sp.company_id AND cf.product_supplier_link_id = sp.product_supplier_link_id
  LEFT JOIN public.product_images img ON img.product_id = sp.product_id
  LEFT JOIN public.inventory_counts c
    ON c.session_id = sp.session_id AND c.product_id = sp.product_id AND c.location_id = sp.location_id
   AND c.product_supplier_link_id IS NOT DISTINCT FROM sp.product_supplier_link_id
  LEFT JOIN public.product_purchase_proposals pr
    ON pr.company_id = sp.company_id AND pr.product_id = sp.product_id AND pr.status = 'aperta'
  LEFT JOIN public.product_stock_settings ss
    ON ss.company_id = sp.company_id AND ss.product_id = sp.product_id
  LEFT JOIN LATERAL public._inventory_card_stock(sp.product_id, sp.location_id, sp.product_supplier_link_id) st ON true
  WHERE sp.session_id = _session_id
    AND (_location_id IS NULL OR sp.location_id = _location_id)
    AND (_category IS NULL OR COALESCE(NULLIF(btrim(p.category), ''), 'Senza categoria') = _category)
    AND (_subcategory IS NULL OR COALESCE(NULLIF(btrim(p.subcategory), ''), 'Senza sottocategoria') = _subcategory)
    AND (NOT _favorites_only OR f.product_id IS NOT NULL OR cf.id IS NOT NULL)
    AND (v_term IS NULL OR p.code ILIKE '%' || v_term || '%' OR p.description ILIKE '%' || v_term || '%')
  ORDER BY p.description NULLS LAST, p.code, (sp.product_supplier_link_id IS NULL), sr.legal_name NULLS LAST, sp.product_supplier_link_id
  LIMIT GREATEST(COALESCE(_limit, 300), 1);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.inventory_session_rows(uuid, uuid, text, text, text, boolean, integer) TO PUBLIC, anon, authenticated, service_role;

-- ===================================================================
-- 13. inventory_session_progress: conteggio per card (solo la condizione di join)
-- ===================================================================
DO $do$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.inventory_session_progress(uuid)'::regprocedure);
  IF position('ON c.session_id = sp.session_id AND c.product_id = sp.product_id AND c.location_id = sp.location_id' IN v_def) = 0 THEN
    RAISE EXCEPTION '0038: testo di inventory_session_progress diverso dall''atteso';
  END IF;
  v_def := replace(v_def,
    'ON c.session_id = sp.session_id AND c.product_id = sp.product_id AND c.location_id = sp.location_id',
    'ON c.session_id = sp.session_id AND c.product_id = sp.product_id AND c.location_id = sp.location_id AND c.product_supplier_link_id IS NOT DISTINCT FROM sp.product_supplier_link_id');
  EXECUTE v_def;
END $do$;

-- ===================================================================
-- 14. inventory_count_history: + colonna della card
-- ===================================================================
DROP FUNCTION public.inventory_count_history(uuid, uuid, uuid, integer);
CREATE FUNCTION public.inventory_count_history(_company_id uuid, _product_id uuid, _location_id uuid DEFAULT NULL::uuid, _limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, session_id uuid, location_id uuid, location_name text, entry_type text, counted_quantity numeric, previous_quantity numeric, unit_code text, non_compliant boolean, non_compliant_quantity numeric, note text, created_by uuid, created_at timestamp with time zone, product_supplier_link_id uuid, supplier_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  RETURN QUERY
  SELECT e.id, e.session_id, e.location_id, l.name, e.entry_type,
         e.counted_quantity, e.previous_quantity, e.unit_code,
         e.non_compliant, e.non_compliant_quantity, e.note,
         e.created_by, e.created_at, e.product_supplier_link_id, sr.legal_name
    FROM public.inventory_count_entries e
    LEFT JOIN public.inventory_locations l ON l.id = e.location_id
    LEFT JOIN public.product_supplier_links lk ON lk.id = e.product_supplier_link_id
    LEFT JOIN public.supplier_records sr ON sr.id = lk.supplier_record_id
   WHERE e.company_id = _company_id
     AND e.product_id = _product_id
     AND (_location_id IS NULL OR e.location_id = _location_id)
   ORDER BY e.created_at DESC, e.id DESC
   LIMIT GREATEST(COALESCE(_limit, 50), 1);
END;
$function$;
REVOKE ALL ON FUNCTION public.inventory_count_history(uuid, uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_count_history(uuid, uuid, uuid, integer) TO authenticated, service_role;

-- ===================================================================
-- 15. confirm_goods_receipt: propaga il collegamento (D2); tutti i controlli prima delle scritture
-- ===================================================================
CREATE OR REPLACE FUNCTION public.confirm_goods_receipt(_receipt_id uuid, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_r public.goods_receipts; v_it record; v_lot uuid; v_n integer := 0; v_ordered numeric; v_recv numeric;
        v_noeq_open integer;
        v_links jsonb := '{}'::jsonb; v_subst jsonb := '[]'::jsonb;
        v_order_link uuid; v_order_product uuid; v_link uuid; v_cnt integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  PERFORM pg_advisory_xact_lock(hashtextextended(_receipt_id::text, 0));
  SELECT * INTO v_r FROM public.goods_receipts WHERE id = _receipt_id;
  IF v_r.id IS NULL OR NOT public.is_company_member(v_r.company_id) THEN RAISE EXCEPTION 'Carico non trovato'; END IF;
  IF v_r.status = 'confermato' THEN RETURN _receipt_id; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.goods_receipt_items WHERE receipt_id = _receipt_id AND verified_quantity > 0) THEN
    RAISE EXCEPTION 'Nessuna quantità da caricare';
  END IF;

  -- Collegamento della card per ogni riga, deciso prima di qualsiasi scrittura.
  FOR v_it IN SELECT * FROM public.goods_receipt_items WHERE receipt_id = _receipt_id AND verified_quantity > 0
  LOOP
    v_order_link := NULL; v_order_product := NULL; v_link := NULL;
    IF v_it.order_item_id IS NOT NULL THEN
      SELECT oi.product_supplier_link_id, lk.product_id INTO v_order_link, v_order_product
        FROM public.purchase_order_items oi
        LEFT JOIN public.product_supplier_links lk ON lk.id = oi.product_supplier_link_id
       WHERE oi.id = v_it.order_item_id;
    END IF;
    IF v_order_link IS NOT NULL THEN
      IF v_order_product = v_it.product_id THEN
        v_link := v_order_link;
      ELSE
        SELECT count(*) INTO v_cnt FROM (
          SELECT 1 FROM public.product_supplier_links l
           WHERE l.company_id = v_r.company_id AND l.product_id = v_it.product_id
             AND l.supplier_record_id = v_r.supplier_record_id AND l.is_active
           FOR SHARE) q;
        IF v_cnt = 0 THEN
          RAISE EXCEPTION 'Il prodotto ricevuto è diverso da quello ordinato. Se si tratta di un prodotto sostitutivo, collega prima il fornitore al prodotto ricevuto.';
        ELSIF v_cnt > 1 THEN
          RAISE EXCEPTION 'Il fornitore ha più collegamenti su questo prodotto: scegli quale usare prima di confermare il carico.';
        END IF;
        SELECT l.id INTO v_link FROM public.product_supplier_links l
         WHERE l.company_id = v_r.company_id AND l.product_id = v_it.product_id
           AND l.supplier_record_id = v_r.supplier_record_id AND l.is_active;
        v_subst := v_subst || jsonb_build_array(jsonb_build_object(
          'goods_receipt_item_id', v_it.id, 'ordered_product_id', v_order_product,
          'received_product_id', v_it.product_id, 'order_link_id', v_order_link,
          'used_link_id', v_link, 'supplier_record_id', v_r.supplier_record_id));
      END IF;
    END IF;
    v_links := v_links || jsonb_build_object(v_it.id::text, v_link);
  END LOOP;

  FOR v_it IN SELECT * FROM public.goods_receipt_items WHERE receipt_id = _receipt_id AND verified_quantity > 0
  LOOP
    v_n := v_n + 1;
    IF EXISTS (SELECT 1 FROM public.stock_lots WHERE goods_receipt_item_id = v_it.id) THEN CONTINUE; END IF;
    v_link := NULLIF(v_links ->> v_it.id::text, '')::uuid;

    INSERT INTO public.stock_lots (company_id, archive_id, product_id, location_id, goods_receipt_item_id,
      supplier_record_id, product_supplier_link_id, internal_code, producer_name, producer_lot_code, unit_cost, unit_id, unit_code,
      initial_quantity, entered_at, expiry_date)
    VALUES (v_r.company_id, v_r.archive_id, v_it.product_id, v_r.location_id, v_it.id,
      v_r.supplier_record_id, v_link, v_r.number || '-' || lpad(v_n::text, 3, '0'),
      v_it.producer_name, v_it.producer_lot_code,
      -- costo per 1 U.M. di magazzino = (quantità prezzo x prezzo) / quantità caricata; altrimenti vuoto
      CASE WHEN v_it.unit_cost IS NOT NULL AND v_it.price_unit_code IS NOT NULL
                AND v_it.price_quantity IS NOT NULL AND v_it.verified_quantity > 0
           THEN round(v_it.price_quantity * v_it.unit_cost / v_it.verified_quantity, 6) END,
      v_it.unit_id, v_it.unit_code,
      v_it.verified_quantity, v_r.received_at, v_it.expiry_date)
    RETURNING id INTO v_lot;

    INSERT INTO public.inventory_movements (company_id, archive_id, product_id, location_id, product_supplier_link_id, stock_lot_id,
      movement_type, quantity, unit_id, unit_code, source_table, source_id, created_by)
    VALUES (v_r.company_id, v_r.archive_id, v_it.product_id, v_r.location_id, v_link, v_lot,
      'entrata_acquisto', v_it.verified_quantity, v_it.unit_id, v_it.unit_code,
      'goods_receipt_items', v_it.id, _actor_user_id);
  END LOOP;

  UPDATE public.goods_receipts SET status = 'confermato', confirmed_by = _actor_user_id, confirmed_at = now()
   WHERE id = _receipt_id AND status = 'bozza';

  SELECT COALESCE(sum(ordered_quantity), 0) INTO v_ordered FROM public.purchase_order_items WHERE order_id = v_r.order_id;
  SELECT COALESCE(sum(ri.verified_quantity), 0) INTO v_recv
    FROM public.goods_receipt_items ri JOIN public.goods_receipts r ON r.id = ri.receipt_id
    LEFT JOIN public.purchase_order_items oi ON oi.id = ri.order_item_id
   WHERE r.order_id = v_r.order_id AND r.status = 'confermato'
     AND (oi.id IS NULL OR oi.ordered_quantity IS NOT NULL);
  SELECT count(*) INTO v_noeq_open FROM public.purchase_order_items oi
   WHERE oi.order_id = v_r.order_id AND oi.ordered_quantity IS NULL
     AND COALESCE((SELECT sum(di.accepted_purchase_quantity) FROM public.purchase_delivery_items di
                    JOIN public.purchase_deliveries d ON d.id = di.delivery_id
                   WHERE di.order_item_id = oi.id AND d.status IN ('accettata','chiusa_con_rifiuti')), 0)
         < COALESCE(oi.purchase_quantity, 0);
  UPDATE public.purchase_orders
     SET status = (CASE WHEN v_recv >= v_ordered AND v_noeq_open = 0 THEN 'consegnato' ELSE 'parzialmente_consegnato' END)::public.purchase_order_status
   WHERE id = v_r.order_id AND status IN ('inviato','parzialmente_consegnato');

  IF jsonb_array_length(v_subst) > 0 THEN
    INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
    VALUES (v_r.company_id, _actor_user_id, 'goods_receipt.substitute_link', 'goods_receipt', _receipt_id,
            jsonb_build_object('items', v_subst));
  END IF;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_r.company_id, _actor_user_id, 'goods_receipt.confirmed', 'goods_receipt', _receipt_id, NULL);
  RETURN _receipt_id;
END; $function$;

-- ===================================================================
-- 16. manage_product_supplier_link: delete_link sempre rifiutato (solo quel ramo)
-- ===================================================================
DO $do$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.manage_product_supplier_link(uuid,text,uuid,uuid,uuid,text,uuid,numeric,text,numeric,numeric,integer,text,boolean,text,smallint,uuid)'::regprocedure);
  IF position('DELETE FROM public.product_supplier_links WHERE id = _link_id;' IN v_def) = 0 THEN
    RAISE EXCEPTION '0038: testo di manage_product_supplier_link diverso dall''atteso';
  END IF;
  v_def := replace(v_def,
    'DELETE FROM public.product_supplier_links WHERE id = _link_id;',
    'RAISE EXCEPTION ''Usa Disattiva: i collegamenti fornitore non si cancellano.'';');
  EXECUTE v_def;
END $do$;

-- U.M. ammesse per l'Inventario: etichette descrittive scelte da chi conta. Nessun calcolo.
CREATE TABLE public.product_inventory_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units_of_measure(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (product_id, unit_id)
);
GRANT SELECT ON public.product_inventory_units TO authenticated;
GRANT ALL ON public.product_inventory_units TO service_role;
ALTER TABLE public.product_inventory_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membri leggono U.M. inventario" ON public.product_inventory_units
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

INSERT INTO public.product_inventory_units (company_id, product_id, unit_id)
SELECT p.company_id, p.id, p.stock_unit_id FROM public.products p WHERE p.stock_unit_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_product_stock_unit(_product_id uuid, _unit_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_product public.products;
  v_unit public.units_of_measure;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_company_admin(v_product.company_id) THEN
    RAISE EXCEPTION 'Solo un amministratore può cambiare la U.M.';
  END IF;
  SELECT * INTO v_unit FROM public.units_of_measure WHERE id = _unit_id AND company_id = v_product.company_id AND status = 'attivo';
  IF NOT FOUND THEN RAISE EXCEPTION 'U.M. non valida per questa azienda'; END IF;
  INSERT INTO public.product_inventory_units (company_id, product_id, unit_id, created_by)
  VALUES (v_product.company_id, _product_id, _unit_id, auth.uid()) ON CONFLICT DO NOTHING;
  IF v_product.stock_unit_id IS NOT DISTINCT FROM _unit_id THEN
    RETURN jsonb_build_object('changed', false, 'stock_base_at', v_product.stock_base_at);
  END IF;
  PERFORM set_config('app.unit_config_rpc', 'on', true);
  UPDATE public.products SET stock_unit_id = _unit_id, stock_base_at = now() WHERE id = _product_id
    RETURNING * INTO v_product;
  PERFORM set_config('app.unit_config_rpc', 'off', true);
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_product.company_id, auth.uid(), 'stock_unit_changed', 'product', _product_id,
    jsonb_build_object('new_unit_id', _unit_id, 'new_unit_code', v_unit.code, 'stock_base_at', v_product.stock_base_at));
  RETURN jsonb_build_object('changed', true, 'stock_base_at', v_product.stock_base_at);
END $$;

CREATE OR REPLACE FUNCTION public.manage_product_inventory_unit(_product_id uuid, _unit_id uuid, _add boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_product public.products;
  v_next uuid;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_company_admin(v_product.company_id) THEN
    RAISE EXCEPTION 'Solo un amministratore può gestire le U.M. del prodotto';
  END IF;
  IF _add THEN
    IF NOT EXISTS (SELECT 1 FROM public.units_of_measure u WHERE u.id = _unit_id AND u.company_id = v_product.company_id AND u.status = 'attivo') THEN
      RAISE EXCEPTION 'U.M. non valida per questa azienda';
    END IF;
    INSERT INTO public.product_inventory_units (company_id, product_id, unit_id, created_by)
    VALUES (v_product.company_id, _product_id, _unit_id, auth.uid()) ON CONFLICT DO NOTHING;
    IF v_product.stock_unit_id IS NULL THEN
      PERFORM set_config('app.unit_config_rpc', 'on', true);
      UPDATE public.products SET stock_unit_id = _unit_id, stock_base_at = now() WHERE id = _product_id;
      PERFORM set_config('app.unit_config_rpc', 'off', true);
    END IF;
  ELSE
    DELETE FROM public.product_inventory_units WHERE product_id = _product_id AND unit_id = _unit_id;
    IF v_product.stock_unit_id = _unit_id THEN
      SELECT unit_id INTO v_next FROM public.product_inventory_units
       WHERE product_id = _product_id ORDER BY created_at LIMIT 1;
      PERFORM set_config('app.unit_config_rpc', 'on', true);
      UPDATE public.products SET stock_unit_id = v_next, stock_base_at = now() WHERE id = _product_id;
      PERFORM set_config('app.unit_config_rpc', 'off', true);
    END IF;
  END IF;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_product.company_id, auth.uid(), CASE WHEN _add THEN 'inventory_unit_added' ELSE 'inventory_unit_removed' END,
    'product', _product_id, jsonb_build_object('unit_id', _unit_id));
  RETURN jsonb_build_object('ok', true);
END $$;

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
    -- Prodotti senza U.M.: restano non contati e non bloccano la chiusura.
    IF v_completed < v_total - v_missing_unit THEN
      RAISE EXCEPTION 'Mancano ancora % prodotti da controllare', v_total - v_missing_unit - v_completed;
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
            _unit_id, v_quantity, 1)
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

REVOKE ALL ON FUNCTION public.manage_product_inventory_unit(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_product_inventory_unit(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_product_stock_unit(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_general_inventory(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_inventory_count_entry(uuid, uuid, uuid, uuid, text, numeric, uuid, text, text, boolean, numeric, uuid) TO authenticated;
-- Rimuove le versioni con bypass
DROP FUNCTION IF EXISTS public.open_purchase_delivery(uuid, purchase_delivery_origin, text, uuid, boolean);
DROP FUNCTION IF EXISTS public.set_purchase_delivery_item(uuid, numeric, numeric, text, text, date, text, text, uuid, text, boolean);
DROP FUNCTION IF EXISTS public.add_purchase_delivery_extra_item(uuid, uuid, numeric, purchase_delivery_line_type, uuid, uuid, text, text, text, text, uuid, text, boolean);
DROP FUNCTION IF EXISTS public.submit_purchase_delivery(uuid, text, uuid, text, boolean);

-- ===== Logica comune interna (nessun controllo di accesso: non eseguibile da nessun ruolo API) =====
CREATE FUNCTION public._delivery_open_core(_order_id uuid, _origin purchase_delivery_origin, _declared_by_name text, _actor_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_o public.purchase_orders; v_id uuid; v_seq integer;
BEGIN
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = _order_id;
  IF v_o.id IS NULL THEN RAISE EXCEPTION 'Ordine non trovato'; END IF;
  IF v_o.status NOT IN ('inviato','parzialmente_consegnato') THEN
    RAISE EXCEPTION 'L''ordine deve essere inviato prima di registrare una consegna'; END IF;
  SELECT id INTO v_id FROM public.purchase_deliveries WHERE order_id = _order_id AND status = 'bozza' LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT COALESCE(max(sequence), 0) + 1 INTO v_seq FROM public.purchase_deliveries WHERE order_id = _order_id;
  INSERT INTO public.purchase_deliveries (company_id, order_id, sequence, origin, declared_by, declared_by_name)
  VALUES (v_o.company_id, _order_id, v_seq, _origin,
          CASE WHEN _origin = 'fornitore_link_esterno' THEN NULL ELSE _actor_user_id END, _declared_by_name)
  RETURNING id INTO v_id;
  INSERT INTO public.purchase_delivery_items (company_id, delivery_id, order_item_id, product_id,
    declared_quantity, unit_id, unit_code)
  SELECT v_o.company_id, v_id, oi.id, oi.product_id,
         greatest(0, oi.ordered_quantity - COALESCE((
            SELECT sum(x.declared_quantity) FROM public.purchase_delivery_items x
              JOIN public.purchase_deliveries xd ON xd.id = x.delivery_id
             WHERE x.order_item_id = oi.id AND xd.status <> 'bozza'), 0)),
         oi.unit_id, oi.unit_code
    FROM public.purchase_order_items oi WHERE oi.order_id = _order_id;
  RETURN v_id;
END; $$;

CREATE FUNCTION public._delivery_set_item_core(_delivery_item_id uuid, _declared_quantity numeric, _declared_weight numeric,
  _declared_producer text, _declared_producer_lot text, _declared_expiry date, _line_notes text, _missing_reason text,
  _actor_user_id uuid, _actor_label text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_it public.purchase_delivery_items; v_d public.purchase_deliveries; v_prev numeric;
BEGIN
  SELECT * INTO v_it FROM public.purchase_delivery_items WHERE id = _delivery_item_id;
  IF v_it.id IS NULL THEN RAISE EXCEPTION 'Riga non trovata'; END IF;
  SELECT * INTO v_d FROM public.purchase_deliveries WHERE id = v_it.delivery_id;
  IF v_d.status <> 'bozza' THEN RAISE EXCEPTION 'Consegna già dichiarata: usare la contestazione'; END IF;
  v_prev := v_it.declared_quantity;
  UPDATE public.purchase_delivery_items
     SET declared_quantity = COALESCE(_declared_quantity, declared_quantity),
         declared_weight = COALESCE(_declared_weight, declared_weight),
         declared_producer = COALESCE(_declared_producer, declared_producer),
         declared_producer_lot = COALESCE(_declared_producer_lot, declared_producer_lot),
         declared_expiry = COALESCE(_declared_expiry, declared_expiry),
         line_notes = COALESCE(_line_notes, line_notes),
         missing_reason = COALESCE(_missing_reason, missing_reason)
   WHERE id = _delivery_item_id;
  INSERT INTO public.purchase_delivery_line_events (company_id, delivery_item_id, event_type,
    previous_quantity, new_quantity, notes, actor_user_id, actor_label)
  VALUES (v_it.company_id, _delivery_item_id, 'modificata', v_prev,
          COALESCE(_declared_quantity, v_prev), _line_notes, _actor_user_id, _actor_label);
  RETURN _delivery_item_id;
END; $$;

CREATE FUNCTION public._delivery_submit_core(_delivery_id uuid, _notes text, _actor_user_id uuid, _actor_label text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_d public.purchase_deliveries;
BEGIN
  SELECT * INTO v_d FROM public.purchase_deliveries WHERE id = _delivery_id;
  IF v_d.id IS NULL THEN RAISE EXCEPTION 'Consegna non trovata'; END IF;
  IF v_d.status <> 'bozza' THEN RETURN _delivery_id; END IF;
  UPDATE public.purchase_deliveries
     SET status = 'dichiarata', declared_at = now(), notes = COALESCE(_notes, notes),
         declared_by_name = COALESCE(_actor_label, declared_by_name)
   WHERE id = _delivery_id;
  INSERT INTO public.purchase_delivery_line_events (company_id, delivery_item_id, event_type,
    new_quantity, actor_user_id, actor_label)
  SELECT v_d.company_id, di.id, 'dichiarata', di.declared_quantity, _actor_user_id, _actor_label
    FROM public.purchase_delivery_items di WHERE di.delivery_id = _delivery_id;
  UPDATE public.purchase_orders SET status = 'parzialmente_consegnato'
   WHERE id = v_d.order_id AND status = 'inviato';
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_d.company_id, _actor_user_id, 'purchase_delivery.declared', 'purchase_delivery', _delivery_id,
          jsonb_build_object('origin', v_d.origin));
  RETURN _delivery_id;
END; $$;

REVOKE ALL ON FUNCTION public._delivery_open_core(uuid, purchase_delivery_origin, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._delivery_set_item_core(uuid, numeric, numeric, text, text, date, text, text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._delivery_submit_core(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;

-- ===== Percorso interno: utente autenticato reale (auth.uid()) =====
CREATE FUNCTION public.open_purchase_delivery(_order_id uuid, _origin purchase_delivery_origin DEFAULT 'operatore_interno', _declared_by_name text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.purchase_orders WHERE id = _order_id) THEN RAISE EXCEPTION 'Ordine non trovato'; END IF;
  IF NOT public.can_declare_on_order(_order_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _origin = 'fornitore_link_esterno' THEN RAISE EXCEPTION 'Origine non consentita'; END IF;
  IF _origin = 'fornitore_b2b' AND NOT public.is_order_supplier(_order_id) THEN
    RAISE EXCEPTION 'Origine non coerente con l''utente'; END IF;
  RETURN public._delivery_open_core(_order_id, _origin, _declared_by_name, auth.uid());
END; $$;

CREATE FUNCTION public.set_purchase_delivery_item(_delivery_item_id uuid, _declared_quantity numeric DEFAULT NULL,
  _declared_weight numeric DEFAULT NULL, _declared_producer text DEFAULT NULL, _declared_producer_lot text DEFAULT NULL,
  _declared_expiry date DEFAULT NULL, _line_notes text DEFAULT NULL, _missing_reason text DEFAULT NULL, _actor_label text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT d.order_id INTO v_order FROM public.purchase_delivery_items i
    JOIN public.purchase_deliveries d ON d.id = i.delivery_id WHERE i.id = _delivery_item_id;
  IF v_order IS NULL THEN RAISE EXCEPTION 'Riga non trovata'; END IF;
  IF NOT public.can_declare_on_order(v_order) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  RETURN public._delivery_set_item_core(_delivery_item_id, _declared_quantity, _declared_weight, _declared_producer,
    _declared_producer_lot, _declared_expiry, _line_notes, _missing_reason, auth.uid(), _actor_label);
END; $$;

CREATE FUNCTION public.add_purchase_delivery_extra_item(_delivery_id uuid, _product_id uuid, _declared_quantity numeric,
  _line_type purchase_delivery_line_type DEFAULT 'aggiunta_fornitore', _replaces_order_item_id uuid DEFAULT NULL,
  _unit_id uuid DEFAULT NULL, _unit_code text DEFAULT NULL, _declared_producer text DEFAULT NULL,
  _declared_producer_lot text DEFAULT NULL, _line_notes text DEFAULT NULL, _actor_label text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_d public.purchase_deliveries; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_d FROM public.purchase_deliveries WHERE id = _delivery_id;
  IF v_d.id IS NULL THEN RAISE EXCEPTION 'Consegna non trovata'; END IF;
  IF NOT public.can_declare_on_order(v_d.order_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF v_d.status <> 'bozza' THEN RAISE EXCEPTION 'Consegna già dichiarata'; END IF;
  IF _line_type = 'ordinata' THEN RAISE EXCEPTION 'Tipo riga non valido'; END IF;
  INSERT INTO public.purchase_delivery_items (company_id, delivery_id, order_item_id, product_id,
    line_type, replaces_order_item_id, declared_quantity, unit_id, unit_code,
    declared_producer, declared_producer_lot, line_notes)
  VALUES (v_d.company_id, _delivery_id, NULL, _product_id, _line_type, _replaces_order_item_id,
    _declared_quantity, _unit_id, _unit_code, _declared_producer, _declared_producer_lot, _line_notes)
  RETURNING id INTO v_id;
  INSERT INTO public.purchase_delivery_line_events (company_id, delivery_item_id, event_type,
    previous_quantity, new_quantity, notes, actor_user_id, actor_label)
  VALUES (v_d.company_id, v_id, 'dichiarata', NULL, _declared_quantity, _line_notes, auth.uid(), _actor_label);
  RETURN v_id;
END; $$;

CREATE FUNCTION public.submit_purchase_delivery(_delivery_id uuid, _notes text DEFAULT NULL, _actor_label text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT order_id INTO v_order FROM public.purchase_deliveries WHERE id = _delivery_id;
  IF v_order IS NULL THEN RAISE EXCEPTION 'Consegna non trovata'; END IF;
  IF NOT public.can_declare_on_order(v_order) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  RETURN public._delivery_submit_core(_delivery_id, _notes, auth.uid(), _actor_label);
END; $$;

REVOKE ALL ON FUNCTION public.open_purchase_delivery(uuid, purchase_delivery_origin, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_purchase_delivery_item(uuid, numeric, numeric, text, text, date, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_purchase_delivery_extra_item(uuid, uuid, numeric, purchase_delivery_line_type, uuid, uuid, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_purchase_delivery(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_purchase_delivery(uuid, purchase_delivery_origin, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_purchase_delivery_item(uuid, numeric, numeric, text, text, date, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_purchase_delivery_extra_item(uuid, uuid, numeric, purchase_delivery_line_type, uuid, uuid, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_purchase_delivery(uuid, text, text) TO authenticated, service_role;

-- ===== Percorso link esterno: solo server, il codice decide l'ordine =====
CREATE FUNCTION public.external_open_delivery(_token_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order uuid;
BEGIN
  v_order := public.resolve_order_share_token(_token_hash);
  RETURN public._delivery_open_core(v_order, 'fornitore_link_esterno', NULL, NULL);
END; $$;

CREATE FUNCTION public.external_set_delivery_item(_token_hash text, _delivery_item_id uuid,
  _declared_quantity numeric DEFAULT NULL, _declared_producer text DEFAULT NULL, _declared_producer_lot text DEFAULT NULL,
  _declared_expiry date DEFAULT NULL, _line_notes text DEFAULT NULL, _missing_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order uuid; v_item_order uuid;
BEGIN
  v_order := public.resolve_order_share_token(_token_hash);
  SELECT d.order_id INTO v_item_order FROM public.purchase_delivery_items i
    JOIN public.purchase_deliveries d ON d.id = i.delivery_id WHERE i.id = _delivery_item_id;
  IF v_item_order IS NULL OR v_item_order <> v_order THEN RAISE EXCEPTION 'Riga non valida per questo codice'; END IF;
  RETURN public._delivery_set_item_core(_delivery_item_id, _declared_quantity, NULL, _declared_producer,
    _declared_producer_lot, _declared_expiry, _line_notes, _missing_reason, NULL, NULL);
END; $$;

CREATE FUNCTION public.external_submit_delivery(_token_hash text, _delivery_id uuid, _notes text DEFAULT NULL, _actor_label text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order uuid; v_del_order uuid;
BEGIN
  v_order := public.resolve_order_share_token(_token_hash);
  SELECT order_id INTO v_del_order FROM public.purchase_deliveries WHERE id = _delivery_id;
  IF v_del_order IS NULL OR v_del_order <> v_order THEN RAISE EXCEPTION 'Dichiarazione non valida per questo codice'; END IF;
  RETURN public._delivery_submit_core(_delivery_id, _notes, NULL, _actor_label);
END; $$;

REVOKE ALL ON FUNCTION public.external_open_delivery(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.external_set_delivery_item(text, uuid, numeric, text, text, date, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.external_submit_delivery(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.external_open_delivery(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.external_set_delivery_item(text, uuid, numeric, text, text, date, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.external_submit_delivery(text, uuid, text, text) TO service_role;
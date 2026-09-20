-- chi può vedere/dichiarare su un ordine
CREATE OR REPLACE FUNCTION public.order_supplier_company(_order_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.seller_company_id
    FROM public.purchase_orders o
    JOIN public.supplier_customer_relations r ON r.id = o.relation_id
   WHERE o.id = _order_id AND r.status = 'attivo';
$$;

CREATE OR REPLACE FUNCTION public.is_order_supplier(_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_company_member(public.order_supplier_company(_order_id));
$$;

CREATE POLICY "orders_read_supplier" ON public.purchase_orders FOR SELECT TO authenticated
  USING (status <> 'bozza' AND public.is_order_supplier(id));
CREATE POLICY "order_items_read_supplier" ON public.purchase_order_items FOR SELECT TO authenticated
  USING (public.is_order_supplier(order_id));
CREATE POLICY "deliveries_read_supplier" ON public.purchase_deliveries FOR SELECT TO authenticated
  USING (public.is_order_supplier(order_id));
CREATE POLICY "delivery_items_read_supplier" ON public.purchase_delivery_items FOR SELECT TO authenticated
  USING (public.is_order_supplier((SELECT d.order_id FROM public.purchase_deliveries d WHERE d.id = delivery_id)));

-- accesso alla dichiarazione: acquirente o fornitore collegato
CREATE OR REPLACE FUNCTION public.can_declare_on_order(_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_company_member((SELECT company_id FROM public.purchase_orders WHERE id = _order_id))
      OR public.is_order_supplier(_order_id);
$$;

CREATE OR REPLACE FUNCTION public.open_purchase_delivery(
  _order_id uuid, _origin public.purchase_delivery_origin DEFAULT 'operatore_interno',
  _declared_by_name text DEFAULT NULL, _actor_user_id uuid DEFAULT NULL, _skip_access_check boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_o public.purchase_orders; v_id uuid; v_seq integer;
BEGIN
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = _order_id;
  IF v_o.id IS NULL THEN RAISE EXCEPTION 'Ordine non trovato'; END IF;
  IF NOT _skip_access_check AND NOT public.can_declare_on_order(_order_id) THEN
    RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _origin = 'fornitore_b2b' AND NOT public.is_order_supplier(_order_id) AND NOT _skip_access_check THEN
    RAISE EXCEPTION 'Origine non coerente con l''utente'; END IF;
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
    FROM public.purchase_order_items oi
   WHERE oi.order_id = _order_id;

  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.set_purchase_delivery_item(
  _delivery_item_id uuid, _declared_quantity numeric DEFAULT NULL, _declared_weight numeric DEFAULT NULL,
  _declared_producer text DEFAULT NULL, _declared_producer_lot text DEFAULT NULL,
  _declared_expiry date DEFAULT NULL, _line_notes text DEFAULT NULL, _missing_reason text DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL, _actor_label text DEFAULT NULL, _skip_access_check boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_it public.purchase_delivery_items; v_d public.purchase_deliveries; v_prev numeric;
BEGIN
  SELECT * INTO v_it FROM public.purchase_delivery_items WHERE id = _delivery_item_id;
  IF v_it.id IS NULL THEN RAISE EXCEPTION 'Riga non trovata'; END IF;
  SELECT * INTO v_d FROM public.purchase_deliveries WHERE id = v_it.delivery_id;
  IF NOT _skip_access_check AND NOT public.can_declare_on_order(v_d.order_id) THEN
    RAISE EXCEPTION 'Accesso non consentito'; END IF;
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

CREATE OR REPLACE FUNCTION public.add_purchase_delivery_extra_item(
  _delivery_id uuid, _product_id uuid, _declared_quantity numeric,
  _line_type public.purchase_delivery_line_type DEFAULT 'aggiunta_fornitore',
  _replaces_order_item_id uuid DEFAULT NULL, _unit_id uuid DEFAULT NULL, _unit_code text DEFAULT NULL,
  _declared_producer text DEFAULT NULL, _declared_producer_lot text DEFAULT NULL,
  _line_notes text DEFAULT NULL, _actor_user_id uuid DEFAULT NULL, _actor_label text DEFAULT NULL,
  _skip_access_check boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_d public.purchase_deliveries; v_id uuid;
BEGIN
  SELECT * INTO v_d FROM public.purchase_deliveries WHERE id = _delivery_id;
  IF v_d.id IS NULL THEN RAISE EXCEPTION 'Consegna non trovata'; END IF;
  IF NOT _skip_access_check AND NOT public.can_declare_on_order(v_d.order_id) THEN
    RAISE EXCEPTION 'Accesso non consentito'; END IF;
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
  VALUES (v_d.company_id, v_id, 'dichiarata', NULL, _declared_quantity, _line_notes, _actor_user_id, _actor_label);
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.submit_purchase_delivery(
  _delivery_id uuid, _notes text DEFAULT NULL, _actor_user_id uuid DEFAULT NULL,
  _actor_label text DEFAULT NULL, _skip_access_check boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_d public.purchase_deliveries;
BEGIN
  SELECT * INTO v_d FROM public.purchase_deliveries WHERE id = _delivery_id;
  IF v_d.id IS NULL THEN RAISE EXCEPTION 'Consegna non trovata'; END IF;
  IF NOT _skip_access_check AND NOT public.can_declare_on_order(v_d.order_id) THEN
    RAISE EXCEPTION 'Accesso non consentito'; END IF;
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

-- confronto leggibile anche dal fornitore collegato
CREATE OR REPLACE FUNCTION public.delivery_comparison(_delivery_id uuid)
RETURNS TABLE(
  delivery_item_id uuid, order_item_id uuid, product_id uuid, code text, description text,
  line_type text, ordered numeric, previously_declared numeric, declared numeric,
  difference numeric, unit_code text, declared_weight numeric, declared_producer text,
  declared_producer_lot text, declared_expiry date, line_notes text, missing_reason text,
  status text, accepted_quantity numeric, outcome text,
  dispute_id uuid, dispute_reason text, dispute_status text, dispute_notes text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT di.id, di.order_item_id, di.product_id, p.code, p.description,
         di.line_type::text,
         COALESCE(oi.ordered_quantity, 0),
         COALESCE((SELECT sum(x.declared_quantity) FROM public.purchase_delivery_items x
                    JOIN public.purchase_deliveries xd ON xd.id = x.delivery_id
                   WHERE x.order_item_id = di.order_item_id
                     AND di.order_item_id IS NOT NULL
                     AND xd.order_id = d.order_id
                     AND xd.status <> 'bozza'
                     AND xd.id <> d.id), 0),
         di.declared_quantity,
         di.declared_quantity - COALESCE(oi.ordered_quantity, 0),
         di.unit_code, di.declared_weight, di.declared_producer,
         di.declared_producer_lot, di.declared_expiry, di.line_notes, di.missing_reason,
         di.status::text, di.accepted_quantity,
         CASE
           WHEN di.line_type = 'aggiunta_fornitore' THEN 'aggiunta_fornitore'
           WHEN di.line_type = 'sostituzione' THEN 'sostituzione'
           WHEN di.declared_quantity = 0 THEN 'non_consegnata'
           WHEN di.declared_quantity < COALESCE(oi.ordered_quantity, 0) THEN 'inferiore'
           WHEN di.declared_quantity > COALESCE(oi.ordered_quantity, 0) THEN 'superiore'
           ELSE 'corretta'
         END,
         dd.id, dd.reason::text, dd.status::text, dd.notes
    FROM public.purchase_delivery_items di
    JOIN public.purchase_deliveries d ON d.id = di.delivery_id
    JOIN public.products p ON p.id = di.product_id
    LEFT JOIN public.purchase_order_items oi ON oi.id = di.order_item_id
    LEFT JOIN LATERAL (
      SELECT x.* FROM public.purchase_delivery_disputes x
       WHERE x.delivery_item_id = di.id ORDER BY x.opened_at DESC LIMIT 1
    ) dd ON true
   WHERE di.delivery_id = _delivery_id
     AND public.can_declare_on_order(d.order_id)
   ORDER BY p.code;
$$;

-- nessun accesso anonimo alle funzioni FASE D
REVOKE EXECUTE ON FUNCTION
  public.next_document_number(uuid, text),
  public.create_purchase_orders_from_list(uuid, uuid, uuid, uuid),
  public.manage_purchase_order(uuid, text, uuid, text, uuid),
  public.open_purchase_delivery(uuid, public.purchase_delivery_origin, text, uuid, boolean),
  public.set_purchase_delivery_item(uuid, numeric, numeric, text, text, date, text, text, uuid, text, boolean),
  public.add_purchase_delivery_extra_item(uuid, uuid, numeric, public.purchase_delivery_line_type, uuid, uuid, text, text, text, text, uuid, text, boolean),
  public.submit_purchase_delivery(uuid, text, uuid, text, boolean),
  public.accept_purchase_delivery(uuid, uuid),
  public.dispute_purchase_delivery_item(uuid, public.purchase_dispute_reason, text, uuid),
  public.resolve_purchase_delivery_dispute(uuid, text, numeric, text, uuid),
  public.open_goods_receipt(uuid, uuid),
  public.set_goods_receipt_item(uuid, numeric, text, text, date, numeric, text, uuid),
  public.confirm_goods_receipt(uuid, uuid),
  public.open_lot_reconciliation(uuid, uuid, text, uuid),
  public.resolve_lot_reconciliation(uuid, text, uuid, numeric, text, uuid),
  public.create_order_share_link(uuid, text, timestamptz, text, uuid),
  public.revoke_order_share_link(uuid, uuid),
  public.purchase_order_overview(uuid),
  public.delivery_comparison(uuid),
  public.product_lot_availability(uuid),
  public.product_lot_reconciliation(uuid, uuid),
  public.goods_receipt_history(uuid),
  public.order_supplier_company(uuid),
  public.is_order_supplier(uuid),
  public.can_declare_on_order(uuid),
  public.assert_order_items_frozen(),
  public.deny_history_write()
FROM anon;

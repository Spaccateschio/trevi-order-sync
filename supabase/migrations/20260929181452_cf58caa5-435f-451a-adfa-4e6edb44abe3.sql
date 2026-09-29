-- U.M. del prezzo: 6 colonne, NULL = non indicata. Nessun dato storico modificato.
ALTER TABLE public.product_supplier_links ADD COLUMN price_unit_id uuid REFERENCES public.units_of_measure(id) ON DELETE RESTRICT;
ALTER TABLE public.purchase_order_items ADD COLUMN price_unit_id uuid REFERENCES public.units_of_measure(id) ON DELETE RESTRICT,
  ADD COLUMN price_unit_code text;
ALTER TABLE public.goods_receipt_items ADD COLUMN price_unit_id uuid REFERENCES public.units_of_measure(id) ON DELETE RESTRICT,
  ADD COLUMN price_unit_code text,
  ADD COLUMN price_quantity numeric(18,6) CHECK (price_quantity IS NULL OR price_quantity > 0);

CREATE OR REPLACE FUNCTION public.guard_price_unit_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text; v_company uuid;
BEGIN
  IF NEW.price_unit_id IS NOT NULL THEN
    SELECT code, company_id INTO v_code, v_company FROM public.units_of_measure WHERE id = NEW.price_unit_id;
    IF v_company IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'U.M. del prezzo non valida'; END IF;
    IF TG_TABLE_NAME <> 'product_supplier_links' THEN NEW.price_unit_code := v_code; END IF;
  END IF;
  IF TG_TABLE_NAME <> 'product_supplier_links' THEN
    NEW.price_unit_code := NULLIF(btrim(COALESCE(NEW.price_unit_code, '')), '');
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_price_unit_company() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER product_supplier_links_price_unit_guard BEFORE INSERT OR UPDATE OF price_unit_id ON public.product_supplier_links
  FOR EACH ROW EXECUTE FUNCTION public.guard_price_unit_company();
CREATE TRIGGER purchase_order_items_price_unit_guard BEFORE INSERT OR UPDATE OF price_unit_id, price_unit_code ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_price_unit_company();
CREATE TRIGGER goods_receipt_items_price_unit_guard BEFORE INSERT OR UPDATE OF price_unit_id, price_unit_code ON public.goods_receipt_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_price_unit_company();

DROP FUNCTION public.manage_product_supplier_link(uuid, text, uuid, uuid, uuid, text, uuid, numeric, text, numeric, numeric, integer, text, boolean, text, smallint);

CREATE OR REPLACE FUNCTION public.manage_product_supplier_link(_company_id uuid, _action text, _link_id uuid DEFAULT NULL::uuid, _product_id uuid DEFAULT NULL::uuid, _supplier_record_id uuid DEFAULT NULL::uuid, _supplier_product_code text DEFAULT NULL::text, _purchase_unit_id uuid DEFAULT NULL::uuid, _conversion_factor numeric DEFAULT NULL::numeric, _conversion_reference_um text DEFAULT NULL::text, _manual_cost numeric DEFAULT NULL::numeric, _min_quantity numeric DEFAULT NULL::numeric, _lead_time_days integer DEFAULT NULL::integer, _notes text DEFAULT NULL::text, _is_preferred boolean DEFAULT NULL::boolean, _supplier_reference_label text DEFAULT NULL::text, _sourcing_priority smallint DEFAULT NULL::smallint, _price_unit_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_product uuid;
  v_previous_cost numeric;
  v_code text := NULLIF(btrim(COALESCE(_supplier_product_code, '')), '');
  v_label text := NULLIF(btrim(COALESCE(_supplier_reference_label, '')), '');
  v_sup uuid;
BEGIN
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Permessi insufficienti';
  END IF;

  IF _price_unit_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.units_of_measure WHERE id = _price_unit_id AND company_id = _company_id) THEN
      RAISE EXCEPTION 'U.M. del prezzo non valida';
    END IF;
    SELECT COALESCE(_supplier_record_id, (SELECT supplier_record_id FROM public.product_supplier_links WHERE id = _link_id)) INTO v_sup;
    IF EXISTS (SELECT 1 FROM public.supplier_customer_relations r
                WHERE r.supplier_record_id = v_sup AND r.buyer_company_id = _company_id AND r.status = 'attivo') THEN
      RAISE EXCEPTION 'Fornitore B2B: la U.M. del prezzo arriva dal catalogo del fornitore';
    END IF;
  END IF;

  IF _action = 'create' THEN
    IF _product_id IS NULL OR _supplier_record_id IS NULL THEN
      RAISE EXCEPTION 'Prodotto e fornitore obbligatori';
    END IF;

    SELECT id INTO v_id FROM public.product_supplier_links
    WHERE company_id = _company_id
      AND product_id = _product_id
      AND supplier_record_id = _supplier_record_id
      AND (
        (v_code IS NOT NULL AND supplier_product_code = v_code)
        OR (v_code IS NULL AND supplier_product_code IS NULL
            AND lower(btrim(COALESCE(supplier_reference_label, ''))) = lower(COALESCE(v_label, '')))
      )
    LIMIT 1;

    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;

    INSERT INTO public.product_supplier_links (
      company_id, product_id, supplier_record_id, supplier_product_code, purchase_unit_id,
      conversion_factor, conversion_reference_um, manual_cost, manual_cost_at, min_quantity,
      lead_time_days, notes, origin, created_by, is_preferred,
      supplier_reference_label, sourcing_priority, price_unit_id
    ) VALUES (
      _company_id, _product_id, _supplier_record_id, v_code, _purchase_unit_id,
      _conversion_factor, NULLIF(btrim(_conversion_reference_um), ''), _manual_cost,
      CASE WHEN _manual_cost IS NULL THEN NULL ELSE now() END, _min_quantity,
      _lead_time_days, NULLIF(btrim(_notes), ''), 'manuale', auth.uid(), false,
      v_label, _sourcing_priority, _price_unit_id
    )
    RETURNING id, product_id INTO v_id, v_product;

    INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id)
    VALUES (_company_id, auth.uid(), 'product_supplier_link.create', 'product_supplier_link', v_id);

    RETURN v_id;
  END IF;

  IF _link_id IS NULL THEN
    RAISE EXCEPTION 'Associazione non indicata';
  END IF;

  SELECT product_id, manual_cost INTO v_product, v_previous_cost
  FROM public.product_supplier_links
  WHERE id = _link_id AND company_id = _company_id;
  IF v_product IS NULL THEN
    RAISE EXCEPTION 'Associazione non trovata';
  END IF;

  IF _action = 'update' THEN
    UPDATE public.product_supplier_links SET
      supplier_product_code = v_code,
      supplier_reference_label = v_label,
      sourcing_priority = _sourcing_priority,
      purchase_unit_id = _purchase_unit_id,
      conversion_factor = _conversion_factor,
      conversion_reference_um = NULLIF(btrim(_conversion_reference_um), ''),
      manual_cost = _manual_cost,
      price_unit_id = _price_unit_id,
      manual_cost_at = CASE
        WHEN _manual_cost IS NULL THEN NULL
        WHEN v_previous_cost IS DISTINCT FROM _manual_cost THEN now()
        ELSE manual_cost_at END,
      min_quantity = _min_quantity,
      lead_time_days = _lead_time_days,
      notes = NULLIF(btrim(_notes), '')
    WHERE id = _link_id;
  ELSIF _action = 'set_priority' THEN
    UPDATE public.product_supplier_links SET sourcing_priority = _sourcing_priority WHERE id = _link_id;
  ELSIF _action = 'activate' THEN
    UPDATE public.product_supplier_links SET is_active = true WHERE id = _link_id;
  ELSIF _action = 'deactivate' THEN
    UPDATE public.product_supplier_links SET is_active = false WHERE id = _link_id;
  ELSIF _action = 'delete_link' THEN
    DELETE FROM public.product_supplier_links WHERE id = _link_id;
  ELSE
    RAISE EXCEPTION 'Azione non valida: %', _action;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id)
  VALUES (_company_id, auth.uid(), 'product_supplier_link.' || _action, 'product_supplier_link', _link_id);

  RETURN _link_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.manage_product_supplier_link(uuid, text, uuid, uuid, uuid, text, uuid, numeric, text, numeric, numeric, integer, text, boolean, text, smallint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_product_supplier_link(uuid, text, uuid, uuid, uuid, text, uuid, numeric, text, numeric, numeric, integer, text, boolean, text, smallint, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_purchase_orders_from_list(_company_id uuid, _list_id uuid, _destination_location_id uuid DEFAULT NULL::uuid, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_list public.shopping_lists;
  v_loc uuid;
  v_sup record;
  v_order uuid;
  v_ids jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_list FROM public.shopping_lists WHERE id = _list_id AND company_id = _company_id;
  IF v_list.id IS NULL THEN RAISE EXCEPTION 'Lista non trovata'; END IF;
  IF v_list.status <> 'confermata' THEN RAISE EXCEPTION 'La lista deve essere confermata prima di generare gli ordini'; END IF;
  IF EXISTS (SELECT 1 FROM public.purchase_orders WHERE shopping_list_id = _list_id) THEN
    RAISE EXCEPTION 'Ordini già generati per questa lista';
  END IF;

  v_loc := COALESCE(_destination_location_id, public.ensure_default_inventory_location(_company_id, _actor_user_id));
  IF NOT EXISTS (SELECT 1 FROM public.inventory_locations WHERE id = v_loc AND company_id = _company_id) THEN
    RAISE EXCEPTION 'Destinazione di ricezione non valida';
  END IF;

  FOR v_sup IN
    SELECT a.supplier_record_id
      FROM public.shopping_list_item_suppliers a
      JOIN public.shopping_list_items i ON i.id = a.item_id
     WHERE i.list_id = _list_id AND i.purchase_mode = 'fornitore'
     GROUP BY a.supplier_record_id
  LOOP
    INSERT INTO public.purchase_orders (company_id, archive_id, supplier_record_id, shopping_list_id,
      destination_location_id, number, created_by, relation_id)
    VALUES (_company_id, v_list.archive_id, v_sup.supplier_record_id, _list_id, v_loc,
      public.next_document_number(_company_id, 'ORD'), _actor_user_id,
      (SELECT r.id FROM public.supplier_customer_relations r
        WHERE r.supplier_record_id = v_sup.supplier_record_id AND r.buyer_company_id = _company_id
          AND r.status = 'attivo' LIMIT 1))
    RETURNING id INTO v_order;

    INSERT INTO public.purchase_order_items (order_id, company_id, product_id, product_supplier_link_id,
      ordered_quantity, unit_id, unit_code, purchase_quantity, purchase_unit_id, purchase_unit_code,
      conversion_factor, unit_cost, supplier_product_code, source_assignment_id, price_unit_id, price_unit_code)
    SELECT v_order, _company_id, i.product_id, a.product_supplier_link_id,
           a.assigned_quantity, i.unit_id, i.unit_code,
           a.purchase_quantity, a.purchase_unit_id, a.purchase_unit_code,
           a.conversion_factor, l.manual_cost, l.supplier_product_code, a.id,
           -- B2B: U.M. del prezzo dal prodotto del venditore, fotografata come testo; non B2B: dalla referenza
           CASE WHEN o.relation_id IS NULL THEN l.price_unit_id END,
           CASE WHEN o.relation_id IS NULL THEN NULL ELSE su.code END
      FROM public.shopping_list_item_suppliers a
      JOIN public.shopping_list_items i ON i.id = a.item_id
      JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
      JOIN public.purchase_orders o ON o.id = v_order
      LEFT JOIN public.products bp ON bp.id = i.product_id
      LEFT JOIN public.products sp ON sp.id = bp.created_from_product_id
      LEFT JOIN public.units_of_measure su ON su.id = sp.price_unit_id
     WHERE i.list_id = _list_id AND i.purchase_mode = 'fornitore'
       AND a.supplier_record_id = v_sup.supplier_record_id;

    v_ids := v_ids || to_jsonb(v_order);
    INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
    VALUES (_company_id, _actor_user_id, 'purchase_order.created_from_list', 'purchase_order', v_order,
            jsonb_build_object('list_id', _list_id));
  END LOOP;

  IF jsonb_array_length(v_ids) = 0 THEN RAISE EXCEPTION 'Nessuna assegnazione fornitore nella lista'; END IF;
  RETURN v_ids;
END; $function$;

CREATE OR REPLACE FUNCTION public.open_goods_receipt(_delivery_id uuid, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_d public.purchase_deliveries; v_o public.purchase_orders; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  SELECT * INTO v_d FROM public.purchase_deliveries WHERE id = _delivery_id;
  IF v_d.id IS NULL OR NOT public.is_company_member(v_d.company_id) THEN RAISE EXCEPTION 'Consegna non trovata'; END IF;
  IF v_d.status NOT IN ('accettata','chiusa_con_rifiuti') THEN
    RAISE EXCEPTION 'La consegna deve essere accettata prima del carico merce'; END IF;
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = v_d.order_id;

  SELECT id INTO v_id FROM public.goods_receipts WHERE delivery_id = _delivery_id LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.goods_receipts (company_id, archive_id, order_id, delivery_id, supplier_record_id,
    location_id, number, created_by)
  VALUES (v_o.company_id, v_o.archive_id, v_o.id, _delivery_id, v_o.supplier_record_id,
    v_o.destination_location_id, public.next_document_number(v_o.company_id, 'CAR'), _actor_user_id)
  RETURNING id INTO v_id;

  INSERT INTO public.goods_receipt_items (company_id, receipt_id, delivery_item_id, order_item_id, product_id,
    verified_quantity, unit_id, unit_code, unit_cost, producer_name, producer_lot_code, expiry_date,
    price_unit_id, price_unit_code)
  SELECT v_o.company_id, v_id, di.id, di.order_item_id, di.product_id,
         COALESCE(di.accepted_quantity, di.declared_quantity), di.unit_id, di.unit_code,
         oi.unit_cost, di.declared_producer, di.declared_producer_lot, di.declared_expiry,
         oi.price_unit_id, oi.price_unit_code
    FROM public.purchase_delivery_items di
    LEFT JOIN public.purchase_order_items oi ON oi.id = di.order_item_id
   WHERE di.delivery_id = _delivery_id
     AND di.status <> 'rifiutata'
     AND COALESCE(di.accepted_quantity, di.declared_quantity) > 0;

  RETURN v_id;
END; $function$;

DROP FUNCTION public.set_goods_receipt_item(uuid, numeric, text, text, date, numeric, text, uuid);

CREATE OR REPLACE FUNCTION public.set_goods_receipt_item(_receipt_item_id uuid, _verified_quantity numeric DEFAULT NULL::numeric, _producer_name text DEFAULT NULL::text, _producer_lot_code text DEFAULT NULL::text, _expiry_date date DEFAULT NULL::date, _unit_cost numeric DEFAULT NULL::numeric, _notes text DEFAULT NULL::text, _actor_user_id uuid DEFAULT NULL::uuid, _price_unit_id uuid DEFAULT NULL::uuid, _price_unit_code text DEFAULT NULL::text, _price_quantity numeric DEFAULT NULL::numeric, _clear_price_unit boolean DEFAULT false, _clear_price_quantity boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_it public.goods_receipt_items; v_status public.goods_receipt_status;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  SELECT * INTO v_it FROM public.goods_receipt_items WHERE id = _receipt_item_id;
  IF v_it.id IS NULL OR NOT public.is_company_member(v_it.company_id) THEN RAISE EXCEPTION 'Riga non trovata'; END IF;
  SELECT status INTO v_status FROM public.goods_receipts WHERE id = v_it.receipt_id;
  IF v_status <> 'bozza' THEN RAISE EXCEPTION 'Carico già confermato: non modificabile'; END IF;
  IF _verified_quantity IS NOT NULL AND _verified_quantity < 0 THEN RAISE EXCEPTION 'Quantità non valida'; END IF;
  IF _price_quantity IS NOT NULL AND _price_quantity <= 0 THEN RAISE EXCEPTION 'Quantità del prezzo non valida'; END IF;
  IF _price_unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.units_of_measure WHERE id = _price_unit_id AND company_id = v_it.company_id) THEN
    RAISE EXCEPTION 'U.M. del prezzo non valida';
  END IF;

  UPDATE public.goods_receipt_items
     SET verified_quantity = COALESCE(_verified_quantity, verified_quantity),
         producer_name = COALESCE(_producer_name, producer_name),
         producer_lot_code = COALESCE(_producer_lot_code, producer_lot_code),
         expiry_date = COALESCE(_expiry_date, expiry_date),
         unit_cost = COALESCE(_unit_cost, unit_cost),
         notes = COALESCE(_notes, notes),
         price_unit_id = CASE WHEN _clear_price_unit THEN NULL
                              WHEN _price_unit_id IS NOT NULL OR _price_unit_code IS NOT NULL THEN _price_unit_id
                              ELSE price_unit_id END,
         price_unit_code = CASE WHEN _clear_price_unit THEN NULL
                                WHEN _price_unit_id IS NOT NULL OR _price_unit_code IS NOT NULL THEN _price_unit_code
                                ELSE price_unit_code END,
         price_quantity = CASE WHEN _clear_price_quantity THEN NULL ELSE COALESCE(_price_quantity, price_quantity) END
   WHERE id = _receipt_item_id;
  RETURN _receipt_item_id;
END; $function$;

REVOKE ALL ON FUNCTION public.set_goods_receipt_item(uuid, numeric, text, text, date, numeric, text, uuid, uuid, text, numeric, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_goods_receipt_item(uuid, numeric, text, text, date, numeric, text, uuid, uuid, text, numeric, boolean, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.confirm_goods_receipt(_receipt_id uuid, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_r public.goods_receipts; v_it record; v_lot uuid; v_n integer := 0; v_ordered numeric; v_recv numeric;
        v_noeq_open integer;
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

  FOR v_it IN SELECT * FROM public.goods_receipt_items WHERE receipt_id = _receipt_id AND verified_quantity > 0
  LOOP
    v_n := v_n + 1;
    IF EXISTS (SELECT 1 FROM public.stock_lots WHERE goods_receipt_item_id = v_it.id) THEN CONTINUE; END IF;

    INSERT INTO public.stock_lots (company_id, archive_id, product_id, location_id, goods_receipt_item_id,
      supplier_record_id, internal_code, producer_name, producer_lot_code, unit_cost, unit_id, unit_code,
      initial_quantity, entered_at, expiry_date)
    VALUES (v_r.company_id, v_r.archive_id, v_it.product_id, v_r.location_id, v_it.id,
      v_r.supplier_record_id, v_r.number || '-' || lpad(v_n::text, 3, '0'),
      v_it.producer_name, v_it.producer_lot_code,
      -- costo per 1 U.M. di magazzino = (quantità prezzo x prezzo) / quantità caricata; altrimenti vuoto
      CASE WHEN v_it.unit_cost IS NOT NULL AND v_it.price_unit_code IS NOT NULL
                AND v_it.price_quantity IS NOT NULL AND v_it.verified_quantity > 0
           THEN round(v_it.price_quantity * v_it.unit_cost / v_it.verified_quantity, 6) END,
      v_it.unit_id, v_it.unit_code,
      v_it.verified_quantity, v_r.received_at, v_it.expiry_date)
    RETURNING id INTO v_lot;

    INSERT INTO public.inventory_movements (company_id, archive_id, product_id, location_id, stock_lot_id,
      movement_type, quantity, unit_id, unit_code, source_table, source_id, created_by)
    VALUES (v_r.company_id, v_r.archive_id, v_it.product_id, v_r.location_id, v_lot,
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

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_r.company_id, _actor_user_id, 'goods_receipt.confirmed', 'goods_receipt', _receipt_id, NULL);
  RETURN _receipt_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.hook_price_from_goods_receipt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record;
BEGIN
  IF NEW.status <> 'confermato' OR OLD.status = 'confermato' THEN RETURN NEW; END IF;

  FOR r IN
    SELECT i.id, i.product_id, i.unit_cost, i.price_unit_code, p.code AS product_code,
           l.id AS link_id, l.supplier_product_code
    FROM public.goods_receipt_items i
    JOIN public.products p ON p.id = i.product_id
    LEFT JOIN public.product_supplier_links l
      ON l.company_id = i.company_id AND l.product_id = i.product_id
     AND l.supplier_record_id = NEW.supplier_record_id
    WHERE i.receipt_id = NEW.id AND i.unit_cost IS NOT NULL
  LOOP
    PERFORM public.record_price_observation(
      _company_id => NEW.company_id,
      _source => 'goods_receipt',
      _kind => 'actual_purchase_cost',
      _supplier_record_id => NEW.supplier_record_id,
      _supplier_reference => COALESCE(NULLIF(r.supplier_product_code, ''), r.product_code),
      _net_price => r.unit_cost,
      _price_basis => 'netto',
      _price_unit_code => r.price_unit_code,
      _source_event_key => 'goods_receipt:' || r.id::text,
      _source_ref_table => 'goods_receipt_items',
      _source_ref_id => r.id,
      _product_id => r.product_id,
      _product_supplier_link_id => r.link_id,
      _observed_at => COALESCE(NEW.confirmed_at, NEW.received_at, now())
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hook_price_from_supplier_cost()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_product public.products;
  v_unit text;
  v_link public.product_supplier_links;
BEGIN
  IF NEW.supplier_net_price IS NULL AND NEW.supplier_gross_price IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = NEW.product_id;
  -- Danea non dichiara la U.M. del costo fornitore: resta non indicata
  v_unit := NULL;

  SELECT * INTO v_link FROM public.product_supplier_links l
  WHERE l.company_id = NEW.company_id AND l.product_id = NEW.product_id
    AND COALESCE(l.supplier_product_code, '') = COALESCE(NEW.supplier_product_code, '')
  ORDER BY l.created_at LIMIT 1;

  PERFORM public.record_price_observation(
    _company_id => NEW.company_id,
    _source => 'danea_supplier_cost',
    _kind => 'observed_price',
    _supplier_record_id => v_link.supplier_record_id,
    _supplier_label => COALESCE(NEW.supplier_name, NEW.supplier_code),
    _supplier_reference => COALESCE(NULLIF(NEW.supplier_product_code, ''), v_product.code),
    _net_price => NEW.supplier_net_price,
    _gross_price => NEW.supplier_gross_price,
    _price_basis => CASE WHEN NEW.supplier_net_price IS NOT NULL THEN 'netto'::public.price_basis
                         ELSE 'lordo'::public.price_basis END,
    _price_unit_code => v_unit,
    _source_ref_table => 'product_supplier_costs',
    _source_ref_id => NEW.id,
    _product_id => NEW.product_id,
    _product_supplier_link_id => v_link.id,
    _observed_at => COALESCE(NEW.received_at, now())
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hook_price_from_manual_cost()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_product public.products;
  v_unit text;
BEGIN
  IF NEW.manual_cost IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.manual_cost IS NOT DISTINCT FROM OLD.manual_cost
     AND NEW.price_unit_id IS NOT DISTINCT FROM OLD.price_unit_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = NEW.product_id;
  SELECT u.code INTO v_unit FROM public.units_of_measure u WHERE u.id = NEW.price_unit_id;

  PERFORM public.record_price_observation(
    _company_id => NEW.company_id,
    _source => 'manual_cost',
    _kind => 'observed_price',
    _supplier_record_id => NEW.supplier_record_id,
    _supplier_reference => COALESCE(NULLIF(NEW.supplier_product_code, ''), v_product.code),
    _net_price => NEW.manual_cost,
    _price_basis => 'netto',
    _price_unit_code => v_unit,
    _conversion_factor => NEW.conversion_factor,
    _conversion_reference_um => NEW.conversion_reference_um,
    _source_ref_table => 'product_supplier_links',
    _source_ref_id => NEW.id,
    _product_id => NEW.product_id,
    _product_supplier_link_id => NEW.id,
    _observed_at => COALESCE(NEW.manual_cost_at, now())
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER product_supplier_links_price_history ON public.product_supplier_links;
CREATE TRIGGER product_supplier_links_price_history AFTER INSERT OR UPDATE OF manual_cost, manual_cost_at, price_unit_id ON public.product_supplier_links FOR EACH ROW EXECUTE FUNCTION hook_price_from_manual_cost();
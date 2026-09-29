ALTER TABLE public.shopping_list_items ALTER COLUMN decided_quantity DROP NOT NULL;
ALTER TABLE public.shopping_list_items
  ADD CONSTRAINT shopping_list_items_decided_positive CHECK (decided_quantity IS NULL OR decided_quantity > 0),
  ADD COLUMN purchase_mode text NOT NULL DEFAULT 'fornitore',
  ADD COLUMN manual_purchase_quantity numeric(14,3),
  ADD COLUMN manual_purchase_unit_id uuid REFERENCES public.units_of_measure(id),
  ADD COLUMN manual_purchase_unit_code text,
  ADD COLUMN manual_purchase_done_at timestamptz,
  ADD COLUMN manual_purchase_done_by uuid;
ALTER TABLE public.shopping_list_items
  ADD CONSTRAINT shopping_list_items_purchase_mode_check CHECK (purchase_mode IN ('fornitore','manuale')),
  ADD CONSTRAINT shopping_list_items_manual_qty_check CHECK (manual_purchase_quantity IS NULL OR manual_purchase_quantity > 0);

ALTER TABLE public.shopping_list_item_suppliers ALTER COLUMN assigned_quantity DROP NOT NULL;
ALTER TABLE public.shopping_list_item_suppliers DROP CONSTRAINT IF EXISTS shopping_list_item_suppliers_qty;
ALTER TABLE public.shopping_list_item_suppliers
  ADD CONSTRAINT shopping_list_item_suppliers_assigned_quantity_check CHECK (assigned_quantity IS NULL OR assigned_quantity > 0),
  ADD COLUMN conversion_type public.sale_conversion_type;
DROP INDEX IF EXISTS public.shopping_list_item_suppliers_unique;
CREATE UNIQUE INDEX shopping_list_item_suppliers_unique
  ON public.shopping_list_item_suppliers (item_id, product_supplier_link_id,
     COALESCE(purchase_unit_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE OR REPLACE FUNCTION public.assert_assignment_purchase_data()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.purchase_quantity IS NULL OR NEW.purchase_quantity <= 0 OR NEW.purchase_unit_id IS NULL THEN
    RAISE EXCEPTION 'Ripartizione non valida: servono quantità e U.M. d''acquisto';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.assert_assignment_purchase_data() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER shopping_list_item_suppliers_purchase_data
  BEFORE INSERT OR UPDATE ON public.shopping_list_item_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.assert_assignment_purchase_data();

ALTER TABLE public.purchase_order_items ALTER COLUMN ordered_quantity DROP NOT NULL;
ALTER TABLE public.purchase_order_items DROP CONSTRAINT IF EXISTS purchase_order_items_ordered_quantity_check;
ALTER TABLE public.purchase_order_items
  ADD CONSTRAINT purchase_order_items_ordered_quantity_check CHECK (ordered_quantity IS NULL OR ordered_quantity > 0),
  ADD COLUMN source_assignment_id uuid REFERENCES public.shopping_list_item_suppliers(id);
CREATE INDEX purchase_order_items_source_assignment ON public.purchase_order_items (source_assignment_id);

ALTER TABLE public.purchase_delivery_items ALTER COLUMN declared_quantity DROP NOT NULL;
ALTER TABLE public.purchase_delivery_items
  ADD COLUMN declared_purchase_quantity numeric CHECK (declared_purchase_quantity IS NULL OR declared_purchase_quantity >= 0),
  ADD COLUMN accepted_purchase_quantity numeric CHECK (accepted_purchase_quantity IS NULL OR accepted_purchase_quantity >= 0),
  ADD COLUMN purchase_unit_id uuid REFERENCES public.units_of_measure(id),
  ADD COLUMN purchase_unit_code text;

DROP FUNCTION public.assign_shopping_list_supplier(uuid, uuid, text, uuid, numeric, numeric, boolean, text, uuid, uuid);
CREATE FUNCTION public.assign_shopping_list_supplier(
  _company_id uuid, _item_id uuid, _action text, _link_id uuid DEFAULT NULL,
  _assigned_quantity numeric DEFAULT NULL, _purchase_quantity numeric DEFAULT NULL,
  _min_warning_accepted boolean DEFAULT false, _notes text DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL, _purchase_unit_id uuid DEFAULT NULL,
  _assignment_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_item record;
  v_link record;
  v_unit_id uuid;
  v_unit_code text;
  v_factor numeric;
  v_ctype public.sale_conversion_type;
  v_qty numeric;
  v_equiv numeric;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT i.id, i.product_id, i.unit_id, i.unit_code INTO v_item FROM public.shopping_list_items i
   WHERE i.id = _item_id AND i.company_id = _company_id;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Riga non trovata'; END IF;

  IF _action = 'remove' THEN
    IF _assignment_id IS NOT NULL THEN
      DELETE FROM public.shopping_list_item_suppliers WHERE id = _assignment_id AND item_id = _item_id;
    ELSE
      DELETE FROM public.shopping_list_item_suppliers WHERE item_id = _item_id AND product_supplier_link_id = _link_id;
    END IF;
    RETURN _item_id;
  ELSIF _action <> 'set' THEN
    RAISE EXCEPTION 'Azione non valida';
  END IF;

  SELECT l.* INTO v_link FROM public.product_supplier_links l
   WHERE l.id = _link_id AND l.company_id = _company_id AND l.product_id = v_item.product_id;
  IF v_link.id IS NULL THEN RAISE EXCEPTION 'Fornitore non associato a questo prodotto'; END IF;
  IF NOT v_link.is_active THEN RAISE EXCEPTION 'Associazione fornitore non attiva'; END IF;

  IF _purchase_quantity IS NOT NULL THEN
    v_qty := _purchase_quantity;
    v_unit_id := COALESCE(_purchase_unit_id, v_link.purchase_unit_id, v_item.unit_id);
  ELSIF _assigned_quantity IS NOT NULL THEN
    v_qty := _assigned_quantity;
    v_unit_id := v_item.unit_id;
  END IF;
  IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'Quantità d''acquisto non valida'; END IF;
  IF v_unit_id IS NULL THEN RAISE EXCEPTION 'U.M. d''acquisto obbligatoria'; END IF;

  IF v_unit_id = v_item.unit_id THEN
    v_unit_code := v_item.unit_code; v_factor := 1; v_ctype := 'esatta'; v_equiv := v_qty;
  ELSE
    SELECT um.code, lu.conversion_factor, lu.conversion_type INTO v_unit_code, v_factor, v_ctype
      FROM public.product_supplier_link_units lu
      JOIN public.units_of_measure um ON um.id = lu.unit_id
     WHERE lu.link_id = v_link.id AND lu.unit_id = v_unit_id AND lu.is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'U.M. di acquisto non abilitata per questa referenza'; END IF;
    v_equiv := CASE WHEN v_factor IS NOT NULL AND v_factor > 0 THEN round(v_qty * v_factor, 3) END;
    IF v_factor IS NULL THEN v_ctype := NULL; END IF;
  END IF;

  IF _assignment_id IS NOT NULL THEN
    UPDATE public.shopping_list_item_suppliers
       SET product_supplier_link_id = v_link.id, supplier_record_id = v_link.supplier_record_id,
           assigned_quantity = v_equiv, purchase_quantity = v_qty, purchase_unit_id = v_unit_id,
           purchase_unit_code = v_unit_code, conversion_factor = v_factor, conversion_type = v_ctype,
           min_warning_accepted = COALESCE(_min_warning_accepted, false),
           min_warning_accepted_by = CASE WHEN _min_warning_accepted THEN _actor_user_id END,
           min_warning_accepted_at = CASE WHEN _min_warning_accepted THEN now() END,
           notes = _notes
     WHERE id = _assignment_id AND item_id = _item_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Ripartizione non trovata'; END IF;
    RETURN v_id;
  END IF;

  SELECT id INTO v_id FROM public.shopping_list_item_suppliers
   WHERE item_id = _item_id AND product_supplier_link_id = v_link.id AND purchase_unit_id = v_unit_id;

  IF v_id IS NOT NULL THEN
    UPDATE public.shopping_list_item_suppliers
       SET assigned_quantity = v_equiv, purchase_quantity = v_qty, purchase_unit_code = v_unit_code,
           conversion_factor = v_factor, conversion_type = v_ctype,
           min_warning_accepted = COALESCE(_min_warning_accepted, false),
           min_warning_accepted_by = CASE WHEN _min_warning_accepted THEN _actor_user_id END,
           min_warning_accepted_at = CASE WHEN _min_warning_accepted THEN now() END,
           notes = _notes
     WHERE id = v_id;
  ELSE
    INSERT INTO public.shopping_list_item_suppliers (
      company_id, item_id, product_supplier_link_id, supplier_record_id,
      assigned_quantity, purchase_quantity, purchase_unit_id, purchase_unit_code, conversion_factor, conversion_type,
      min_warning_accepted, min_warning_accepted_by, min_warning_accepted_at, notes, created_by)
    VALUES (_company_id, _item_id, v_link.id, v_link.supplier_record_id,
      v_equiv, v_qty, v_unit_id, v_unit_code, v_factor, v_ctype,
      COALESCE(_min_warning_accepted, false),
      CASE WHEN _min_warning_accepted THEN _actor_user_id END,
      CASE WHEN _min_warning_accepted THEN now() END,
      _notes, _actor_user_id)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $function$;
REVOKE ALL ON FUNCTION public.assign_shopping_list_supplier(uuid, uuid, text, uuid, numeric, numeric, boolean, text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_shopping_list_supplier(uuid, uuid, text, uuid, numeric, numeric, boolean, text, uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.shopping_list_item_state(_item_id uuid)
 RETURNS TABLE(assigned numeric, remaining numeric, status text, untranslatable integer, under_minimum integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  WITH item AS (
    SELECT i.id, i.decided_quantity, i.purchase_mode FROM public.shopping_list_items i WHERE i.id = _item_id
  ), asg AS (
    SELECT a.assigned_quantity, a.purchase_quantity, a.purchase_unit_id, l.min_quantity, a.min_warning_accepted,
           ((a.purchase_quantity > 0 AND a.purchase_unit_id IS NOT NULL)
             OR (a.purchase_quantity IS NULL AND a.assigned_quantity > 0)) AS valid
      FROM public.shopping_list_item_suppliers a
      JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
     WHERE a.item_id = _item_id
  ), agg AS (
    SELECT COALESCE(sum(assigned_quantity), 0) AS assigned,
           COUNT(*) FILTER (WHERE valid) AS valid_n,
           COUNT(*) FILTER (WHERE assigned_quantity IS NULL)::int AS untranslatable,
           COUNT(*) FILTER (
             WHERE min_quantity IS NOT NULL AND assigned_quantity IS NOT NULL
               AND assigned_quantity < min_quantity AND NOT min_warning_accepted)::int AS under_minimum
      FROM asg
  )
  SELECT agg.assigned,
         item.decided_quantity - agg.assigned,
         CASE
           WHEN item.purchase_mode = 'manuale' THEN 'manuale'
           WHEN agg.valid_n = 0 THEN 'da_assegnare'
           WHEN item.decided_quantity IS NOT NULL AND agg.untranslatable = 0
                AND agg.assigned < item.decided_quantity THEN 'parziale'
           ELSE 'assegnata'
         END,
         agg.untranslatable,
         agg.under_minimum
    FROM item CROSS JOIN agg;
$function$;

CREATE OR REPLACE FUNCTION public.set_shopping_list_item_quantity(_company_id uuid, _item_id uuid, _decided_quantity numeric, _reason text DEFAULT NULL::text, _notes text DEFAULT NULL::text, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _decided_quantity IS NOT NULL AND _decided_quantity <= 0 THEN RAISE EXCEPTION 'Quantità non valida'; END IF;

  UPDATE public.shopping_list_items
     SET decided_quantity = _decided_quantity,
         change_reason = COALESCE(NULLIF(btrim(_reason), ''), change_reason),
         notes = COALESCE(_notes, notes),
         decided_by = _actor_user_id,
         decided_at = now()
   WHERE id = _item_id AND company_id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Riga non trovata'; END IF;
  RETURN _item_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.add_shopping_list_items(_company_id uuid, _list_id uuid, _items jsonb, _replace_existing boolean DEFAULT false, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_archive uuid;
  v_added integer := 0;
  v_skipped integer := 0;
  v_updated integer := 0;
  it jsonb;
  v_product uuid;
  v_unit_id uuid;
  v_unit_code text;
  v_decided numeric;
  v_suggested numeric;
  v_exists uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  SELECT archive_id INTO v_archive FROM public.shopping_lists
   WHERE id = _list_id AND company_id = _company_id AND status = 'aperta';
  IF v_archive IS NULL THEN RAISE EXCEPTION 'Lista non trovata o non più aperta'; END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) LOOP
    v_product := (it->>'product_id')::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM public.products
       WHERE id = v_product AND company_id = _company_id AND archive_id = v_archive
    ) THEN
      RAISE EXCEPTION 'Prodotto non valido per questo archivio';
    END IF;

    v_suggested := NULLIF(it->>'suggested_quantity', '')::numeric;
    -- La quantità decisa è facoltativa: vuota resta vuota (mai 0).
    v_decided := COALESCE(NULLIF(it->>'decided_quantity', '')::numeric, v_suggested);
    IF v_decided IS NOT NULL AND v_decided <= 0 THEN
      v_decided := NULL;
    END IF;

    SELECT s.stock_unit_id, COALESCE(u.code, p.danea_um)
      INTO v_unit_id, v_unit_code
      FROM public.products p
      LEFT JOIN public.product_stock_settings s ON s.product_id = p.id
      LEFT JOIN public.units_of_measure u ON u.id = s.stock_unit_id
     WHERE p.id = v_product;

    SELECT id INTO v_exists FROM public.shopping_list_items
     WHERE list_id = _list_id AND product_id = v_product;

    IF v_exists IS NOT NULL THEN
      IF _replace_existing THEN
        UPDATE public.shopping_list_items
           SET suggested_quantity = v_suggested,
               snapshot_available = NULLIF(it->>'available', '')::numeric,
               snapshot_needed = NULLIF(it->>'needed', '')::numeric,
               snapshot_min_stock = NULLIF(it->>'min_stock', '')::numeric,
               snapshot_raw_need = NULLIF(it->>'raw_need', '')::numeric,
               snapshot_order_multiple = NULLIF(it->>'order_multiple', '')::numeric
         WHERE id = v_exists;
        v_updated := v_updated + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
      CONTINUE;
    END IF;

    INSERT INTO public.shopping_list_items (
      company_id, list_id, product_id, unit_id, unit_code,
      suggested_quantity, decided_quantity, origin,
      snapshot_available, snapshot_needed, snapshot_min_stock, snapshot_raw_need, snapshot_order_multiple,
      created_by, decided_by, decided_at
    )
    VALUES (
      _company_id, _list_id, v_product, v_unit_id, v_unit_code,
      v_suggested, v_decided,
      COALESCE(NULLIF(it->>'origin', '')::public.shopping_list_item_origin, 'manuale'),
      NULLIF(it->>'available', '')::numeric,
      NULLIF(it->>'needed', '')::numeric,
      NULLIF(it->>'min_stock', '')::numeric,
      NULLIF(it->>'raw_need', '')::numeric,
      NULLIF(it->>'order_multiple', '')::numeric,
      _actor_user_id, CASE WHEN v_decided IS NOT NULL THEN _actor_user_id END, CASE WHEN v_decided IS NOT NULL THEN now() END
    );
    v_added := v_added + 1;
  END LOOP;

  RETURN jsonb_build_object('added', v_added, 'skipped', v_skipped, 'updated', v_updated);
END;
$function$;

CREATE OR REPLACE FUNCTION public.manage_shopping_list(_company_id uuid, _action text, _list_id uuid DEFAULT NULL::uuid, _archive_id uuid DEFAULT NULL::uuid, _name text DEFAULT NULL::text, _notes text DEFAULT NULL::text, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_id uuid;
  v_bad text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;

  IF _action = 'open' THEN
    IF _archive_id IS NULL THEN RAISE EXCEPTION 'Archivio obbligatorio'; END IF;
    INSERT INTO public.shopping_lists (company_id, archive_id, name, notes, created_by)
    VALUES (_company_id, _archive_id,
            COALESCE(NULLIF(btrim(_name), ''), 'Lista ' || to_char(now(), 'DD/MM/YYYY HH24:MI')),
            _notes, _actor_user_id)
    RETURNING id INTO v_id;
  ELSE
    SELECT id INTO v_id FROM public.shopping_lists WHERE id = _list_id AND company_id = _company_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Lista non trovata'; END IF;

    IF _action = 'rename' THEN
      UPDATE public.shopping_lists
         SET name = COALESCE(NULLIF(btrim(_name), ''), name), notes = COALESCE(_notes, notes)
       WHERE id = v_id;
    ELSIF _action = 'confirm' THEN
      SELECT string_agg(p.code, ', ' ORDER BY p.code) INTO v_bad
        FROM public.shopping_list_items i
        JOIN public.products p ON p.id = i.product_id
        CROSS JOIN LATERAL public.shopping_list_item_state(i.id) s
       WHERE i.list_id = v_id AND i.purchase_mode = 'fornitore' AND s.status = 'da_assegnare';
      IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'Prodotti senza fornitore, quantità e U.M. d''acquisto: %', v_bad;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.shopping_list_items WHERE list_id = v_id) THEN
        RAISE EXCEPTION 'La lista è vuota';
      END IF;
      UPDATE public.shopping_lists
         SET status = 'confermata', confirmed_at = now(), confirmed_by = _actor_user_id
       WHERE id = v_id AND status = 'aperta';
    ELSIF _action = 'close' THEN
      UPDATE public.shopping_lists SET status = 'chiusa', closed_at = now()
       WHERE id = v_id AND status IN ('aperta', 'confermata');
    ELSIF _action = 'cancel' THEN
      UPDATE public.shopping_lists SET status = 'annullata', closed_at = now()
       WHERE id = v_id AND status = 'aperta';
    ELSE
      RAISE EXCEPTION 'Azione non valida';
    END IF;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, _actor_user_id, 'shopping_list.' || _action, 'shopping_list', v_id, NULL);

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_purchase_orders_from_list(_company_id uuid, _list_id uuid, _destination_location_id uuid DEFAULT NULL::uuid, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
      conversion_factor, unit_cost, supplier_product_code, source_assignment_id)
    SELECT v_order, _company_id, i.product_id, a.product_supplier_link_id,
           a.assigned_quantity, i.unit_id, i.unit_code,
           a.purchase_quantity, a.purchase_unit_id, a.purchase_unit_code,
           a.conversion_factor, l.manual_cost, l.supplier_product_code, a.id
      FROM public.shopping_list_item_suppliers a
      JOIN public.shopping_list_items i ON i.id = a.item_id
      JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
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

DROP FUNCTION public.purchase_order_overview(uuid);
CREATE FUNCTION public.purchase_order_overview(_company_id uuid)
 RETURNS TABLE(order_id uuid, number text, status text, supplier_record_id uuid, supplier_name text, destination_location_id uuid, destination_name text, archive_id uuid, lines integer, ordered_total numeric, declared_total numeric, received_total numeric, deliveries integer, open_disputes integer, sent_at timestamp with time zone, created_at timestamp with time zone, notes text, lines_without_equivalent integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  SELECT o.id, o.number, o.status::text, o.supplier_record_id, sr.legal_name,
         o.destination_location_id, loc.name, o.archive_id,
         (SELECT count(*)::int FROM public.purchase_order_items i WHERE i.order_id = o.id),
         COALESCE((SELECT sum(i.ordered_quantity) FROM public.purchase_order_items i WHERE i.order_id = o.id), 0),
         COALESCE((SELECT sum(di.declared_quantity) FROM public.purchase_delivery_items di
                    JOIN public.purchase_deliveries d ON d.id = di.delivery_id
                   WHERE d.order_id = o.id AND d.status <> 'bozza'), 0),
         COALESCE((SELECT sum(ri.verified_quantity) FROM public.goods_receipt_items ri
                    JOIN public.goods_receipts r ON r.id = ri.receipt_id
                   WHERE r.order_id = o.id AND r.status = 'confermato'), 0),
         (SELECT count(*)::int FROM public.purchase_deliveries d WHERE d.order_id = o.id),
         (SELECT count(*)::int FROM public.purchase_delivery_disputes dd
            JOIN public.purchase_delivery_items di ON di.id = dd.delivery_item_id
            JOIN public.purchase_deliveries d ON d.id = di.delivery_id
           WHERE d.order_id = o.id AND dd.status = 'aperta'),
         o.sent_at, o.created_at, o.notes,
         (SELECT count(*)::int FROM public.purchase_order_items i WHERE i.order_id = o.id AND i.ordered_quantity IS NULL)
    FROM public.purchase_orders o
    JOIN public.supplier_records sr ON sr.id = o.supplier_record_id
    JOIN public.inventory_locations loc ON loc.id = o.destination_location_id
   WHERE o.company_id = _company_id
     AND public.is_company_member(o.company_id)
   ORDER BY o.created_at DESC;
$function$;
REVOKE ALL ON FUNCTION public.purchase_order_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_order_overview(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.external_order_snapshot(_token_hash text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_order uuid; v_o public.purchase_orders;
BEGIN
  v_order := public.resolve_order_share_token(_token_hash);
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = v_order;
  RETURN jsonb_build_object(
    'order_id', v_o.id,
    'number', v_o.number,
    'status', v_o.status,
    'buyer', (SELECT legal_name FROM public.companies WHERE id = v_o.company_id),
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'order_item_id', oi.id, 'code', p.code, 'description', p.description,
        'ordered_quantity', oi.ordered_quantity, 'unit_code', oi.unit_code,
        'purchase_quantity', oi.purchase_quantity, 'purchase_unit_code', oi.purchase_unit_code,
        'supplier_product_code', oi.supplier_product_code) ORDER BY p.code)
      FROM public.purchase_order_items oi JOIN public.products p ON p.id = oi.product_id
     WHERE oi.order_id = v_o.id), '[]'::jsonb));
END; $function$;

CREATE OR REPLACE FUNCTION public.inventory_purchase_cycle_status(_company_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_open_id uuid;
  v_last record;
  v_list_id uuid;
  v_list_name text;
  v_list_status text;
  v_link_valid boolean := false;
  v_items int := 0;
  v_missing int := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;

  SELECT id INTO v_open_id FROM public.inventory_sessions
   WHERE company_id = _company_id AND status = 'in_corso'
   ORDER BY started_at DESC LIMIT 1;
  IF v_open_id IS NOT NULL THEN
    RETURN jsonb_build_object('color', 'giallo', 'open_session_id', v_open_id);
  END IF;

  SELECT id, name, finished_at, purchase_list_id, purchase_evaluated_at INTO v_last
    FROM public.inventory_sessions
   WHERE company_id = _company_id AND status = 'completata'
   ORDER BY finished_at DESC NULLS LAST LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('color', 'verde');
  END IF;

  IF v_last.purchase_list_id IS NOT NULL THEN
    SELECT id, name, status::text INTO v_list_id, v_list_name, v_list_status FROM public.shopping_lists
     WHERE id = v_last.purchase_list_id AND company_id = _company_id;
    v_link_valid := v_list_id IS NOT NULL AND v_list_status <> 'annullata'
      AND (v_list_status <> 'chiusa' OR v_last.purchase_evaluated_at IS NOT NULL);
  END IF;

  IF v_link_valid THEN
    SELECT count(*) INTO v_items FROM public.shopping_list_items WHERE list_id = v_list_id;

    SELECT count(*) INTO v_missing FROM (
      SELECT i.product_id, a.product_supplier_link_id, sum(a.assigned_quantity) AS q
        FROM public.shopping_list_item_suppliers a
        JOIN public.shopping_list_items i ON i.id = a.item_id
       WHERE i.list_id = v_list_id AND i.purchase_mode = 'fornitore' AND a.assigned_quantity IS NOT NULL
       GROUP BY 1, 2
    ) need
    WHERE COALESCE((
      SELECT sum(oi.ordered_quantity) FROM public.purchase_order_items oi
        JOIN public.purchase_orders o ON o.id = oi.order_id
       WHERE o.shopping_list_id = v_list_id AND o.status <> 'annullato'
         AND oi.product_id = need.product_id
         AND oi.product_supplier_link_id = need.product_supplier_link_id
    ), 0) < need.q;

    v_missing := v_missing + (
      SELECT count(*) FROM public.shopping_list_item_suppliers a
        JOIN public.shopping_list_items i ON i.id = a.item_id
       WHERE i.list_id = v_list_id AND i.purchase_mode = 'fornitore' AND a.assigned_quantity IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.purchase_order_items oi
             JOIN public.purchase_orders o ON o.id = oi.order_id
            WHERE o.shopping_list_id = v_list_id AND o.status <> 'annullato'
              AND (oi.source_assignment_id = a.id
                   OR (oi.product_supplier_link_id = a.product_supplier_link_id
                       AND oi.purchase_unit_id = a.purchase_unit_id))
              AND oi.purchase_quantity >= a.purchase_quantity));

    -- Righe «manuale» restano non coperte: il futuro evento manual_purchase_done_at sarà l'unica condizione da aggiungere qui.
    v_missing := v_missing + (
      SELECT count(*) FROM public.shopping_list_items i
       WHERE i.list_id = v_list_id
         AND (i.purchase_mode = 'manuale'
              OR NOT EXISTS (SELECT 1 FROM public.shopping_list_item_suppliers a WHERE a.item_id = i.id)));
  END IF;

  RETURN jsonb_build_object(
    'color', CASE WHEN v_link_valid AND v_last.purchase_evaluated_at IS NOT NULL AND v_missing = 0
                  THEN 'verde' ELSE 'rosso' END,
    'session_id', v_last.id,
    'session_name', v_last.name,
    'finished_at', v_last.finished_at,
    'evaluated_at', v_last.purchase_evaluated_at,
    'list_id', CASE WHEN v_link_valid THEN v_list_id END,
    'list_name', CASE WHEN v_link_valid THEN v_list_name END,
    'list_status', CASE WHEN v_link_valid THEN v_list_status END,
    'list_items', v_items,
    'missing_orders', v_missing
  );
END; $function$;

CREATE OR REPLACE FUNCTION public._delivery_open_core(_order_id uuid, _origin purchase_delivery_origin, _declared_by_name text, _actor_user_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
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
    declared_quantity, unit_id, unit_code,
    declared_purchase_quantity, purchase_unit_id, purchase_unit_code)
  SELECT v_o.company_id, v_id, oi.id, oi.product_id,
         CASE WHEN oi.ordered_quantity IS NULL THEN NULL ELSE
         greatest(0, oi.ordered_quantity - COALESCE((
            SELECT sum(x.declared_quantity) FROM public.purchase_delivery_items x
              JOIN public.purchase_deliveries xd ON xd.id = x.delivery_id
             WHERE x.order_item_id = oi.id AND xd.status <> 'bozza'), 0)) END,
         oi.unit_id, oi.unit_code,
         CASE WHEN oi.purchase_quantity IS NULL THEN NULL ELSE
         greatest(0, oi.purchase_quantity - COALESCE((
            SELECT sum(x.declared_purchase_quantity) FROM public.purchase_delivery_items x
              JOIN public.purchase_deliveries xd ON xd.id = x.delivery_id
             WHERE x.order_item_id = oi.id AND xd.status <> 'bozza'), 0)) END,
         CASE WHEN oi.purchase_quantity IS NULL THEN NULL ELSE oi.purchase_unit_id END,
         CASE WHEN oi.purchase_quantity IS NULL THEN NULL ELSE oi.purchase_unit_code END
    FROM public.purchase_order_items oi WHERE oi.order_id = _order_id;
  RETURN v_id;
END; $function$;

DROP FUNCTION public.set_purchase_delivery_item(uuid, numeric, numeric, text, text, date, text, text, text);
DROP FUNCTION public.external_set_delivery_item(text, uuid, numeric, text, text, date, text, text);
DROP FUNCTION public._delivery_set_item_core(uuid, numeric, numeric, text, text, date, text, text, uuid, text);

CREATE FUNCTION public._delivery_set_item_core(_delivery_item_id uuid, _declared_quantity numeric, _declared_weight numeric, _declared_producer text, _declared_producer_lot text, _declared_expiry date, _line_notes text, _missing_reason text, _actor_user_id uuid, _actor_label text, _declared_purchase_quantity numeric DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_it public.purchase_delivery_items; v_d public.purchase_deliveries; v_prev numeric; v_noeq boolean;
BEGIN
  SELECT * INTO v_it FROM public.purchase_delivery_items WHERE id = _delivery_item_id;
  IF v_it.id IS NULL THEN RAISE EXCEPTION 'Riga non trovata'; END IF;
  SELECT * INTO v_d FROM public.purchase_deliveries WHERE id = v_it.delivery_id;
  IF v_d.status <> 'bozza' THEN RAISE EXCEPTION 'Consegna già dichiarata: usare la contestazione'; END IF;
  IF _declared_purchase_quantity IS NOT NULL AND _declared_purchase_quantity < 0 THEN
    RAISE EXCEPTION 'Quantità non valida'; END IF;
  SELECT (oi.id IS NOT NULL AND oi.ordered_quantity IS NULL) INTO v_noeq
    FROM public.purchase_delivery_items di LEFT JOIN public.purchase_order_items oi ON oi.id = di.order_item_id
   WHERE di.id = _delivery_item_id;
  v_prev := v_it.declared_quantity;
  UPDATE public.purchase_delivery_items
     SET declared_quantity = CASE WHEN v_noeq THEN NULL ELSE COALESCE(_declared_quantity, declared_quantity) END,
         declared_purchase_quantity = CASE WHEN purchase_unit_id IS NULL THEN declared_purchase_quantity
                                           ELSE COALESCE(_declared_purchase_quantity, declared_purchase_quantity) END,
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
          CASE WHEN v_noeq THEN NULL ELSE COALESCE(_declared_quantity, v_prev) END,
          _line_notes, _actor_user_id, _actor_label);
  RETURN _delivery_item_id;
END; $function$;
REVOKE ALL ON FUNCTION public._delivery_set_item_core(uuid, numeric, numeric, text, text, date, text, text, uuid, text, numeric) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.set_purchase_delivery_item(_delivery_item_id uuid, _declared_quantity numeric DEFAULT NULL, _declared_weight numeric DEFAULT NULL, _declared_producer text DEFAULT NULL, _declared_producer_lot text DEFAULT NULL, _declared_expiry date DEFAULT NULL, _line_notes text DEFAULT NULL, _missing_reason text DEFAULT NULL, _actor_label text DEFAULT NULL, _declared_purchase_quantity numeric DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_order uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT d.order_id INTO v_order FROM public.purchase_delivery_items i
    JOIN public.purchase_deliveries d ON d.id = i.delivery_id WHERE i.id = _delivery_item_id;
  IF v_order IS NULL THEN RAISE EXCEPTION 'Riga non trovata'; END IF;
  IF NOT public.can_declare_on_order(v_order) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  RETURN public._delivery_set_item_core(_delivery_item_id, _declared_quantity, _declared_weight, _declared_producer,
    _declared_producer_lot, _declared_expiry, _line_notes, _missing_reason, auth.uid(), _actor_label,
    _declared_purchase_quantity);
END; $function$;
REVOKE ALL ON FUNCTION public.set_purchase_delivery_item(uuid, numeric, numeric, text, text, date, text, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_purchase_delivery_item(uuid, numeric, numeric, text, text, date, text, text, text, numeric) TO authenticated, service_role;

CREATE FUNCTION public.external_set_delivery_item(_token_hash text, _delivery_item_id uuid, _declared_quantity numeric DEFAULT NULL, _declared_producer text DEFAULT NULL, _declared_producer_lot text DEFAULT NULL, _declared_expiry date DEFAULT NULL, _line_notes text DEFAULT NULL, _missing_reason text DEFAULT NULL, _declared_purchase_quantity numeric DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_order uuid; v_item_order uuid;
BEGIN
  v_order := public.resolve_order_share_token(_token_hash);
  SELECT d.order_id INTO v_item_order FROM public.purchase_delivery_items i
    JOIN public.purchase_deliveries d ON d.id = i.delivery_id WHERE i.id = _delivery_item_id;
  IF v_item_order IS NULL OR v_item_order <> v_order THEN RAISE EXCEPTION 'Riga non valida per questo codice'; END IF;
  RETURN public._delivery_set_item_core(_delivery_item_id, _declared_quantity, NULL, _declared_producer,
    _declared_producer_lot, _declared_expiry, _line_notes, _missing_reason, NULL, NULL, _declared_purchase_quantity);
END; $function$;
REVOKE ALL ON FUNCTION public.external_set_delivery_item(text, uuid, numeric, text, text, date, text, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.external_set_delivery_item(text, uuid, numeric, text, text, date, text, text, numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.accept_purchase_delivery(_delivery_id uuid, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_d public.purchase_deliveries; v_open integer; v_ref integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  SELECT * INTO v_d FROM public.purchase_deliveries WHERE id = _delivery_id;
  IF v_d.id IS NULL OR NOT public.is_company_member(v_d.company_id) THEN RAISE EXCEPTION 'Consegna non trovata'; END IF;
  IF v_d.status NOT IN ('dichiarata','in_contestazione') THEN RAISE EXCEPTION 'Consegna non accettabile'; END IF;

  SELECT count(*) INTO v_open FROM public.purchase_delivery_disputes dd
    JOIN public.purchase_delivery_items di ON di.id = dd.delivery_item_id
   WHERE di.delivery_id = _delivery_id AND dd.status = 'aperta';
  IF v_open > 0 THEN RAISE EXCEPTION 'Contestazioni ancora aperte: risolverle prima di accettare'; END IF;

  UPDATE public.purchase_delivery_items
     SET status = 'accettata', accepted_quantity = COALESCE(accepted_quantity, declared_quantity),
         accepted_purchase_quantity = COALESCE(accepted_purchase_quantity, declared_purchase_quantity),
         decided_by = _actor_user_id, decided_at = now()
   WHERE delivery_id = _delivery_id AND status IN ('dichiarata','rettificata');

  INSERT INTO public.purchase_delivery_line_events (company_id, delivery_item_id, event_type, new_quantity, actor_user_id)
  SELECT v_d.company_id, di.id, 'accettata', di.accepted_quantity, _actor_user_id
    FROM public.purchase_delivery_items di WHERE di.delivery_id = _delivery_id AND di.status = 'accettata';

  SELECT count(*) INTO v_ref FROM public.purchase_delivery_items
   WHERE delivery_id = _delivery_id AND status = 'rifiutata';

  UPDATE public.purchase_deliveries
     SET status = (CASE WHEN v_ref > 0 THEN 'chiusa_con_rifiuti' ELSE 'accettata' END)::public.purchase_delivery_status,
         accepted_by = _actor_user_id, accepted_at = now()
   WHERE id = _delivery_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_d.company_id, _actor_user_id, 'purchase_delivery.accepted', 'purchase_delivery', _delivery_id, NULL);
  RETURN _delivery_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.resolve_purchase_delivery_dispute(_dispute_id uuid, _resolution text, _accepted_quantity numeric DEFAULT NULL::numeric, _notes text DEFAULT NULL::text, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_dd public.purchase_delivery_disputes; v_it public.purchase_delivery_items;
        v_new public.purchase_delivery_line_status; v_qty numeric; v_st public.purchase_dispute_status;
        v_noeq boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  SELECT * INTO v_dd FROM public.purchase_delivery_disputes WHERE id = _dispute_id;
  IF v_dd.id IS NULL OR NOT public.is_company_member(v_dd.company_id) THEN RAISE EXCEPTION 'Contestazione non trovata'; END IF;
  IF v_dd.status <> 'aperta' THEN RAISE EXCEPTION 'Contestazione già risolta'; END IF;
  SELECT * INTO v_it FROM public.purchase_delivery_items WHERE id = v_dd.delivery_item_id;
  v_noeq := v_it.declared_quantity IS NULL AND v_it.purchase_unit_id IS NOT NULL;

  IF _resolution = 'accettata' THEN
    v_new := 'accettata';
    v_qty := COALESCE(_accepted_quantity, CASE WHEN v_noeq THEN v_it.declared_purchase_quantity ELSE v_it.declared_quantity END);
    v_st := 'risolta_accettata';
  ELSIF _resolution = 'rettificata' THEN
    IF _accepted_quantity IS NULL THEN RAISE EXCEPTION 'Quantità rettificata obbligatoria'; END IF;
    v_new := 'rettificata'; v_qty := _accepted_quantity; v_st := 'risolta_rettificata';
  ELSIF _resolution = 'rifiutata' THEN
    v_new := 'rifiutata'; v_qty := 0; v_st := 'risolta_rifiutata';
  ELSE
    RAISE EXCEPTION 'Esito non valido';
  END IF;

  UPDATE public.purchase_delivery_disputes
     SET status = v_st, resolved_by = _actor_user_id, resolved_at = now(), resolution_notes = _notes
   WHERE id = _dispute_id;

  IF v_noeq THEN
    UPDATE public.purchase_delivery_items
       SET status = v_new, accepted_purchase_quantity = v_qty,
           accepted_quantity = CASE WHEN _resolution = 'rifiutata' THEN 0 ELSE NULL END,
           decided_by = _actor_user_id, decided_at = now()
     WHERE id = v_it.id;
  ELSE
    UPDATE public.purchase_delivery_items
       SET status = v_new, accepted_quantity = v_qty,
           accepted_purchase_quantity = CASE WHEN _resolution = 'rifiutata' AND purchase_unit_id IS NOT NULL THEN 0
                                             ELSE accepted_purchase_quantity END,
           decided_by = _actor_user_id, decided_at = now()
     WHERE id = v_it.id;
  END IF;

  INSERT INTO public.purchase_delivery_line_events (company_id, delivery_item_id, event_type,
    previous_quantity, new_quantity, reason, notes, actor_user_id)
  VALUES (v_dd.company_id, v_it.id,
          CASE WHEN _resolution = 'rettificata' THEN 'rettificata'
               WHEN _resolution = 'rifiutata' THEN 'rifiutata' ELSE 'accettata' END::public.delivery_line_event_type,
          v_it.declared_quantity, CASE WHEN v_noeq THEN NULL ELSE v_qty END,
          _resolution,
          CASE WHEN v_noeq THEN concat_ws(' — ', _notes, v_qty::text || ' ' || COALESCE(v_it.purchase_unit_code, '')) ELSE _notes END,
          _actor_user_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.purchase_delivery_disputes dd
      JOIN public.purchase_delivery_items di ON di.id = dd.delivery_item_id
     WHERE di.delivery_id = v_it.delivery_id AND dd.status = 'aperta') THEN
    UPDATE public.purchase_deliveries SET status = 'dichiarata'
     WHERE id = v_it.delivery_id AND status = 'in_contestazione';
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_dd.company_id, _actor_user_id, 'purchase_delivery.dispute_' || _resolution,
          'purchase_delivery_item', v_it.id,
          jsonb_build_object('quantity', v_qty, 'unit', CASE WHEN v_noeq THEN v_it.purchase_unit_code ELSE v_it.unit_code END));
  RETURN _dispute_id;
END; $function$;

DROP FUNCTION public.delivery_comparison(uuid);
CREATE FUNCTION public.delivery_comparison(_delivery_id uuid)
 RETURNS TABLE(delivery_item_id uuid, order_item_id uuid, product_id uuid, code text, description text, line_type text, ordered numeric, previously_declared numeric, declared numeric, difference numeric, unit_code text, declared_weight numeric, declared_producer text, declared_producer_lot text, declared_expiry date, line_notes text, missing_reason text, status text, accepted_quantity numeric, outcome text, dispute_id uuid, dispute_reason text, dispute_status text, dispute_notes text,
   ordered_purchase_quantity numeric, previously_declared_purchase numeric, declared_purchase_quantity numeric, accepted_purchase_quantity numeric, purchase_unit_code text, comparison_basis text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  SELECT di.id, di.order_item_id, di.product_id, p.code, p.description,
         di.line_type::text,
         CASE WHEN oi.id IS NULL THEN 0 ELSE oi.ordered_quantity END,
         CASE WHEN oi.id IS NOT NULL AND oi.ordered_quantity IS NULL THEN NULL ELSE
         COALESCE((SELECT sum(x.declared_quantity) FROM public.purchase_delivery_items x
                    JOIN public.purchase_deliveries xd ON xd.id = x.delivery_id
                   WHERE x.order_item_id = di.order_item_id
                     AND di.order_item_id IS NOT NULL
                     AND xd.order_id = d.order_id
                     AND xd.status <> 'bozza'
                     AND xd.id <> d.id), 0) END,
         di.declared_quantity,
         di.declared_quantity - CASE WHEN oi.id IS NULL THEN 0 ELSE oi.ordered_quantity END,
         di.unit_code, di.declared_weight, di.declared_producer,
         di.declared_producer_lot, di.declared_expiry, di.line_notes, di.missing_reason,
         di.status::text, di.accepted_quantity,
         CASE
           WHEN di.line_type = 'aggiunta_fornitore' THEN 'aggiunta_fornitore'
           WHEN di.line_type = 'sostituzione' THEN 'sostituzione'
           WHEN oi.id IS NOT NULL AND oi.ordered_quantity IS NULL THEN
             CASE
               WHEN oi.purchase_quantity IS NULL OR di.declared_purchase_quantity IS NULL THEN 'da_verificare'
               WHEN di.declared_purchase_quantity = 0 THEN 'non_consegnata'
               WHEN di.declared_purchase_quantity < oi.purchase_quantity THEN 'inferiore'
               WHEN di.declared_purchase_quantity > oi.purchase_quantity THEN 'superiore'
               ELSE 'corretta'
             END
           WHEN di.declared_quantity = 0 THEN 'non_consegnata'
           WHEN di.declared_quantity < COALESCE(oi.ordered_quantity, 0) THEN 'inferiore'
           WHEN di.declared_quantity > COALESCE(oi.ordered_quantity, 0) THEN 'superiore'
           ELSE 'corretta'
         END,
         dd.id, dd.reason::text, dd.status::text, dd.notes,
         oi.purchase_quantity,
         CASE WHEN oi.purchase_quantity IS NULL THEN NULL ELSE
         COALESCE((SELECT sum(x.declared_purchase_quantity) FROM public.purchase_delivery_items x
                    JOIN public.purchase_deliveries xd ON xd.id = x.delivery_id
                   WHERE x.order_item_id = di.order_item_id
                     AND xd.order_id = d.order_id AND xd.status <> 'bozza' AND xd.id <> d.id), 0) END,
         di.declared_purchase_quantity, di.accepted_purchase_quantity,
         COALESCE(di.purchase_unit_code, oi.purchase_unit_code),
         CASE WHEN oi.id IS NOT NULL AND oi.ordered_quantity IS NULL THEN
                CASE WHEN oi.purchase_quantity IS NULL OR di.declared_purchase_quantity IS NULL
                     THEN 'da_verificare' ELSE 'acquisto' END
              ELSE 'magazzino' END
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
$function$;
REVOKE ALL ON FUNCTION public.delivery_comparison(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delivery_comparison(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.confirm_goods_receipt(_receipt_id uuid, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
      v_it.producer_name, v_it.producer_lot_code, v_it.unit_cost, v_it.unit_id, v_it.unit_code,
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
-- ============ ENUM ============
CREATE TYPE public.purchase_order_status AS ENUM ('bozza','inviato','parzialmente_consegnato','consegnato','chiuso','annullato');
CREATE TYPE public.purchase_delivery_status AS ENUM ('bozza','dichiarata','in_contestazione','accettata','chiusa_con_rifiuti');
CREATE TYPE public.purchase_delivery_origin AS ENUM ('fornitore_b2b','fornitore_link_esterno','operatore_interno');
CREATE TYPE public.purchase_delivery_line_type AS ENUM ('ordinata','aggiunta_fornitore','sostituzione');
CREATE TYPE public.purchase_delivery_line_status AS ENUM ('dichiarata','accettata','contestata','rettificata','rifiutata');
CREATE TYPE public.purchase_dispute_reason AS ENUM ('quantita_inferiore','quantita_superiore','non_consegnato','non_ordinato','qualita','pezzatura','altro');
CREATE TYPE public.purchase_dispute_status AS ENUM ('aperta','risolta_accettata','risolta_rettificata','risolta_rifiutata');
CREATE TYPE public.delivery_line_event_type AS ENUM ('dichiarata','modificata','contestata','rettificata','accettata','rifiutata');
CREATE TYPE public.goods_receipt_status AS ENUM ('bozza','confermato');
CREATE TYPE public.stock_lot_status AS ENUM ('disponibile','esaurito','bloccato');
CREATE TYPE public.inventory_movement_type AS ENUM ('entrata_acquisto','uscita_cliente','scarto','reso','trasferimento','rettifica');
CREATE TYPE public.lot_reconciliation_status AS ENUM ('aperta','riconciliata','ignorata');

-- ============ ORDINI ============
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  archive_id uuid NOT NULL REFERENCES public.danea_archives(id),
  supplier_record_id uuid NOT NULL REFERENCES public.supplier_records(id),
  relation_id uuid REFERENCES public.supplier_customer_relations(id),
  shopping_list_id uuid REFERENCES public.shopping_lists(id),
  destination_location_id uuid NOT NULL REFERENCES public.inventory_locations(id),
  destination_address_id uuid REFERENCES public.addresses(id),
  number text NOT NULL,
  status public.purchase_order_status NOT NULL DEFAULT 'bozza',
  notes text,
  sent_at timestamptz,
  closed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, number)
);
GRANT SELECT, INSERT, UPDATE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_read_buyer" ON public.purchase_orders FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  product_supplier_link_id uuid REFERENCES public.product_supplier_links(id),
  ordered_quantity numeric NOT NULL CHECK (ordered_quantity > 0),
  unit_id uuid REFERENCES public.units_of_measure(id),
  unit_code text,
  purchase_quantity numeric,
  purchase_unit_id uuid REFERENCES public.units_of_measure(id),
  purchase_unit_code text,
  conversion_factor numeric,
  unit_cost numeric,
  supplier_product_code text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items_read_buyer" ON public.purchase_order_items FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

-- righe congelate dopo l'invio
CREATE OR REPLACE FUNCTION public.assert_order_items_frozen()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status public.purchase_order_status;
BEGIN
  SELECT status INTO v_status FROM public.purchase_orders
   WHERE id = COALESCE(NEW.order_id, OLD.order_id);
  IF v_status IS DISTINCT FROM 'bozza' THEN
    RAISE EXCEPTION 'Ordine già inviato: le righe ordinate non sono più modificabili';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER purchase_order_items_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.assert_order_items_frozen();

-- ============ LINK ESTERNO ============
CREATE TABLE public.purchase_order_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  recipient_label text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_access_at timestamptz,
  access_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.purchase_order_share_links TO authenticated;
GRANT ALL ON public.purchase_order_share_links TO service_role;
ALTER TABLE public.purchase_order_share_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "share_links_read_buyer" ON public.purchase_order_share_links FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

-- ============ CONSEGNE DICHIARATE ============
CREATE TABLE public.purchase_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  origin public.purchase_delivery_origin NOT NULL,
  status public.purchase_delivery_status NOT NULL DEFAULT 'bozza',
  notes text,
  declared_by uuid,
  declared_by_name text,
  declared_at timestamptz,
  accepted_by uuid,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, sequence)
);
GRANT SELECT ON public.purchase_deliveries TO authenticated;
GRANT ALL ON public.purchase_deliveries TO service_role;
ALTER TABLE public.purchase_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deliveries_read_buyer" ON public.purchase_deliveries FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE TABLE public.purchase_delivery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  delivery_id uuid NOT NULL REFERENCES public.purchase_deliveries(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.purchase_order_items(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  line_type public.purchase_delivery_line_type NOT NULL DEFAULT 'ordinata',
  replaces_order_item_id uuid REFERENCES public.purchase_order_items(id),
  declared_quantity numeric NOT NULL DEFAULT 0 CHECK (declared_quantity >= 0),
  unit_id uuid REFERENCES public.units_of_measure(id),
  unit_code text,
  declared_weight numeric,
  declared_producer text,
  declared_producer_lot text,
  declared_expiry date,
  line_notes text,
  missing_reason text,
  status public.purchase_delivery_line_status NOT NULL DEFAULT 'dichiarata',
  accepted_quantity numeric,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (delivery_id, order_item_id)
);
GRANT SELECT ON public.purchase_delivery_items TO authenticated;
GRANT ALL ON public.purchase_delivery_items TO service_role;
ALTER TABLE public.purchase_delivery_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delivery_items_read_buyer" ON public.purchase_delivery_items FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE TABLE public.purchase_delivery_line_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  delivery_item_id uuid NOT NULL REFERENCES public.purchase_delivery_items(id) ON DELETE CASCADE,
  event_type public.delivery_line_event_type NOT NULL,
  previous_quantity numeric,
  new_quantity numeric,
  reason text,
  notes text,
  actor_user_id uuid,
  actor_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.purchase_delivery_line_events TO authenticated;
GRANT ALL ON public.purchase_delivery_line_events TO service_role;
ALTER TABLE public.purchase_delivery_line_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "line_events_read_buyer" ON public.purchase_delivery_line_events FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE TABLE public.purchase_delivery_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  delivery_item_id uuid NOT NULL REFERENCES public.purchase_delivery_items(id) ON DELETE CASCADE,
  reason public.purchase_dispute_reason NOT NULL,
  notes text,
  status public.purchase_dispute_status NOT NULL DEFAULT 'aperta',
  opened_by uuid,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.purchase_delivery_disputes TO authenticated;
GRANT ALL ON public.purchase_delivery_disputes TO service_role;
ALTER TABLE public.purchase_delivery_disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "disputes_read_buyer" ON public.purchase_delivery_disputes FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

-- ============ CARICO MERCE ============
CREATE TABLE public.goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  archive_id uuid NOT NULL REFERENCES public.danea_archives(id),
  order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  delivery_id uuid REFERENCES public.purchase_deliveries(id),
  supplier_record_id uuid NOT NULL REFERENCES public.supplier_records(id),
  location_id uuid NOT NULL REFERENCES public.inventory_locations(id),
  number text NOT NULL,
  status public.goods_receipt_status NOT NULL DEFAULT 'bozza',
  notes text,
  received_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, number)
);
GRANT SELECT ON public.goods_receipts TO authenticated;
GRANT ALL ON public.goods_receipts TO service_role;
ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "receipts_read_buyer" ON public.goods_receipts FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE TABLE public.goods_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  receipt_id uuid NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  delivery_item_id uuid REFERENCES public.purchase_delivery_items(id),
  order_item_id uuid REFERENCES public.purchase_order_items(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  verified_quantity numeric NOT NULL CHECK (verified_quantity >= 0),
  unit_id uuid REFERENCES public.units_of_measure(id),
  unit_code text,
  stock_quantity numeric,
  conversion_factor numeric,
  unit_cost numeric,
  producer_name text,
  producer_lot_code text,
  expiry_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.goods_receipt_items TO authenticated;
GRANT ALL ON public.goods_receipt_items TO service_role;
ALTER TABLE public.goods_receipt_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "receipt_items_read_buyer" ON public.goods_receipt_items FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

-- ============ LOTTI / PROVENIENZA ============
CREATE TABLE public.stock_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  archive_id uuid NOT NULL REFERENCES public.danea_archives(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  location_id uuid NOT NULL REFERENCES public.inventory_locations(id),
  goods_receipt_item_id uuid NOT NULL REFERENCES public.goods_receipt_items(id) UNIQUE,
  supplier_record_id uuid REFERENCES public.supplier_records(id),
  internal_code text NOT NULL,
  producer_name text,
  producer_lot_code text,
  unit_cost numeric,
  unit_id uuid REFERENCES public.units_of_measure(id),
  unit_code text,
  initial_quantity numeric NOT NULL CHECK (initial_quantity > 0),
  entered_at timestamptz NOT NULL DEFAULT now(),
  expiry_date date,
  status public.stock_lot_status NOT NULL DEFAULT 'disponibile',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, internal_code)
);
GRANT SELECT ON public.stock_lots TO authenticated;
GRANT ALL ON public.stock_lots TO service_role;
ALTER TABLE public.stock_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lots_read_buyer" ON public.stock_lots FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

-- ============ MOVIMENTI APPEND-ONLY ============
CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  archive_id uuid REFERENCES public.danea_archives(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  location_id uuid NOT NULL REFERENCES public.inventory_locations(id),
  stock_lot_id uuid REFERENCES public.stock_lots(id),
  movement_type public.inventory_movement_type NOT NULL,
  quantity numeric NOT NULL CHECK (quantity <> 0),
  unit_id uuid REFERENCES public.units_of_measure(id),
  unit_code text,
  source_table text,
  source_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "movements_read_buyer" ON public.inventory_movements FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE INDEX inventory_movements_lookup ON public.inventory_movements (product_id, location_id, created_at);
CREATE INDEX inventory_movements_lot ON public.inventory_movements (stock_lot_id);

CREATE OR REPLACE FUNCTION public.deny_history_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Storico non modificabile: usare un nuovo record';
END; $$;
CREATE TRIGGER inventory_movements_append_only
  BEFORE UPDATE OR DELETE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.deny_history_write();
CREATE TRIGGER delivery_line_events_append_only
  BEFORE UPDATE OR DELETE ON public.purchase_delivery_line_events
  FOR EACH ROW EXECUTE FUNCTION public.deny_history_write();

-- ============ RICONCILIAZIONE ============
CREATE TABLE public.stock_lot_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  archive_id uuid REFERENCES public.danea_archives(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  location_id uuid NOT NULL REFERENCES public.inventory_locations(id),
  session_id uuid REFERENCES public.inventory_sessions(id),
  count_id uuid REFERENCES public.inventory_counts(id),
  detected_difference numeric NOT NULL,
  attributed_quantity numeric NOT NULL DEFAULT 0,
  status public.lot_reconciliation_status NOT NULL DEFAULT 'aperta',
  notes text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stock_lot_reconciliations TO authenticated;
GRANT ALL ON public.stock_lot_reconciliations TO service_role;
ALTER TABLE public.stock_lot_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reconciliations_read_buyer" ON public.stock_lot_reconciliations FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

-- updated_at
CREATE TRIGGER t_purchase_orders_upd BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_purchase_order_items_upd BEFORE UPDATE ON public.purchase_order_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_share_links_upd BEFORE UPDATE ON public.purchase_order_share_links FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_deliveries_upd BEFORE UPDATE ON public.purchase_deliveries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_delivery_items_upd BEFORE UPDATE ON public.purchase_delivery_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_disputes_upd BEFORE UPDATE ON public.purchase_delivery_disputes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_receipts_upd BEFORE UPDATE ON public.goods_receipts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_receipt_items_upd BEFORE UPDATE ON public.goods_receipt_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_lots_upd BEFORE UPDATE ON public.stock_lots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_reconciliations_upd BEFORE UPDATE ON public.stock_lot_reconciliations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ GIACENZA: include i movimenti dopo il conteggio ============
CREATE OR REPLACE FUNCTION public.inventory_location_stock(_product_id uuid, _location_id uuid)
RETURNS TABLE(has_count boolean, quantity numeric, counted_at timestamptz, counted_by uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH last_count AS (
    SELECT c.counted_quantity, c.counted_at, c.counted_by
    FROM public.inventory_counts c
    JOIN public.inventory_sessions s ON s.id = c.session_id
    WHERE c.product_id = _product_id
      AND c.location_id = _location_id
      AND s.status = 'completata'
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
      ELSE COALESCE((
             SELECT sum(m.quantity) FROM public.inventory_movements m
             WHERE m.product_id = _product_id AND m.location_id = _location_id
           ), 0)
    END,
    (SELECT counted_at FROM last_count),
    (SELECT counted_by FROM last_count);
$$;

-- ============ LETTURE ============
CREATE OR REPLACE FUNCTION public.product_lot_availability(_product_id uuid)
RETURNS TABLE(
  lot_id uuid, internal_code text, location_id uuid, location_name text,
  supplier_record_id uuid, supplier_name text, producer_name text, producer_lot_code text,
  unit_code text, unit_cost numeric, initial_quantity numeric, remaining_quantity numeric,
  entered_at timestamptz, expiry_date date, status text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.internal_code, l.location_id, loc.name,
         l.supplier_record_id, sr.legal_name, l.producer_name, l.producer_lot_code,
         l.unit_code, l.unit_cost, l.initial_quantity,
         COALESCE((SELECT sum(m.quantity) FROM public.inventory_movements m WHERE m.stock_lot_id = l.id), 0),
         l.entered_at, l.expiry_date, l.status::text
    FROM public.stock_lots l
    JOIN public.inventory_locations loc ON loc.id = l.location_id
    LEFT JOIN public.supplier_records sr ON sr.id = l.supplier_record_id
   WHERE l.product_id = _product_id
     AND public.is_company_member(l.company_id)
   ORDER BY l.entered_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.product_lot_reconciliation(_product_id uuid, _location_id uuid DEFAULT NULL)
RETURNS TABLE(location_id uuid, location_name text, physical numeric, lots_theoretical numeric, difference numeric, has_count boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT loc.id, loc.name, s.quantity,
         COALESCE((
           SELECT sum(COALESCE((SELECT sum(m.quantity) FROM public.inventory_movements m WHERE m.stock_lot_id = l.id), 0))
             FROM public.stock_lots l
            WHERE l.product_id = _product_id AND l.location_id = loc.id
         ), 0) AS lots_theoretical,
         s.quantity - COALESCE((
           SELECT sum(COALESCE((SELECT sum(m.quantity) FROM public.inventory_movements m WHERE m.stock_lot_id = l.id), 0))
             FROM public.stock_lots l
            WHERE l.product_id = _product_id AND l.location_id = loc.id
         ), 0) AS difference,
         s.has_count
    FROM public.inventory_locations loc
    CROSS JOIN LATERAL public.inventory_location_stock(_product_id, loc.id) s
   WHERE loc.status = 'attivo'
     AND (_location_id IS NULL OR loc.id = _location_id)
     AND loc.company_id = (SELECT company_id FROM public.products WHERE id = _product_id)
     AND public.is_company_member(loc.company_id)
   ORDER BY loc.is_default DESC, loc.name;
$$;

CREATE OR REPLACE FUNCTION public.goods_receipt_history(_product_id uuid)
RETURNS TABLE(
  receipt_id uuid, receipt_number text, order_id uuid, order_number text,
  supplier_name text, location_name text, verified_quantity numeric, unit_code text,
  producer_name text, producer_lot_code text, unit_cost numeric,
  received_at timestamptz, status text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.number, r.order_id, o.number, sr.legal_name, loc.name,
         ri.verified_quantity, ri.unit_code, ri.producer_name, ri.producer_lot_code,
         ri.unit_cost, r.received_at, r.status::text
    FROM public.goods_receipt_items ri
    JOIN public.goods_receipts r ON r.id = ri.receipt_id
    JOIN public.purchase_orders o ON o.id = r.order_id
    JOIN public.supplier_records sr ON sr.id = r.supplier_record_id
    JOIN public.inventory_locations loc ON loc.id = r.location_id
   WHERE ri.product_id = _product_id
     AND public.is_company_member(ri.company_id)
   ORDER BY r.received_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.purchase_order_overview(_company_id uuid)
RETURNS TABLE(
  order_id uuid, number text, status text, supplier_record_id uuid, supplier_name text,
  destination_location_id uuid, destination_name text, archive_id uuid,
  lines integer, ordered_total numeric, declared_total numeric, received_total numeric,
  deliveries integer, open_disputes integer, sent_at timestamptz, created_at timestamptz, notes text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
         o.sent_at, o.created_at, o.notes
    FROM public.purchase_orders o
    JOIN public.supplier_records sr ON sr.id = o.supplier_record_id
    JOIN public.inventory_locations loc ON loc.id = o.destination_location_id
   WHERE o.company_id = _company_id
     AND public.is_company_member(o.company_id)
   ORDER BY o.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.delivery_comparison(_delivery_id uuid)
RETURNS TABLE(
  delivery_item_id uuid, order_item_id uuid, product_id uuid, code text, description text,
  line_type text, ordered numeric, previously_declared numeric, declared numeric,
  difference numeric, unit_code text, declared_weight numeric, declared_producer text,
  declared_producer_lot text, declared_expiry date, line_notes text, missing_reason text,
  status text, accepted_quantity numeric, outcome text,
  dispute_id uuid, dispute_reason text, dispute_status text, dispute_notes text
)
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
     AND public.is_company_member(di.company_id)
   ORDER BY p.code;
$$;

-- Fase 3 prezzi variabili: prezzo del listino in vigore allo scarico, storico immutabile per riga,
-- coerenza del listino nell'intero scarico. Le funzioni di scarico esistenti restano invariate.
ALTER TABLE public.danea_order_exports
  ADD COLUMN IF NOT EXISTS warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS price_list_updated_at timestamptz;

CREATE TABLE public.danea_order_export_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  export_id uuid NOT NULL REFERENCES public.danea_order_exports(id),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  order_id uuid NOT NULL REFERENCES public.purchase_orders(id),
  item_id uuid NOT NULL REFERENCES public.purchase_order_items(id),
  seller_product_id uuid,
  line_unit_code text,
  price numeric,
  price_unit_id uuid,
  price_unit_code text,
  list_number smallint,
  list_price numeric,
  price_list_updated_at timestamptz,
  customer_price numeric,
  customer_price_unit_code text,
  reason text CHECK (reason IS NULL OR reason IN ('rapporto_non_attivo','listino_non_assegnato','prezzo_mancante','um_diversa','articolo_mancante')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (export_id, item_id)
);
GRANT SELECT ON public.danea_order_export_lines TO authenticated;
GRANT ALL ON public.danea_order_export_lines TO service_role;
ALTER TABLE public.danea_order_export_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY danea_order_export_lines_read ON public.danea_order_export_lines FOR SELECT TO authenticated
  USING (public.is_company_admin(company_id));
CREATE INDEX danea_order_export_lines_order_idx ON public.danea_order_export_lines(order_id, created_at DESC);

CREATE OR REPLACE FUNCTION public._danea_export_lines_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Lo storico dei prezzi esportati non si modifica'; END $$;
REVOKE ALL ON FUNCTION public._danea_export_lines_immutable() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER danea_order_export_lines_immutable BEFORE UPDATE OR DELETE ON public.danea_order_export_lines
  FOR EACH ROW EXECUTE FUNCTION public._danea_export_lines_immutable();

-- Prezzo di una riga allo scarico: listino assegnato al cliente (stesso archivio), rapporto attivo,
-- nessun controllo «articolo pubblicato» (ordine già ricevuto), nessun altro listino, mai 0.
CREATE OR REPLACE FUNCTION public._danea_export_line_price(_relation_id uuid, _seller_company_id uuid, _seller_product_id uuid, _line_unit text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_list smallint; v_price numeric; v_unit_id uuid; v_unit_code text;
BEGIN
  IF _seller_product_id IS NULL THEN
    RETURN jsonb_build_object('reason', 'articolo_mancante');
  END IF;
  SELECT rel.status, rel.seller_enabled, rel.buyer_enabled, cr.assigned_price_list_number, cr.archive_id
    INTO r
    FROM public.supplier_customer_relations rel
    LEFT JOIN public.customer_records cr ON cr.id = rel.customer_record_id AND cr.seller_company_id = rel.seller_company_id
   WHERE rel.id = _relation_id AND rel.seller_company_id = _seller_company_id;
  IF NOT FOUND OR r.status <> 'attivo' OR NOT r.seller_enabled OR NOT r.buyer_enabled THEN
    RETURN jsonb_build_object('reason', 'rapporto_non_attivo');
  END IF;
  SELECT l.list_number INTO v_list FROM public.danea_price_lists l
   WHERE l.company_id = _seller_company_id AND l.list_number = r.assigned_price_list_number AND l.is_active
     AND (r.archive_id IS NULL OR l.archive_id = r.archive_id)
   LIMIT 1;
  IF v_list IS NULL THEN RETURN jsonb_build_object('reason', 'listino_non_assegnato'); END IF;
  SELECT pp.net_price INTO v_price FROM public.product_prices pp
   WHERE pp.company_id = _seller_company_id AND pp.product_id = _seller_product_id AND pp.list_number = v_list
   LIMIT 1;
  SELECT p.price_unit_id, u.code INTO v_unit_id, v_unit_code
    FROM public.products p LEFT JOIN public.units_of_measure u ON u.id = p.price_unit_id
   WHERE p.id = _seller_product_id AND p.company_id = _seller_company_id;
  IF v_price IS NULL OR v_price <= 0 THEN
    RETURN jsonb_build_object('reason', 'prezzo_mancante', 'list_number', v_list,
      'price_unit_id', v_unit_id, 'price_unit_code', v_unit_code);
  END IF;
  IF v_unit_code IS NULL OR _line_unit IS NULL OR lower(trim(v_unit_code)) <> lower(trim(_line_unit)) THEN
    RETURN jsonb_build_object('reason', 'um_diversa', 'list_number', v_list, 'list_price', v_price,
      'price_unit_id', v_unit_id, 'price_unit_code', v_unit_code);
  END IF;
  RETURN jsonb_build_object('reason', NULL, 'list_number', v_list, 'list_price', v_price, 'price', v_price,
    'price_unit_id', v_unit_id, 'price_unit_code', v_unit_code);
END $$;
REVOKE ALL ON FUNCTION public._danea_export_line_price(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- Righe di storico in formato comune (anche per i riscarichi).
CREATE OR REPLACE FUNCTION public._danea_export_lines_json(_export_ids uuid[], _order_ids uuid[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'item_id', x.item_id, 'order_id', x.order_id, 'price', x.price, 'price_unit_code', x.price_unit_code,
    'list_number', x.list_number, 'list_price', x.list_price, 'reason', x.reason,
    'customer_price', x.customer_price, 'customer_price_unit_code', x.customer_price_unit_code,
    'price_list_updated_at', x.price_list_updated_at)), '[]'::jsonb)
  FROM (
    SELECT DISTINCT ON (l.item_id) l.*
    FROM public.danea_order_export_lines l
    WHERE l.export_id = ANY(_export_ids) AND l.order_id = ANY(_order_ids)
    ORDER BY l.item_id, l.created_at DESC
  ) x;
$$;
REVOKE ALL ON FUNCTION public._danea_export_lines_json(uuid[], uuid[]) FROM PUBLIC, anon, authenticated;

-- Scarico con prezzi: blocco ordini + blocco condiviso del listino, prezzi calcolati e salvati
-- per tutte le righe, ordini segnati «Scaricato da Danea». Tutto o niente.
CREATE OR REPLACE FUNCTION public.danea_export_orders_priced(_station_id uuid, _order_ids uuid[], _excluded jsonb, _warnings jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.danea_stations; v_ok integer; v_export uuid; v_upd timestamptz; o record;
BEGIN
  s := public._danea_order_station(_station_id);
  IF _order_ids IS NULL OR cardinality(_order_ids) = 0 THEN RAISE EXCEPTION 'DANEA_NO_ORDERS'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('danea_orders:' || s.company_id::text));
  PERFORM pg_advisory_xact_lock_shared(hashtext('danea_price_list:' || s.company_id::text));

  SELECT count(*) INTO v_ok FROM (
    SELECT po.id FROM public.purchase_orders po
    JOIN public.supplier_customer_relations r ON r.id = po.relation_id
    WHERE po.id = ANY(_order_ids) AND r.seller_company_id = s.company_id
      AND po.status NOT IN ('bozza','annullato') AND po.sent_at IS NOT NULL
      AND po.danea_exported_at IS NULL
    FOR UPDATE OF po) t;
  IF v_ok <> cardinality(_order_ids) THEN RAISE EXCEPTION 'DANEA_CONCURRENT'; END IF;

  SELECT last_price_update_at INTO v_upd FROM public.seller_price_info WHERE company_id = s.company_id;

  INSERT INTO public.danea_order_exports(company_id, station_id, archive_id, outcome, order_ids, order_count, excluded, warnings, price_list_updated_at)
  VALUES (s.company_id, s.id, s.archive_id, 'scaricato', _order_ids, cardinality(_order_ids),
          COALESCE(_excluded,'[]'::jsonb), COALESCE(_warnings,'[]'::jsonb), v_upd)
  RETURNING id INTO v_export;

  INSERT INTO public.danea_order_export_lines(export_id, company_id, order_id, item_id, seller_product_id, line_unit_code,
    price, price_unit_id, price_unit_code, list_number, list_price, price_list_updated_at, customer_price, customer_price_unit_code, reason)
  SELECT v_export, s.company_id, q.order_id, q.item_id, q.seller_product_id, q.line_unit,
    (q.d->>'price')::numeric, (q.d->>'price_unit_id')::uuid, q.d->>'price_unit_code', (q.d->>'list_number')::smallint,
    (q.d->>'list_price')::numeric, v_upd, q.unit_cost, q.price_unit_code, q.d->>'reason'
  FROM (
    SELECT po.id AS order_id, i.id AS item_id, sp.id AS seller_product_id,
           COALESCE(i.purchase_unit_code, i.unit_code) AS line_unit, i.unit_cost, i.price_unit_code,
           public._danea_export_line_price(po.relation_id, s.company_id, sp.id, COALESCE(i.purchase_unit_code, i.unit_code)) AS d
    FROM public.purchase_orders po
    JOIN public.purchase_order_items i ON i.order_id = po.id
    LEFT JOIN public.product_supplier_links l ON l.id = i.product_supplier_link_id
    LEFT JOIN public.products sp ON sp.id = l.b2b_item_id AND sp.company_id = s.company_id
    WHERE po.id = ANY(_order_ids)
  ) q;

  FOR o IN SELECT id, company_id FROM public.purchase_orders WHERE id = ANY(_order_ids) LOOP
    UPDATE public.purchase_orders
       SET danea_exported_at = now(), danea_export_id = v_export, danea_exported_station_id = s.id,
           seen_by_supplier_at = COALESCE(seen_by_supplier_at, now()), updated_at = now()
     WHERE id = o.id;
    INSERT INTO public.purchase_order_changes(order_id, buyer_company_id, seller_company_id, field, label, old_value, new_value, changed_by)
    VALUES (o.id, o.company_id, s.company_id, 'export_danea', 'Scaricato da Danea', NULL, s.name, NULL);
  END LOOP;

  RETURN jsonb_build_object('export_id', v_export, 'price_list_updated_at', v_upd,
    'lines', public._danea_export_lines_json(ARRAY[v_export], _order_ids));
END $$;
REVOKE ALL ON FUNCTION public.danea_export_orders_priced(uuid, uuid[], jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.danea_export_orders_priced(uuid, uuid[], jsonb, jsonb) TO service_role;

-- Riscarico richiesto da Danea: prezzi già registrati da questa postazione, nessun ricalcolo.
CREATE OR REPLACE FUNCTION public.danea_export_stored_prices(_station_id uuid, _order_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.danea_stations; v_ids uuid[];
BEGIN
  s := public._danea_order_station(_station_id);
  SELECT COALESCE(array_agg(id), '{}') INTO v_ids FROM public.danea_order_exports
   WHERE station_id = s.id AND company_id = s.company_id AND outcome = 'scaricato';
  RETURN public._danea_export_lines_json(v_ids, _order_ids);
END $$;
REVOKE ALL ON FUNCTION public.danea_export_stored_prices(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.danea_export_stored_prices(uuid, uuid[]) TO service_role;

-- Impronta del file, scritta una sola volta dopo la preparazione dell'XML.
CREATE OR REPLACE FUNCTION public.danea_set_export_payload(_station_id uuid, _export_id uuid, _payload_bytes integer, _payload_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.danea_stations;
BEGIN
  s := public._danea_order_station(_station_id);
  UPDATE public.danea_order_exports SET payload_bytes = _payload_bytes, payload_hash = _payload_hash
   WHERE id = _export_id AND station_id = s.id AND payload_hash IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.danea_set_export_payload(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.danea_set_export_payload(uuid, uuid, integer, text) TO service_role;

-- Registro richieste senza ordini nuovi o fallite, con avvisi.
CREATE OR REPLACE FUNCTION public.danea_log_order_export_warn(_station_id uuid, _outcome text, _excluded jsonb, _error text, _warnings jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.danea_stations; v uuid; v_upd timestamptz;
BEGIN
  IF _outcome NOT IN ('nessun_ordine','fallito') THEN RAISE EXCEPTION 'Esito non valido'; END IF;
  s := public._danea_order_station(_station_id);
  SELECT last_price_update_at INTO v_upd FROM public.seller_price_info WHERE company_id = s.company_id;
  INSERT INTO public.danea_order_exports(company_id, station_id, archive_id, outcome, excluded, error_message, warnings, price_list_updated_at)
  VALUES (s.company_id, s.id, s.archive_id, _outcome, COALESCE(_excluded,'[]'::jsonb), left(_error, 500), COALESCE(_warnings,'[]'::jsonb), v_upd)
  RETURNING id INTO v;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.danea_log_order_export_warn(uuid, text, jsonb, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.danea_log_order_export_warn(uuid, text, jsonb, text, jsonb) TO service_role;

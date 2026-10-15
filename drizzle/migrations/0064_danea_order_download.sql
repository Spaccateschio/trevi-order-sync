-- Scarico ordini B2B in Danea («Scarica ordini da e-commerce»).
-- Nessun ordine viene toccato da questa migrazione: lo scarico parte solo
-- quando esiste una postazione con uso «ordini» (oggi nessuna).

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS danea_export_id uuid,
  ADD COLUMN IF NOT EXISTS danea_exported_station_id uuid;

CREATE TABLE IF NOT EXISTS public.danea_order_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  station_id uuid NOT NULL REFERENCES public.danea_stations(id),
  archive_id uuid NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('scaricato','nessun_ordine','fallito')),
  order_ids uuid[] NOT NULL DEFAULT '{}',
  order_count integer NOT NULL DEFAULT 0,
  excluded jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload_bytes integer,
  payload_hash text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.danea_order_exports TO authenticated;
GRANT ALL ON public.danea_order_exports TO service_role;
ALTER TABLE public.danea_order_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY danea_order_exports_read ON public.danea_order_exports FOR SELECT TO authenticated
  USING (public.is_company_admin(company_id));
CREATE INDEX IF NOT EXISTS danea_order_exports_company_idx ON public.danea_order_exports(company_id, created_at DESC);

-- Postazione attiva autorizzata agli ordini (uso esplicito, mai implicito).
CREATE OR REPLACE FUNCTION public._danea_order_station(_station_id uuid)
RETURNS public.danea_stations LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.danea_stations;
BEGIN
  SELECT * INTO s FROM public.danea_stations WHERE id = _station_id;
  IF s.id IS NULL OR s.status <> 'attivo' OR NOT ('ordini' = ANY(s.allowed_uses)) THEN
    RAISE EXCEPTION 'DANEA_STATION_NOT_ALLOWED';
  END IF;
  RETURN s;
END $$;
REVOKE ALL ON FUNCTION public._danea_order_station(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._danea_order_station(uuid) TO service_role;

-- 1) SELEZIONE + VALIDAZIONE (sola lettura): ordini B2B ricevuti dall'azienda
--    della postazione, inviati, non annullati, non ancora scaricati.
CREATE OR REPLACE FUNCTION public.danea_orders_export_candidates(_station_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.danea_stations; v jsonb;
BEGIN
  s := public._danea_order_station(_station_id);
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'sent_at'), '[]'::jsonb) INTO v FROM (
    SELECT jsonb_build_object(
      'order_id', po.id,
      'number', po.number,
      'sent_at', po.sent_at,
      'order_date', (po.sent_at AT TIME ZONE 'Europe/Rome')::date,
      'delivery_date', po.delivery_date,
      'delivery_time_from', po.delivery_time_from,
      'delivery_time_to', po.delivery_time_to,
      'delivery_address_text', po.delivery_address_text,
      'notes', po.notes,
      'buyer_name', bc.legal_name,
      'customer', CASE WHEN cr.id IS NULL THEN NULL ELSE jsonb_build_object(
        'code', NULLIF(trim(cr.internal_reference), ''),
        'name', cr.legal_name, 'address', cr.address_line, 'postcode', cr.postal_code,
        'city', cr.city, 'province', cr.province, 'country', cr.country,
        'fiscal_code', cr.tax_code, 'vat_code', cr.vat_number, 'email', cr.email,
        'phone', cr.phone, 'sdi_code', cr.sdi_code, 'pec', cr.pec,
        'archive_ok', cr.archive_id IS NOT DISTINCT FROM s.archive_id) END,
      'lines', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'item_id', i.id,
          'seller_code', NULLIF(trim(sp.code), ''),
          'description', COALESCE(sp.description, i.product_name),
          'quantity', COALESCE(i.purchase_quantity, i.ordered_quantity),
          'unit', COALESCE(i.purchase_unit_code, i.unit_code),
          'price', i.unit_cost,
          'price_unit', i.price_unit_code,
          'vat_code', sp.vat_code,
          'vat_perc', sp.vat_perc,
          'notes', i.notes) ORDER BY i.created_at, i.id)
        FROM public.purchase_order_items i
        LEFT JOIN public.product_supplier_links l ON l.id = i.product_supplier_link_id
        LEFT JOIN public.products sp ON sp.id = l.b2b_item_id AND sp.company_id = s.company_id
        WHERE i.order_id = po.id), '[]'::jsonb)
    ) AS x
    FROM public.purchase_orders po
    JOIN public.supplier_customer_relations r ON r.id = po.relation_id
    LEFT JOIN public.customer_records cr ON cr.id = r.customer_record_id AND cr.seller_company_id = s.company_id
    LEFT JOIN public.companies bc ON bc.id = po.company_id
    WHERE r.seller_company_id = s.company_id
      AND po.relation_id IS NOT NULL
      AND po.status NOT IN ('bozza','annullato')
      AND po.sent_at IS NOT NULL
      AND po.danea_exported_at IS NULL
  ) q;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.danea_orders_export_candidates(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.danea_orders_export_candidates(uuid) TO service_role;

-- 2) REGISTRAZIONE DELLO SCARICO: solo dopo che l'XML è pronto.
--    Lock per azienda contro richieste contemporanee; se un ordine non è più
--    disponibile si interrompe tutto (nessuno stato a metà).
CREATE OR REPLACE FUNCTION public.danea_mark_orders_exported(
  _station_id uuid, _order_ids uuid[], _excluded jsonb, _payload_bytes integer, _payload_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.danea_stations; v_ok integer; v_export uuid; o record;
BEGIN
  s := public._danea_order_station(_station_id);
  IF _order_ids IS NULL OR cardinality(_order_ids) = 0 THEN RAISE EXCEPTION 'DANEA_NO_ORDERS'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('danea_orders:' || s.company_id::text));

  SELECT count(*) INTO v_ok FROM (
    SELECT po.id FROM public.purchase_orders po
    JOIN public.supplier_customer_relations r ON r.id = po.relation_id
    WHERE po.id = ANY(_order_ids) AND r.seller_company_id = s.company_id
      AND po.status NOT IN ('bozza','annullato') AND po.sent_at IS NOT NULL
      AND po.danea_exported_at IS NULL
    FOR UPDATE OF po) t;
  IF v_ok <> cardinality(_order_ids) THEN RAISE EXCEPTION 'DANEA_CONCURRENT'; END IF;

  INSERT INTO public.danea_order_exports(company_id, station_id, archive_id, outcome, order_ids, order_count, excluded, payload_bytes, payload_hash)
  VALUES (s.company_id, s.id, s.archive_id, 'scaricato', _order_ids, cardinality(_order_ids), COALESCE(_excluded,'[]'::jsonb), _payload_bytes, _payload_hash)
  RETURNING id INTO v_export;

  FOR o IN SELECT id, company_id, danea_exported_at FROM public.purchase_orders WHERE id = ANY(_order_ids) LOOP
    UPDATE public.purchase_orders
       SET danea_exported_at = now(), danea_export_id = v_export, danea_exported_station_id = s.id,
           seen_by_supplier_at = COALESCE(seen_by_supplier_at, now()), updated_at = now()
     WHERE id = o.id;
    INSERT INTO public.purchase_order_changes(order_id, buyer_company_id, seller_company_id, field, label, old_value, new_value, changed_by)
    VALUES (o.id, o.company_id, s.company_id, 'export_danea', 'Scaricato da Danea', NULL, s.name, NULL);
  END LOOP;
  RETURN v_export;
END $$;
REVOKE ALL ON FUNCTION public.danea_mark_orders_exported(uuid, uuid[], jsonb, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.danea_mark_orders_exported(uuid, uuid[], jsonb, integer, text) TO service_role;

-- Registro delle richieste senza ordini o fallite.
CREATE OR REPLACE FUNCTION public.danea_log_order_export(_station_id uuid, _outcome text, _excluded jsonb, _error text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.danea_stations; v uuid;
BEGIN
  s := public._danea_order_station(_station_id);
  IF _outcome NOT IN ('nessun_ordine','fallito') THEN RAISE EXCEPTION 'Esito non valido'; END IF;
  INSERT INTO public.danea_order_exports(company_id, station_id, archive_id, outcome, excluded, error_message)
  VALUES (s.company_id, s.id, s.archive_id, _outcome, COALESCE(_excluded,'[]'::jsonb), left(_error, 500))
  RETURNING id INTO v;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.danea_log_order_export(uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.danea_log_order_export(uuid, text, jsonb, text) TO service_role;

-- 3) RIMETTI IN SCARICO: solo amministratori del venditore, nessuna modifica a righe/prezzi.
CREATE OR REPLACE FUNCTION public.danea_requeue_order(_order_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.purchase_orders; _seller uuid;
BEGIN
  SELECT * INTO o FROM public.purchase_orders WHERE id = _order_id FOR UPDATE;
  SELECT seller_company_id INTO _seller FROM public.supplier_customer_relations WHERE id = o.relation_id;
  IF o.id IS NULL OR _seller IS NULL OR NOT public.is_company_admin(_seller) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori del fornitore'; END IF;
  IF o.danea_exported_at IS NULL THEN RAISE EXCEPTION 'Ordine non ancora scaricato da Danea'; END IF;
  IF o.status IN ('bozza','annullato') THEN RAISE EXCEPTION 'Ordine annullato: non può essere rimesso in scarico'; END IF;
  IF NULLIF(trim(COALESCE(_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'Indica il motivo'; END IF;

  UPDATE public.purchase_orders
     SET danea_exported_at = NULL, danea_export_id = NULL, danea_exported_station_id = NULL, updated_at = now()
   WHERE id = o.id;
  INSERT INTO public.purchase_order_changes(order_id, buyer_company_id, seller_company_id, field, label, old_value, new_value, changed_by)
  VALUES (o.id, o.company_id, _seller, 'danea_requeued', 'Rimesso in scarico Danea', o.danea_exported_at::text, trim(_reason), auth.uid());
  INSERT INTO public.audit_events(company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_seller, auth.uid(), 'danea_order.requeued', 'purchase_order', o.id,
          jsonb_build_object('number', o.number, 'previous_export_at', o.danea_exported_at, 'reason', trim(_reason)));
END $$;
REVOKE ALL ON FUNCTION public.danea_requeue_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.danea_requeue_order(uuid, text) TO authenticated;
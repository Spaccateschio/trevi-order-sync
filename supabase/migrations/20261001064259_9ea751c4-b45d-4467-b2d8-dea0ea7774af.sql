ALTER TABLE public.company_settings
  ADD COLUMN default_delivery_address_id uuid REFERENCES public.addresses(id),
  ADD COLUMN default_delivery_time_from time,
  ADD COLUMN default_delivery_time_to time,
  ADD COLUMN default_delivery_day text NOT NULL DEFAULT 'oggi' CHECK (default_delivery_day IN ('oggi','domani'));

CREATE OR REPLACE FUNCTION public.company_local_today(_company_id uuid)
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (now() AT TIME ZONE COALESCE((SELECT NULLIF(timezone,'') FROM public.company_settings WHERE company_id = _company_id), 'Europe/Rome'))::date;
$$;

CREATE OR REPLACE FUNCTION public.manage_company_delivery_preferences(_company_id uuid, _address_id uuid, _time_from time, _time_to time, _day text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_admin(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _day NOT IN ('oggi','domani') THEN RAISE EXCEPTION 'Data predefinita non valida'; END IF;
  IF _time_from IS NOT NULL AND _time_to IS NOT NULL AND _time_from >= _time_to THEN RAISE EXCEPTION 'L''orario «dalle» deve precedere «alle»'; END IF;
  IF _address_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.addresses WHERE id = _address_id AND company_id = _company_id AND customer_record_id IS NULL AND supplier_record_id IS NULL) THEN
    RAISE EXCEPTION 'Indirizzo non valido'; END IF;
  INSERT INTO public.company_settings (company_id, default_delivery_address_id, default_delivery_time_from, default_delivery_time_to, default_delivery_day)
  VALUES (_company_id, _address_id, _time_from, _time_to, _day)
  ON CONFLICT (company_id) DO UPDATE SET default_delivery_address_id = EXCLUDED.default_delivery_address_id,
    default_delivery_time_from = EXCLUDED.default_delivery_time_from, default_delivery_time_to = EXCLUDED.default_delivery_time_to,
    default_delivery_day = EXCLUDED.default_delivery_day, updated_at = now();
END; $$;
REVOKE ALL ON FUNCTION public.manage_company_delivery_preferences(uuid,uuid,time,time,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_company_delivery_preferences(uuid,uuid,time,time,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_local_today(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_purchase_order_delivery(_order_id uuid, _date date, _time_from time, _time_to time, _address_id uuid, _address_text text, _supplier_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_o public.purchase_orders; v_text text := NULLIF(btrim(_address_text), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = _order_id FOR UPDATE;
  IF v_o.id IS NULL OR NOT public.is_company_member(v_o.company_id) THEN RAISE EXCEPTION 'Ordine non trovato'; END IF;
  IF v_o.status <> 'bozza' OR COALESCE(v_o.send_status,'da_inviare') = 'inviato' THEN
    RAISE EXCEPTION 'Ordine già inviato: consegna e note non sono più modificabili'; END IF;
  IF _date IS NOT NULL AND _date < public.company_local_today(v_o.company_id) THEN RAISE EXCEPTION 'La data di consegna non può essere passata'; END IF;
  IF _time_from IS NOT NULL AND _time_to IS NOT NULL AND _time_from >= _time_to THEN RAISE EXCEPTION 'L''orario «dalle» deve precedere «alle»'; END IF;
  IF _address_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.addresses WHERE id = _address_id AND company_id = v_o.company_id AND customer_record_id IS NULL AND supplier_record_id IS NULL) THEN
    RAISE EXCEPTION 'Indirizzo non valido'; END IF;
  UPDATE public.purchase_orders SET delivery_date = _date, delivery_time_from = _time_from, delivery_time_to = _time_to,
    destination_address_id = _address_id, delivery_address_text = v_text,
    supplier_notes = NULLIF(btrim(_supplier_notes), ''), updated_at = now()
  WHERE id = _order_id;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_o.company_id, auth.uid(), 'purchase_order.delivery', 'purchase_order', _order_id, NULL);
  RETURN _order_id;
END; $$;
REVOKE ALL ON FUNCTION public.set_purchase_order_delivery(uuid,date,time,time,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_purchase_order_delivery(uuid,date,time,time,uuid,text,text) TO authenticated;

-- Note bloccate dopo l'invio
CREATE OR REPLACE FUNCTION public.manage_purchase_order(_order_id uuid, _action text, _destination_location_id uuid DEFAULT NULL::uuid, _notes text DEFAULT NULL::text, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_o public.purchase_orders;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = _order_id;
  IF v_o.id IS NULL OR NOT public.is_company_member(v_o.company_id) THEN RAISE EXCEPTION 'Ordine non trovato'; END IF;
  IF _action = 'send' THEN
    IF v_o.status <> 'bozza' THEN RAISE EXCEPTION 'Ordine già inviato'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.purchase_order_items WHERE order_id = _order_id) THEN RAISE EXCEPTION 'Ordine senza righe'; END IF;
    UPDATE public.purchase_orders SET status = 'inviato', sent_at = now() WHERE id = _order_id;
  ELSIF _action = 'set_destination' THEN
    IF v_o.status <> 'bozza' THEN RAISE EXCEPTION 'Destinazione modificabile solo in bozza'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.inventory_locations WHERE id = _destination_location_id AND company_id = v_o.company_id) THEN RAISE EXCEPTION 'Destinazione non valida'; END IF;
    UPDATE public.purchase_orders SET destination_location_id = _destination_location_id WHERE id = _order_id;
  ELSIF _action = 'notes' THEN
    IF v_o.status <> 'bozza' OR COALESCE(v_o.send_status,'da_inviare') = 'inviato' THEN RAISE EXCEPTION 'Ordine già inviato: note non modificabili'; END IF;
    UPDATE public.purchase_orders SET notes = _notes WHERE id = _order_id;
  ELSIF _action = 'cancel' THEN
    IF v_o.status NOT IN ('bozza','inviato') THEN RAISE EXCEPTION 'Ordine non annullabile'; END IF;
    IF EXISTS (SELECT 1 FROM public.goods_receipts WHERE order_id = _order_id AND status = 'confermato') THEN RAISE EXCEPTION 'Ordine con carichi confermati: non annullabile'; END IF;
    UPDATE public.purchase_orders SET status = 'annullato', closed_at = now() WHERE id = _order_id;
  ELSIF _action = 'close' THEN
    UPDATE public.purchase_orders SET status = 'chiuso', closed_at = now() WHERE id = _order_id;
  ELSE RAISE EXCEPTION 'Azione non valida';
  END IF;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_o.company_id, _actor_user_id, 'purchase_order.' || _action, 'purchase_order', _order_id, NULL);
  RETURN _order_id;
END; $function$;

DROP FUNCTION public.purchase_order_overview(uuid);
CREATE FUNCTION public.purchase_order_overview(_company_id uuid)
 RETURNS TABLE(order_id uuid, number text, status text, supplier_record_id uuid, supplier_name text, destination_location_id uuid, destination_name text, archive_id uuid, lines integer, ordered_total numeric, declared_total numeric, received_total numeric, deliveries integer, open_disputes integer, sent_at timestamp with time zone, created_at timestamp with time zone, notes text, lines_without_equivalent integer,
   send_status text, delivery_date date, delivery_time_from time, delivery_time_to time, delivery_address_id uuid, delivery_address_text text, supplier_notes text, shopping_list_number text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT o.id, o.number, o.status::text, o.supplier_record_id, sr.legal_name,
         o.destination_location_id, loc.name, o.archive_id,
         (SELECT count(*)::int FROM public.purchase_order_items i WHERE i.order_id = o.id),
         COALESCE((SELECT sum(i.ordered_quantity) FROM public.purchase_order_items i WHERE i.order_id = o.id), 0),
         COALESCE((SELECT sum(di.declared_quantity) FROM public.purchase_delivery_items di JOIN public.purchase_deliveries d ON d.id = di.delivery_id WHERE d.order_id = o.id AND d.status <> 'bozza'), 0),
         COALESCE((SELECT sum(ri.verified_quantity) FROM public.goods_receipt_items ri JOIN public.goods_receipts r ON r.id = ri.receipt_id WHERE r.order_id = o.id AND r.status = 'confermato'), 0),
         (SELECT count(*)::int FROM public.purchase_deliveries d WHERE d.order_id = o.id),
         (SELECT count(*)::int FROM public.purchase_delivery_disputes dd JOIN public.purchase_delivery_items di ON di.id = dd.delivery_item_id JOIN public.purchase_deliveries d ON d.id = di.delivery_id WHERE d.order_id = o.id AND dd.status = 'aperta'),
         o.sent_at, o.created_at, o.notes,
         (SELECT count(*)::int FROM public.purchase_order_items i WHERE i.order_id = o.id AND i.ordered_quantity IS NULL),
         CASE WHEN o.status <> 'bozza' AND COALESCE(o.send_status,'da_inviare') = 'da_inviare' THEN 'inviato' ELSE COALESCE(o.send_status,'da_inviare') END,
         o.delivery_date, o.delivery_time_from, o.delivery_time_to, o.destination_address_id, o.delivery_address_text, o.supplier_notes,
         sl.number
    FROM public.purchase_orders o
    JOIN public.supplier_records sr ON sr.id = o.supplier_record_id
    JOIN public.inventory_locations loc ON loc.id = o.destination_location_id
    LEFT JOIN public.shopping_lists sl ON sl.id = o.shopping_list_id
   WHERE o.company_id = _company_id AND public.is_company_member(o.company_id)
   ORDER BY o.created_at DESC;
$function$;
REVOKE ALL ON FUNCTION public.purchase_order_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_order_overview(uuid) TO authenticated;
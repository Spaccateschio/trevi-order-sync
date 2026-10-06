ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS customer_modified_at timestamptz,
  ADD COLUMN IF NOT EXISTS danea_exported_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS previous_quantity numeric;

CREATE TABLE IF NOT EXISTS public.purchase_order_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.purchase_orders(id),
  buyer_company_id uuid NOT NULL,
  seller_company_id uuid,
  item_id uuid,
  field text NOT NULL,
  label text,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.purchase_order_changes TO authenticated;
GRANT ALL ON public.purchase_order_changes TO service_role;
ALTER TABLE public.purchase_order_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_changes_read ON public.purchase_order_changes FOR SELECT TO authenticated
  USING (public.is_company_member(buyer_company_id) OR (seller_company_id IS NOT NULL AND public.is_company_member(seller_company_id)));
CREATE INDEX IF NOT EXISTS purchase_order_changes_order_idx ON public.purchase_order_changes(order_id, changed_at);

CREATE TABLE IF NOT EXISTS public.purchase_order_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.purchase_orders(id),
  buyer_company_id uuid NOT NULL,
  seller_company_id uuid NOT NULL,
  note text NOT NULL,
  status text NOT NULL DEFAULT 'in_attesa',
  requested_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text
);
GRANT SELECT ON public.purchase_order_change_requests TO authenticated;
GRANT ALL ON public.purchase_order_change_requests TO service_role;
ALTER TABLE public.purchase_order_change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_change_requests_read ON public.purchase_order_change_requests FOR SELECT TO authenticated
  USING (public.is_company_member(buyer_company_id) OR public.is_company_member(seller_company_id));

-- Righe ordine: modificabili dopo l'invio solo dentro la RPC del cliente.
CREATE OR REPLACE FUNCTION public.assert_order_items_frozen()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status public.purchase_order_status;
BEGIN
  IF current_setting('app.customer_order_edit', true) = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT status INTO v_status FROM public.purchase_orders WHERE id = COALESCE(NEW.order_id, OLD.order_id);
  IF v_status IS DISTINCT FROM 'bozza' THEN
    RAISE EXCEPTION 'Ordine già inviato: le righe ordinate non sono più modificabili';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.customer_update_order_full(
  _order_id uuid, _delivery_date date, _time_from time, _time_to time, _address text, _notes text, _items jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.purchase_orders; _seller uuid; _buyer text; it public.purchase_order_items; e jsonb;
  _q numeric; _kept uuid[] := '{}'; _lnk public.product_supplier_links; _p record; _ucode text; _count int; _changed int := 0;
BEGIN
  SELECT * INTO o FROM public.purchase_orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL OR NOT public.is_company_member(o.company_id) THEN RAISE EXCEPTION 'Non autorizzato'; END IF;
  IF o.status <> 'inviato' THEN RAISE EXCEPTION 'ORDER_LOCKED: Ordine non più modificabile'; END IF;
  IF o.seen_by_supplier_at IS NOT NULL THEN RAISE EXCEPTION 'ORDER_LOCKED: L''ordine è stato appena bloccato dal fornitore'; END IF;
  SELECT seller_company_id INTO _seller FROM public.supplier_customer_relations WHERE id = o.relation_id;
  PERFORM set_config('app.customer_order_edit', 'on', true);

  -- intestazione
  IF o.delivery_date IS DISTINCT FROM _delivery_date THEN
    INSERT INTO public.purchase_order_changes(order_id,buyer_company_id,seller_company_id,field,label,old_value,new_value,changed_by)
    VALUES (o.id,o.company_id,_seller,'delivery_date','Data consegna',o.delivery_date::text,_delivery_date::text,auth.uid()); _changed := _changed+1; END IF;
  IF o.delivery_time_from IS DISTINCT FROM _time_from OR o.delivery_time_to IS DISTINCT FROM _time_to THEN
    INSERT INTO public.purchase_order_changes(order_id,buyer_company_id,seller_company_id,field,label,old_value,new_value,changed_by)
    VALUES (o.id,o.company_id,_seller,'delivery_time','Orario',concat_ws('–',left(o.delivery_time_from::text,5),left(o.delivery_time_to::text,5)),concat_ws('–',left(_time_from::text,5),left(_time_to::text,5)),auth.uid()); _changed := _changed+1; END IF;
  IF o.delivery_address_text IS DISTINCT FROM NULLIF(trim(_address),'') THEN
    INSERT INTO public.purchase_order_changes(order_id,buyer_company_id,seller_company_id,field,label,old_value,new_value,changed_by)
    VALUES (o.id,o.company_id,_seller,'delivery_address','Luogo',o.delivery_address_text,NULLIF(trim(_address),''),auth.uid()); _changed := _changed+1; END IF;
  IF o.notes IS DISTINCT FROM NULLIF(trim(_notes),'') THEN
    INSERT INTO public.purchase_order_changes(order_id,buyer_company_id,seller_company_id,field,label,old_value,new_value,changed_by)
    VALUES (o.id,o.company_id,_seller,'notes','Note',o.notes,NULLIF(trim(_notes),''),auth.uid()); _changed := _changed+1; END IF;

  -- righe
  FOR e IN SELECT * FROM jsonb_array_elements(coalesce(_items,'[]'::jsonb)) LOOP
    _q := NULLIF(e->>'quantity','')::numeric;
    IF _q IS NULL OR _q <= 0 THEN CONTINUE; END IF;
    IF e ? 'item_id' AND NULLIF(e->>'item_id','') IS NOT NULL THEN
      SELECT * INTO it FROM public.purchase_order_items WHERE id = (e->>'item_id')::uuid AND order_id = o.id;
      IF it.id IS NULL THEN RAISE EXCEPTION 'Riga non valida'; END IF;
      _kept := _kept || it.id;
      IF it.purchase_quantity IS DISTINCT FROM _q THEN
        INSERT INTO public.purchase_order_changes(order_id,buyer_company_id,seller_company_id,item_id,field,label,old_value,new_value,changed_by)
        VALUES (o.id,o.company_id,_seller,it.id,'quantity',it.product_name,it.purchase_quantity::text,_q::text,auth.uid());
        UPDATE public.purchase_order_items SET
          previous_quantity = coalesce(previous_quantity, it.purchase_quantity),
          purchase_quantity = _q,
          ordered_quantity = CASE WHEN it.conversion_factor IS NOT NULL THEN _q * it.conversion_factor
                                  WHEN it.purchase_unit_id IS NULL OR it.purchase_unit_id = it.unit_id THEN _q ELSE NULL END,
          updated_at = now()
        WHERE id = it.id;
        _changed := _changed+1;
      END IF;
    ELSE
      SELECT * INTO _lnk FROM public.product_supplier_links
       WHERE id = (e->>'link_id')::uuid AND company_id = o.company_id AND supplier_record_id = o.supplier_record_id AND is_active;
      IF _lnk.id IS NULL THEN RAISE EXCEPTION 'Prodotto non acquistabile da questo fornitore'; END IF;
      IF EXISTS (SELECT 1 FROM public.purchase_order_items WHERE order_id = o.id AND product_supplier_link_id = _lnk.id) THEN CONTINUE; END IF;
      SELECT id, code, description, danea_um INTO _p FROM public.products WHERE id = _lnk.product_id;
      SELECT code INTO _ucode FROM public.units_of_measure WHERE id = _lnk.purchase_unit_id;
      INSERT INTO public.purchase_order_items(order_id,company_id,product_id,product_supplier_link_id,purchase_quantity,purchase_unit_id,purchase_unit_code,
        conversion_factor,ordered_quantity,unit_code,supplier_product_code,product_name,product_code,previous_quantity)
      VALUES (o.id,o.company_id,_p.id,_lnk.id,_q,_lnk.purchase_unit_id,coalesce(_ucode,_p.danea_um),
        _lnk.conversion_factor,
        CASE WHEN _lnk.conversion_factor IS NOT NULL THEN _q*_lnk.conversion_factor WHEN _lnk.purchase_unit_id IS NULL THEN _q ELSE NULL END,
        _p.danea_um,_lnk.supplier_product_code,_p.description,_p.code,0)
      RETURNING * INTO it;
      _kept := _kept || it.id;
      INSERT INTO public.purchase_order_changes(order_id,buyer_company_id,seller_company_id,item_id,field,label,old_value,new_value,changed_by)
      VALUES (o.id,o.company_id,_seller,it.id,'item_added',_p.description,NULL,_q::text,auth.uid());
      _changed := _changed+1;
    END IF;
  END LOOP;

  FOR it IN SELECT * FROM public.purchase_order_items WHERE order_id = o.id AND NOT (id = ANY(_kept)) LOOP
    INSERT INTO public.purchase_order_changes(order_id,buyer_company_id,seller_company_id,item_id,field,label,old_value,new_value,changed_by)
    VALUES (o.id,o.company_id,_seller,it.id,'item_removed',it.product_name,concat_ws(' ',it.purchase_quantity::text,it.purchase_unit_code),NULL,auth.uid());
    DELETE FROM public.purchase_order_items WHERE id = it.id;
    _changed := _changed+1;
  END LOOP;

  SELECT count(*) INTO _count FROM public.purchase_order_items WHERE order_id = o.id;
  PERFORM set_config('app.customer_order_edit', 'off', true);

  IF _count = 0 THEN
    UPDATE public.purchase_orders SET status = 'annullato', cancelled_at = now(), cancelled_by = auth.uid(),
      cancel_reason = 'Tutti i prodotti rimossi dal cliente', updated_at = now() WHERE id = o.id;
    RETURN 'annullato';
  END IF;
  IF _changed = 0 THEN RETURN 'invariato'; END IF;

  UPDATE public.purchase_orders SET delivery_date = _delivery_date, delivery_time_from = _time_from, delivery_time_to = _time_to,
    delivery_address_text = NULLIF(trim(_address),''), notes = NULLIF(trim(_notes),''), customer_modified_at = now(), updated_at = now()
   WHERE id = o.id;
  IF _seller IS NOT NULL THEN
    SELECT legal_name INTO _buyer FROM public.companies WHERE id = o.company_id;
    INSERT INTO public.notifications(company_id, type, title, body, link, entity_id)
    VALUES (_seller, 'ordine_modificato', 'Ordine ' || coalesce(o.number,'') || ' modificato', 'Modificato da ' || coalesce(_buyer,'cliente'), '/vendite/ordini-clienti', o.id);
  END IF;
  RETURN 'modificato';
END $$;
GRANT EXECUTE ON FUNCTION public.customer_update_order_full(uuid,date,time,time,text,text,jsonb) TO authenticated;

-- Apertura del fornitore: lucchetto + il badge «Modificato» sparisce.
CREATE OR REPLACE FUNCTION public.mark_order_seen_by_supplier(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _seller uuid;
BEGIN
  SELECT r.seller_company_id INTO _seller FROM public.purchase_orders o
    JOIN public.supplier_customer_relations r ON r.id = o.relation_id WHERE o.id = _order_id;
  IF _seller IS NULL OR NOT public.is_company_member(_seller) THEN RAISE EXCEPTION 'Non autorizzato'; END IF;
  UPDATE public.purchase_orders SET seen_by_supplier_at = now(), seen_by_supplier_by = auth.uid(), customer_modified_at = NULL
   WHERE id = _order_id AND seen_by_supplier_at IS NULL AND status NOT IN ('bozza','annullato');
END $$;

CREATE OR REPLACE FUNCTION public.request_order_change(_order_id uuid, _note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.purchase_orders; _seller uuid; _id uuid; _buyer text;
BEGIN
  SELECT * INTO o FROM public.purchase_orders WHERE id = _order_id;
  IF o.id IS NULL OR NOT public.is_company_member(o.company_id) THEN RAISE EXCEPTION 'Non autorizzato'; END IF;
  IF NULLIF(trim(_note),'') IS NULL THEN RAISE EXCEPTION 'Scrivi cosa vuoi modificare'; END IF;
  IF o.status <> 'inviato' OR o.seen_by_supplier_at IS NULL THEN RAISE EXCEPTION 'Richiesta non necessaria: ordine non bloccato'; END IF;
  SELECT seller_company_id INTO _seller FROM public.supplier_customer_relations WHERE id = o.relation_id;
  IF _seller IS NULL THEN RAISE EXCEPTION 'Ordine senza fornitore collegato'; END IF;
  IF EXISTS (SELECT 1 FROM public.purchase_order_change_requests WHERE order_id = o.id AND status = 'in_attesa') THEN
    RAISE EXCEPTION 'C''è già una richiesta in attesa per questo ordine'; END IF;
  INSERT INTO public.purchase_order_change_requests(order_id,buyer_company_id,seller_company_id,note,requested_by)
  VALUES (o.id,o.company_id,_seller,trim(_note),auth.uid()) RETURNING id INTO _id;
  SELECT legal_name INTO _buyer FROM public.companies WHERE id = o.company_id;
  INSERT INTO public.notifications(company_id,type,title,body,link,entity_id)
  VALUES (_seller,'richiesta_modifica','Richiesta di modifica ' || coalesce(o.number,''), coalesce(_buyer,'Cliente') || ': ' || left(trim(_note),140), '/vendite/ordini-clienti', o.id);
  RETURN _id;
END $$;
GRANT EXECUTE ON FUNCTION public.request_order_change(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_order_change(_request_id uuid, _accept boolean, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.purchase_order_change_requests; o public.purchase_orders;
BEGIN
  SELECT * INTO r FROM public.purchase_order_change_requests WHERE id = _request_id FOR UPDATE;
  IF r.id IS NULL OR NOT public.is_company_member(r.seller_company_id) THEN RAISE EXCEPTION 'Non autorizzato'; END IF;
  IF r.status <> 'in_attesa' THEN RAISE EXCEPTION 'Richiesta già gestita'; END IF;
  SELECT * INTO o FROM public.purchase_orders WHERE id = r.order_id FOR UPDATE;
  UPDATE public.purchase_order_change_requests SET status = CASE WHEN _accept THEN 'accettata' ELSE 'rifiutata' END,
    decided_by = auth.uid(), decided_at = now(), decision_note = NULLIF(trim(_note),'') WHERE id = r.id;
  IF _accept THEN
    UPDATE public.purchase_orders SET seen_by_supplier_at = NULL, seen_by_supplier_by = NULL, updated_at = now() WHERE id = o.id;
  END IF;
  INSERT INTO public.notifications(company_id,type,title,body,link,entity_id)
  VALUES (r.buyer_company_id, CASE WHEN _accept THEN 'modifica_accettata' ELSE 'modifica_rifiutata' END,
    CASE WHEN _accept THEN 'Modifica accettata: ' ELSE 'Modifica rifiutata: ' END || coalesce(o.number,''),
    CASE WHEN _accept THEN 'Ora puoi modificare l''ordine' ELSE coalesce(NULLIF(trim(_note),''),'Il fornitore ha rifiutato la richiesta') END,
    '/acquisti/ordini', o.id);
END $$;
GRANT EXECUTE ON FUNCTION public.decide_order_change(uuid,boolean,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.supplier_cancel_order(_order_id uuid, _reason text)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.purchase_orders; _seller uuid;
BEGIN
  SELECT * INTO o FROM public.purchase_orders WHERE id = _order_id FOR UPDATE;
  SELECT seller_company_id INTO _seller FROM public.supplier_customer_relations WHERE id = o.relation_id;
  IF o.id IS NULL OR _seller IS NULL OR NOT public.is_company_member(_seller) THEN RAISE EXCEPTION 'Non autorizzato'; END IF;
  IF o.status NOT IN ('inviato') THEN RAISE EXCEPTION 'Ordine non annullabile in questo stato'; END IF;
  IF EXISTS (SELECT 1 FROM public.goods_receipts g WHERE g.purchase_order_id = o.id AND g.status = 'confermato') THEN
    RAISE EXCEPTION 'Esiste già un carico merce confermato'; END IF;
  UPDATE public.purchase_orders SET status = 'annullato', cancelled_at = now(), cancelled_by = auth.uid(),
    cancel_reason = NULLIF(trim(_reason),''), updated_at = now() WHERE id = o.id;
  INSERT INTO public.purchase_order_changes(order_id,buyer_company_id,seller_company_id,field,label,old_value,new_value,changed_by)
  VALUES (o.id,o.company_id,_seller,'cancelled_by_supplier','Annullato dal fornitore',o.status::text,coalesce(NULLIF(trim(_reason),''),'annullato'),auth.uid());
  INSERT INTO public.notifications(company_id,type,title,body,link,entity_id)
  VALUES (o.company_id,'ordine_annullato_fornitore','Ordine ' || coalesce(o.number,'') || ' annullato dal fornitore',
    coalesce(NULLIF(trim(_reason),''),'Il fornitore ha annullato l''ordine'),'/acquisti/ordini',o.id);
  RETURN o.danea_exported_at;
END $$;
GRANT EXECUTE ON FUNCTION public.supplier_cancel_order(uuid,text) TO authenticated;
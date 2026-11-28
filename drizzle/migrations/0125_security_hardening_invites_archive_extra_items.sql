CREATE OR REPLACE FUNCTION public.generate_invite_code()
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  _code text; _bytes bytea; _i int;
BEGIN
  LOOP
    _code := '';
    _bytes := extensions.gen_random_bytes(8);
    FOR _i IN 0..7 LOOP
      _code := _code || substr(_alphabet, 1 + (get_byte(_bytes, _i) % 32), 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.company_invitations WHERE invite_code = _code);
  END LOOP;
  RETURN _code;
END;
$function$;

CREATE OR REPLACE FUNCTION public.accept_invitation_code(_code text, _buyer_company_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _norm text := upper(regexp_replace(coalesce(_code, ''), '[^A-Za-z0-9]', '', 'g'));
  _id uuid;
BEGIN
  IF _norm = '' THEN RAISE EXCEPTION 'Indica il codice invito'; END IF;
  SELECT id INTO _id FROM public.company_invitations WHERE invite_code = _norm;
  IF _id IS NULL THEN RAISE EXCEPTION 'Codice invito non valido o già utilizzato'; END IF;
  UPDATE public.company_invitations SET status = 'annullato_scaduto', decided_at = now()
  WHERE id = _id AND status = 'in_attesa' AND expires_at < now();
  RETURN public.accept_invitation_row(_id, _buyer_company_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.buyer_visible_archive(_seller_company_id uuid, _buyer_company_id uuid DEFAULT NULL::uuid)
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH recs AS (
    SELECT cr.archive_id
    FROM public.supplier_customer_relations r
    LEFT JOIN public.customer_records cr
      ON cr.id = r.customer_record_id AND cr.seller_company_id = r.seller_company_id
    WHERE r.seller_company_id = _seller_company_id
      AND (
        (_buyer_company_id IS NOT NULL AND r.buyer_company_id = _buyer_company_id
          AND (public.is_company_member(_buyer_company_id) OR public.is_company_member(_seller_company_id)))
        OR (_buyer_company_id IS NULL
            AND r.status = 'attivo' AND r.seller_enabled AND r.buyer_enabled
            AND EXISTS (SELECT 1 FROM public.company_members m
                        WHERE m.company_id = r.buyer_company_id
                          AND m.user_id = auth.uid() AND m.status = 'attivo'))
      )
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM recs) THEN NULL
    WHEN EXISTS (SELECT 1 FROM recs WHERE archive_id IS NULL) THEN NULL
    WHEN (SELECT count(DISTINCT archive_id) FROM recs) = 1 THEN (SELECT min(archive_id::text)::uuid FROM recs)
    ELSE NULL
  END;
$function$;

CREATE OR REPLACE FUNCTION public.add_purchase_delivery_extra_item(_delivery_id uuid, _product_id uuid, _declared_quantity numeric, _line_type purchase_delivery_line_type DEFAULT 'aggiunta_fornitore'::purchase_delivery_line_type, _replaces_order_item_id uuid DEFAULT NULL::uuid, _unit_id uuid DEFAULT NULL::uuid, _unit_code text DEFAULT NULL::text, _declared_producer text DEFAULT NULL::text, _declared_producer_lot text DEFAULT NULL::text, _line_notes text DEFAULT NULL::text, _actor_label text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_d public.purchase_deliveries; v_id uuid; v_buyer uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_d FROM public.purchase_deliveries WHERE id = _delivery_id;
  IF v_d.id IS NULL THEN RAISE EXCEPTION 'Consegna non trovata'; END IF;
  IF NOT public.can_declare_on_order(v_d.order_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF v_d.status <> 'bozza' THEN RAISE EXCEPTION 'Consegna già dichiarata'; END IF;
  IF _line_type = 'ordinata' THEN RAISE EXCEPTION 'Tipo riga non valido'; END IF;
  SELECT company_id INTO v_buyer FROM public.purchase_orders WHERE id = v_d.order_id;
  IF _product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = _product_id
      AND (p.company_id = v_buyer
        OR p.company_id IN (SELECT p2.company_id FROM public.purchase_order_items oi
                            JOIN public.products p2 ON p2.id = oi.product_id
                            WHERE oi.order_id = v_d.order_id))
  ) THEN RAISE EXCEPTION 'Prodotto non valido per questo ordine'; END IF;
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
END; $function$;
-- Le tre funzioni di sola lettura usano ora le autorizzazioni del chiamante.
ALTER FUNCTION public.inventory_session_rows(uuid, uuid, text, text, text, boolean, integer) SECURITY INVOKER;
ALTER FUNCTION public.product_stock_overview(uuid) SECURITY INVOKER;
ALTER FUNCTION public.customer_record_match_suggestions(uuid) SECURITY INVOKER;

REVOKE ALL ON FUNCTION public.inventory_session_rows(uuid, uuid, text, text, text, boolean, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.product_stock_overview(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.customer_record_match_suggestions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_session_rows(uuid, uuid, text, text, text, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.product_stock_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_record_match_suggestions(uuid) TO authenticated;

-- La conferma e lo storico di condivisione leggono fin dall'inizio solo ordini autorizzati.
CREATE OR REPLACE FUNCTION public.confirm_non_b2b_order_share(_order_id uuid, _channel text, _recipient text, _confirmation_key uuid, _mode text DEFAULT 'first') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.purchase_orders; e public.audit_events; ch text:=lower(btrim(_channel)); recipient text:=nullif(btrim(_recipient),''); closed boolean:=false; event_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticazione richiesta'; END IF;
 SELECT * INTO o FROM public.purchase_orders
 WHERE id=_order_id
   AND public.is_company_member(company_id)
   AND (public.is_company_admin(company_id) OR public.has_company_role(company_id,'operatore'));
 IF o.id IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
 IF o.shopping_list_id IS NOT NULL THEN PERFORM 1 FROM public.shopping_lists WHERE id=o.shopping_list_id FOR UPDATE; END IF;
 SELECT * INTO o FROM public.purchase_orders WHERE id=_order_id AND company_id=o.company_id FOR UPDATE;
 IF o.relation_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.purchase_order_items i JOIN public.product_supplier_links l ON l.id=i.product_supplier_link_id WHERE i.order_id=o.id AND (l.supplier_company_id IS NOT NULL OR l.b2b_item_id IS NOT NULL)) THEN RAISE EXCEPTION 'Solo ordini non B2B'; END IF;
 IF _confirmation_key IS NULL OR _mode IS NULL OR _mode NOT IN ('first','resend') OR ch IS NULL OR ch NOT IN ('whatsapp','email','sms','telefono','di_persona','altro','copia_testo') THEN RAISE EXCEPTION 'Conferma non valida'; END IF;
 IF length(coalesce(recipient,''))>320 OR (ch IN ('email','whatsapp','sms') AND recipient IS NULL) THEN RAISE EXCEPTION 'Destinatario necessario'; END IF;
 IF ch='email' AND recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Email non valida'; END IF;
 IF ch IN ('whatsapp','sms') AND recipient !~ '^\+?[0-9 ()-]{6,30}$' THEN RAISE EXCEPTION 'Telefono non valido'; END IF;
 SELECT * INTO e FROM public.audit_events WHERE entity_id=o.id AND company_id=o.company_id AND action='purchase_order.share_confirmed' AND detail->>'key'=_confirmation_key::text LIMIT 1;
 IF e.id IS NOT NULL THEN
  IF e.actor_user_id IS DISTINCT FROM auth.uid() OR e.detail->>'mode' IS DISTINCT FROM _mode OR e.detail->>'channel' IS DISTINCT FROM ch OR e.detail->>'recipient' IS DISTINCT FROM recipient THEN RAISE EXCEPTION 'Chiave già utilizzata per altra conferma'; END IF;
  RETURN jsonb_build_object('event_id',e.id,'duplicate',true,'list_closed',coalesce((e.detail->>'list_closed')::boolean,false));
 END IF;
 IF _mode='first' THEN
  IF o.status<>'bozza' OR o.send_status='inviato' THEN RAISE EXCEPTION 'Ordine già confermato: usa Rimanda ordine'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.purchase_order_items WHERE order_id=o.id) THEN RAISE EXCEPTION 'Ordine senza righe'; END IF;
  IF o.shopping_list_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.shopping_lists WHERE id=o.shopping_list_id AND status='aperta') THEN RAISE EXCEPTION 'Lista non aperta'; END IF;
 ELSE
  IF o.status NOT IN ('inviato','parzialmente_consegnato','consegnato','chiuso') OR o.sent_at IS NULL THEN RAISE EXCEPTION 'Ordine non ancora inviato'; END IF;
 END IF;
 IF _mode='first' THEN
  UPDATE public.purchase_orders SET status='inviato',send_status='inviato',sent_at=now(),send_channel=ch WHERE id=o.id AND company_id=o.company_id;
  IF o.shopping_list_id IS NOT NULL THEN closed:=public._shopping_list_try_complete(o.shopping_list_id,auth.uid()); END IF;
 END IF;
 INSERT INTO public.audit_events(company_id,actor_user_id,action,entity_type,entity_id,detail) VALUES(o.company_id,auth.uid(),'purchase_order.share_confirmed','purchase_order',o.id,jsonb_build_object('key',_confirmation_key,'mode',_mode,'channel',ch,'recipient',recipient,'list_closed',closed)) RETURNING id INTO event_id;
 RETURN jsonb_build_object('event_id',event_id,'duplicate',false,'list_closed',closed);
END $$;

CREATE OR REPLACE FUNCTION public.order_share_history(_order_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.purchase_orders; result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticazione richiesta'; END IF;
 SELECT * INTO o FROM public.purchase_orders
 WHERE id=_order_id
   AND public.is_company_member(company_id)
   AND (public.is_company_admin(company_id) OR public.has_company_role(company_id,'operatore'));
 IF o.id IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'at',a.created_at,'actor',coalesce(nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),'Utente'),'action',a.action,'detail',a.detail) ORDER BY a.created_at DESC,a.id),'[]'::jsonb) INTO result FROM public.audit_events a LEFT JOIN public.profiles p ON p.user_id=a.actor_user_id WHERE a.entity_id=o.id AND a.company_id=o.company_id AND a.action IN ('purchase_order.send','purchase_order.share_confirmed','purchase_order.send_confirmation_undone');
 RETURN result;
END $$;

-- L'invito cliente seleziona l'anagrafica soltanto se l'utente è amministratore del venditore.
CREATE OR REPLACE FUNCTION public.create_customer_invitation(
  _customer_record_id uuid, _email text, _valid_days integer DEFAULT 14,
  _price_list_number smallint DEFAULT NULL
)
RETURNS TABLE(invitation_id uuid, token text, invite_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _seller uuid;
  _email_norm text := lower(btrim(coalesce(_email, '')));
  _token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  _code text := public.generate_invite_code();
  _list smallint;
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Autenticazione richiesta'; END IF;
  SELECT seller_company_id INTO _seller FROM public.customer_records
  WHERE id = _customer_record_id AND public.is_company_admin(seller_company_id);
  IF _seller IS NULL THEN RAISE EXCEPTION 'Cliente non trovato o accesso non consentito'; END IF;
  IF _email_norm = '' OR position('@' in _email_norm) = 0 THEN
    RAISE EXCEPTION 'Indica un indirizzo email valido';
  END IF;

  _list := COALESCE(_price_list_number, public.resolve_default_price_list(_seller));
  IF _list IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.danea_price_lists l
     WHERE l.company_id = _seller AND l.list_number = _list AND l.is_active
  ) THEN
    _list := NULL;
  END IF;

  UPDATE public.company_invitations SET status = 'annullato_scaduto', decided_at = now()
  WHERE seller_company_id = _seller AND status = 'in_attesa' AND expires_at < now();

  IF EXISTS (
    SELECT 1 FROM public.company_invitations
    WHERE seller_company_id = _seller AND email_normalized = _email_norm AND status = 'in_attesa'
  ) THEN
    RAISE EXCEPTION 'Esiste già un invito in attesa per questa email: usa Reinvia';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.customer_records cr
    JOIN public.companies c ON c.vat_normalized = cr.vat_normalized
    JOIN public.supplier_customer_relations r
      ON r.seller_company_id = _seller AND r.buyer_company_id = c.id AND r.status = 'attivo'
    WHERE cr.id = _customer_record_id AND cr.seller_company_id = _seller AND cr.vat_normalized IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Questo cliente è già collegato alla tua azienda';
  END IF;

  INSERT INTO public.company_invitations (
    seller_company_id, customer_record_id, email, email_normalized, token_hash,
    invite_code, expires_at, invited_by, price_list_number
  ) VALUES (
    _seller, _customer_record_id, btrim(_email), _email_norm,
    encode(sha256(_token::bytea), 'hex'), _code,
    now() + make_interval(days => greatest(1, least(60, coalesce(_valid_days, 14)))), _uid, _list
  ) RETURNING id INTO _id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_seller, _uid, 'invitation.created', 'invitation', _id,
          jsonb_build_object('customer_record_id', _customer_record_id, 'email', _email_norm,
                             'price_list_number', _list));

  RETURN QUERY SELECT _id, _token, _code;
END;
$$;

-- La conferma dell'acquisto diretto limita subito il documento all'azienda e al ruolo.
CREATE OR REPLACE FUNCTION public.confirm_direct_purchase(_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_doc public.direct_purchases%ROWTYPE; v_list public.shopping_lists%ROWTYPE;
  r record; v_dp uuid; v_closed boolean; v_n int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_doc FROM public.direct_purchases
  WHERE id = _id
    AND public.is_company_member(company_id)
    AND public._direct_purchase_actor_ok(company_id);
  IF v_doc.id IS NULL THEN RAISE EXCEPTION 'Documento non trovato o accesso non consentito'; END IF;
  -- Stesso ordine di blocco della Lista: prima la Lista, poi il documento.
  IF v_doc.shopping_list_id IS NOT NULL THEN
    SELECT * INTO v_list FROM public.shopping_lists WHERE id = v_doc.shopping_list_id AND company_id=v_doc.company_id FOR UPDATE;
  END IF;
  SELECT * INTO v_doc FROM public.direct_purchases WHERE id = _id AND company_id=v_doc.company_id FOR UPDATE;
  IF v_doc.status = 'confermato' THEN RETURN jsonb_build_object('id', _id, 'already_confirmed', true); END IF;
  IF v_doc.status <> 'bozza' THEN RAISE EXCEPTION 'Documento annullato: non si può confermare'; END IF;
  IF v_list.id IS NOT NULL AND v_list.status <> 'aperta' THEN RAISE EXCEPTION 'La lista non è più aperta'; END IF;
  -- Tutti i controlli prima della prima scrittura.
  FOR r IN SELECT d.*, i.id AS cur_id, i.list_id AS cur_list, i.excluded_at, i.manual_purchase_quantity AS cur_q,
                  i.manual_purchase_unit_id AS cur_u, i.manual_purchase_unit_code AS cur_uc, i.manual_purchase_done_at
             FROM public.direct_purchase_items d LEFT JOIN public.shopping_list_items i ON i.id = d.source_item_id
            WHERE d.direct_purchase_id = _id AND d.company_id=v_doc.company_id ORDER BY d.sort_order FOR UPDATE OF d LOOP
    v_n := v_n + 1;
    IF r.quantity IS NULL OR r.quantity <= 0 THEN RAISE EXCEPTION 'Inserisci la quantità effettiva per %', r.product_name; END IF;
    IF r.unit_id IS NULL OR NOT public._company_unit_active(v_doc.company_id, r.unit_id) THEN RAISE EXCEPTION 'U.M. mancante o non attiva per %', r.product_name; END IF;
    IF r.unit_price IS NOT NULL AND (r.price_unit_id IS NULL OR NOT public._company_unit_active(v_doc.company_id, r.price_unit_id)) THEN
      RAISE EXCEPTION 'U.M. del prezzo mancante o non attiva per %', r.product_name; END IF;
    IF r.source_item_id IS NOT NULL THEN
      IF r.cur_id IS NULL OR r.cur_list IS DISTINCT FROM v_doc.shopping_list_id THEN RAISE EXCEPTION 'La riga della Lista di % non esiste più', r.product_name; END IF;
      IF r.excluded_at IS NOT NULL THEN RAISE EXCEPTION '% è stato escluso dalla Lista: annulla la bozza o riprendi la riga', r.product_name; END IF;
      IF r.manual_purchase_done_at IS NOT NULL THEN RAISE EXCEPTION 'La quota diretta di % risulta già registrata', r.product_name; END IF;
      IF r.cur_q IS NULL THEN RAISE EXCEPTION 'La quota diretta di % è stata tolta dalla Lista: annulla la bozza', r.product_name; END IF;
      IF r.cur_q IS DISTINCT FROM r.planned_quantity OR r.cur_u IS DISTINCT FROM r.planned_unit_id OR r.cur_uc IS DISTINCT FROM r.planned_unit_code THEN
        RAISE EXCEPTION 'La quota diretta di % è cambiata nella Lista dopo la bozza: annulla la bozza e generane una nuova', r.product_name; END IF;
    END IF;
  END LOOP;
  IF v_n = 0 THEN RAISE EXCEPTION 'Il documento non ha righe'; END IF;
  FOR r IN SELECT d.* FROM public.direct_purchase_items d WHERE d.direct_purchase_id = _id AND d.company_id=v_doc.company_id AND d.source_item_id IS NOT NULL LOOP
    INSERT INTO public.shopping_list_direct_purchases (company_id, list_id, item_id, product_id, product_name, product_code,
      quantity, unit_id, unit_code, origin, notes, created_by, direct_purchase_doc_id, direct_purchase_item_id)
    VALUES (v_doc.company_id, v_doc.shopping_list_id, r.source_item_id, r.product_id, r.product_name, r.product_code,
        r.planned_quantity, r.planned_unit_id, r.planned_unit_code, 'esplicito', 'Acquisto diretto ' || v_doc.number, v_uid, _id, r.id)
    RETURNING id INTO v_dp;
    UPDATE public.shopping_list_items SET manual_purchase_done_at = now(), manual_purchase_done_by = v_uid, direct_purchase_id = v_dp
     WHERE id = r.source_item_id AND company_id=v_doc.company_id;
  END LOOP;
  UPDATE public.direct_purchases SET status = 'confermato', confirmed_at = now(), confirmed_by = v_uid, updated_at = now() WHERE id = _id AND company_id=v_doc.company_id;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_doc.company_id, v_uid, 'direct_purchase.confirmed', 'direct_purchase', _id, jsonb_build_object('number', v_doc.number, 'lines', v_n));
  v_closed := CASE WHEN v_doc.shopping_list_id IS NOT NULL THEN public._shopping_list_try_complete(v_doc.shopping_list_id, v_uid) ELSE false END;
  RETURN jsonb_build_object('id', _id, 'already_confirmed', false, 'list_closed', v_closed);
END $function$;

-- La copia dal catalogo legge l'articolo del venditore solo dentro una relazione operativa.
CREATE OR REPLACE FUNCTION public.copy_b2b_item_to_own_product(
  _buyer_company_id uuid, _seller_company_id uuid, _seller_product_id uuid,
  _description text, _code text DEFAULT NULL, _category text DEFAULT NULL,
  _subcategory text DEFAULT NULL, _barcode text DEFAULT NULL, _producer_name text DEFAULT NULL,
  _notes text DEFAULT NULL, _stock_unit_id uuid DEFAULT NULL, _price_unit_id uuid DEFAULT NULL,
  _force_new boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_seller public.products;
  v_relation uuid; v_supplier_record uuid;
  v_unit public.units_of_measure;
  v_existing jsonb; v_active record;
  v_archive uuid; v_code text := NULLIF(btrim(COALESCE(_code,'')),'');
  v_product uuid; v_link uuid; v_constraint text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF NOT public.is_company_admin(_buyer_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;
  IF NOT public.relation_is_operational(_seller_company_id, _buyer_company_id) THEN
    RAISE EXCEPTION 'Catalogo fornitore non accessibile';
  END IF;
  IF _description IS NULL OR btrim(_description) = '' THEN
    RAISE EXCEPTION 'La descrizione del prodotto è obbligatoria';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_item:'||_buyer_company_id||':'||_seller_product_id, 0));

  SELECT r.id, r.supplier_record_id INTO v_relation, v_supplier_record
  FROM public.supplier_customer_relations r
  JOIN public.supplier_records s ON s.id = r.supplier_record_id AND s.buyer_company_id = _buyer_company_id
  WHERE r.buyer_company_id = _buyer_company_id AND r.seller_company_id = _seller_company_id
    AND r.status = 'attivo' AND r.seller_enabled AND r.buyer_enabled
  ORDER BY r.created_at DESC LIMIT 1;
  IF v_supplier_record IS NULL THEN
    RAISE EXCEPTION 'Rapporto con il fornitore senza scheda fornitore: abbinala prima di aggiungere il prodotto';
  END IF;

  SELECT * INTO v_seller FROM public.products
  WHERE id = _seller_product_id AND company_id = _seller_company_id
    AND public.relation_is_operational(company_id, _buyer_company_id);
  IF v_seller.id IS NULL THEN RAISE EXCEPTION 'Articolo di catalogo non trovato per questo fornitore'; END IF;

  IF _stock_unit_id IS NOT NULL THEN
    SELECT * INTO v_unit FROM public.units_of_measure
     WHERE id = _stock_unit_id AND company_id = _buyer_company_id AND status = 'attivo';
    IF NOT FOUND THEN RAISE EXCEPTION 'U.M. di magazzino non valida per la tua azienda'; END IF;
  END IF;
  IF _price_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.units_of_measure WHERE id = _price_unit_id AND company_id = _buyer_company_id) THEN
    RAISE EXCEPTION 'Unità di misura del prezzo non trovata';
  END IF;

  SELECT l.id, p.id AS product_id, p.code, p.description INTO v_active
  FROM public.product_supplier_links l JOIN public.products p ON p.id = l.product_id
  WHERE l.company_id = _buyer_company_id AND p.company_id=_buyer_company_id AND l.b2b_item_id = _seller_product_id AND l.is_active;

  SELECT jsonb_agg(jsonb_build_object('id',p.id,'code',p.code,'description',p.description,
           'created_at',p.created_at,'linked', p.id IS NOT DISTINCT FROM v_active.product_id) ORDER BY p.created_at)
    INTO v_existing
  FROM public.products p
  WHERE p.company_id = _buyer_company_id
    AND ((p.created_from_product_id = _seller_product_id AND p.created_from_company_id = _seller_company_id)
         OR p.id = v_active.product_id);
  IF v_existing IS NOT NULL AND NOT _force_new THEN
    RETURN jsonb_build_object('status','needs_confirmation','existing',v_existing);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('internal_product_code:' || _buyer_company_id::text, 0));
  v_archive := public.ensure_internal_archive(_buyer_company_id, auth.uid());
  IF v_code IS NULL THEN v_code := public.next_internal_product_code(_buyer_company_id); END IF;
  IF EXISTS (SELECT 1 FROM public.products WHERE company_id = _buyer_company_id AND archive_id = v_archive AND code = v_code) THEN
    RAISE EXCEPTION 'Esiste già un prodotto con il codice %', v_code;
  END IF;

  BEGIN
    INSERT INTO public.products (company_id, archive_id, code, description, category, subcategory, danea_um,
      barcode, producer_name, notes, publish_status, origin, is_managed, b2b_visible, price_unit_id,
      created_from_product_id, created_from_company_id)
    VALUES (_buyer_company_id, v_archive, v_code, btrim(_description),
      NULLIF(btrim(COALESCE(_category,'')),''), NULLIF(btrim(COALESCE(_subcategory,'')),''),
      CASE WHEN _stock_unit_id IS NOT NULL THEN v_unit.code END,
      NULLIF(btrim(COALESCE(_barcode,'')),''), NULLIF(btrim(COALESCE(_producer_name,'')),''),
      NULLIF(btrim(COALESCE(_notes,'')),''), 'pubblicato', 'interno', true, false, _price_unit_id,
      _seller_product_id, _seller_company_id)
    RETURNING id INTO v_product;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'products_archive_code_unique' THEN
      RAISE EXCEPTION 'Il codice % è già in uso: riprova', v_code;
    END IF;
    RAISE;
  END;

  IF _stock_unit_id IS NOT NULL THEN
    PERFORM public.set_product_stock_unit(v_product, _stock_unit_id);
  END IF;

  IF v_active.id IS NULL THEN
    INSERT INTO public.product_supplier_links (company_id, product_id, supplier_record_id, supplier_product_code,
      purchase_unit_id, conversion_factor, origin, created_by, supplier_company_id, b2b_item_id)
    VALUES (_buyer_company_id, v_product, v_supplier_record, v_seller.code,
      NULL, NULL, 'manuale', auth.uid(), _seller_company_id, _seller_product_id)
    RETURNING id INTO v_link;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_buyer_company_id, auth.uid(), 'b2b_item.copy_to_own', 'product', v_product,
    jsonb_build_object('seller_company_id',_seller_company_id,'seller_product_id',_seller_product_id,
      'link_id',v_link,'forced',_force_new,'already_linked_product_id',v_active.product_id));

  RETURN jsonb_build_object('status','created','product_id',v_product,'code',v_code,
    'link_id',v_link,'created_link', v_link IS NOT NULL,
    'already_linked_to', CASE WHEN v_active.id IS NOT NULL THEN
        jsonb_build_object('product_id',v_active.product_id,'code',v_active.code,'description',v_active.description) END,
    'conversion_to_verify', true);
END $function$;

-- La generazione ordine blocca da subito una Lista appartenente al chiamante.
CREATE OR REPLACE FUNCTION public.generate_supplier_order(_list_id uuid, _supplier_record_id uuid, _generation_key uuid, _delivery jsonb DEFAULT '{}'::jsonb, _assignment_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_list public.shopping_lists%ROWTYPE; v_ex public.purchase_orders%ROWTYPE;
  v_bad text; v_bad_sup text; v_loc uuid; v_order uuid; v_addr uuid; v_lines int; v_number text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _generation_key IS NULL THEN RAISE EXCEPTION 'Chiave di generazione mancante'; END IF;
  SELECT * INTO v_list FROM public.shopping_lists
  WHERE id = _list_id AND public.is_company_member(company_id) FOR UPDATE;
  IF v_list.id IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_ex FROM public.purchase_orders WHERE company_id = v_list.company_id AND generation_key = _generation_key;
  IF v_ex.id IS NOT NULL THEN
    IF v_ex.shopping_list_id IS DISTINCT FROM _list_id THEN RAISE EXCEPTION 'Chiave di generazione già usata'; END IF;
    RETURN jsonb_build_object('order_id', v_ex.id, 'number', v_ex.number, 'already_exists', true);
  END IF;
  IF v_list.status <> 'aperta' THEN RAISE EXCEPTION 'La lista non è più aperta'; END IF;

  CREATE TEMP TABLE IF NOT EXISTS _gso_cand (assignment_id uuid, residual numeric) ON COMMIT DROP;
  DELETE FROM _gso_cand WHERE true;
  INSERT INTO _gso_cand
  SELECT a.id, public._assignment_residual(a.id)
    FROM (SELECT * FROM public.shopping_list_item_suppliers WHERE deselected_at IS NULL) a JOIN public.shopping_list_items i ON i.id = a.item_id
   WHERE i.list_id = _list_id AND i.company_id=v_list.company_id AND a.supplier_record_id = _supplier_record_id
     AND i.excluded_at IS NULL AND i.decided_quantity IS NOT NULL
     AND (_assignment_ids IS NULL OR a.id = ANY(_assignment_ids));
  DELETE FROM _gso_cand WHERE residual IS NULL OR residual <= 0;
  IF NOT EXISTS (SELECT 1 FROM _gso_cand) THEN RAISE EXCEPTION 'Nessuna quantità da ordinare per questo fornitore'; END IF;

  SELECT string_agg(DISTINCT p.description, ', ') INTO v_bad
    FROM _gso_cand c JOIN (SELECT * FROM public.shopping_list_item_suppliers WHERE deselected_at IS NULL) a ON a.id = c.assignment_id
    JOIN public.shopping_list_items i ON i.id = a.item_id JOIN public.products p ON p.id = i.product_id
    JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
   WHERE i.company_id=v_list.company_id AND p.company_id=v_list.company_id AND l.company_id=v_list.company_id AND NOT l.is_active;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Fornitore scollegato dal prodotto: %', v_bad; END IF;
  SELECT string_agg(DISTINCT p.description, ', '), string_agg(DISTINCT COALESCE(sr.legal_name, 'fornitore'), ', ') INTO v_bad, v_bad_sup
    FROM _gso_cand c JOIN (SELECT * FROM public.shopping_list_item_suppliers WHERE deselected_at IS NULL) a ON a.id = c.assignment_id
    JOIN public.shopping_list_items i ON i.id = a.item_id JOIN public.products p ON p.id = i.product_id
    JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
    LEFT JOIN public.supplier_records sr ON sr.id = l.supplier_record_id AND sr.buyer_company_id=v_list.company_id
   WHERE i.company_id=v_list.company_id AND p.company_id=v_list.company_id AND l.company_id=v_list.company_id
     AND l.supplier_company_id IS NOT NULL
     AND (l.b2b_item_id IS NULL OR NOT public.b2b_item_purchasable(l.supplier_company_id, v_list.company_id, l.b2b_item_id));
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Il prodotto % non è più disponibile nel Catalogo B2B di %', v_bad, v_bad_sup; END IF;
  SELECT string_agg(DISTINCT p.description, ', ') INTO v_bad
    FROM _gso_cand c JOIN (SELECT * FROM public.shopping_list_item_suppliers WHERE deselected_at IS NULL) a ON a.id = c.assignment_id
    JOIN public.shopping_list_items i ON i.id = a.item_id JOIN public.products p ON p.id = i.product_id
   WHERE i.company_id=v_list.company_id AND p.company_id=v_list.company_id AND a.assigned_quantity IS NULL
     AND (a.coverage_confirmed_at IS NULL OR a.coverage_quantity IS DISTINCT FROM a.purchase_quantity);
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Conferma la copertura: manca la conversione U.M. per %', v_bad; END IF;
  v_addr := COALESCE(NULLIF(_delivery->>'address_id', '')::uuid, v_list.delivery_address_id);
  IF v_addr IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.addresses WHERE id = v_addr AND company_id = v_list.company_id) THEN
    RAISE EXCEPTION 'Indirizzo di consegna non valido';
  END IF;

  v_loc := public.ensure_default_inventory_location(v_list.company_id, v_uid);
  v_number := public.next_document_number(v_list.company_id, 'ORD');
  INSERT INTO public.purchase_orders (company_id, archive_id, supplier_record_id, shopping_list_id, destination_location_id,
    destination_address_id, number, created_by, relation_id, status, send_status, generation_key,
    delivery_date, delivery_time_from, delivery_time_to, delivery_address_text, supplier_notes)
  VALUES (v_list.company_id, v_list.archive_id, _supplier_record_id, _list_id, v_loc, v_addr, v_number, v_uid,
    (SELECT r.id FROM public.supplier_customer_relations r
      WHERE r.supplier_record_id = _supplier_record_id AND r.buyer_company_id = v_list.company_id AND r.status = 'attivo' LIMIT 1),
    'bozza', 'da_inviare', _generation_key,
    COALESCE(NULLIF(_delivery->>'date', '')::date, v_list.delivery_date),
    COALESCE(NULLIF(_delivery->>'time_from', '')::time, v_list.delivery_time_from),
    COALESCE(NULLIF(_delivery->>'time_to', '')::time, v_list.delivery_time_to),
    COALESCE(NULLIF(btrim(COALESCE(_delivery->>'address_text', '')), ''), v_list.delivery_address_text),
    NULLIF(btrim(COALESCE(_delivery->>'notes', '')), ''))
  RETURNING id INTO v_order;

  INSERT INTO public.purchase_order_items (order_id, company_id, product_id, product_supplier_link_id,
    ordered_quantity, unit_id, unit_code, purchase_quantity, purchase_unit_id, purchase_unit_code,
    conversion_factor, conversion_mode, stock_unit_id, package_id, unit_cost, supplier_product_code, source_assignment_id,
    price_unit_id, price_unit_code, product_name, product_code)
  SELECT v_order, v_list.company_id, i.product_id, a.product_supplier_link_id,
         CASE WHEN a.assigned_quantity IS NOT NULL THEN round(a.assigned_quantity * c.residual / a.purchase_quantity, 3) END,
         i.unit_id, i.unit_code, c.residual, a.purchase_unit_id, a.purchase_unit_code,
         a.conversion_factor, a.conversion_mode, a.stock_unit_id, a.package_id, x.cost, l.supplier_product_code, a.id,
         x.unit_id, x.unit_code, bp.description, bp.code
    FROM _gso_cand c
    JOIN (SELECT * FROM public.shopping_list_item_suppliers WHERE deselected_at IS NULL) a ON a.id = c.assignment_id
    JOIN public.shopping_list_items i ON i.id = a.item_id
    JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
    LEFT JOIN public.products bp ON bp.id = i.product_id AND bp.company_id=v_list.company_id
    LEFT JOIN public.products sp ON sp.id = l.b2b_item_id AND sp.company_id = l.supplier_company_id
    LEFT JOIN public.units_of_measure su ON su.id = sp.price_unit_id
    CROSS JOIN LATERAL (SELECT
      CASE WHEN l.supplier_company_id IS NULL THEN l.manual_cost
           WHEN sp.id IS NULL THEN NULL
           ELSE (SELECT b.net_price FROM public.applicable_b2b_price(l.supplier_company_id, v_list.company_id, sp.id) b LIMIT 1) END AS cost,
      CASE WHEN l.supplier_company_id IS NULL THEN l.price_unit_id END AS unit_id,
      CASE WHEN l.supplier_company_id IS NULL OR sp.id IS NULL THEN NULL
           ELSE NULLIF(btrim(COALESCE(su.code, sp.danea_um, '')), '') END AS unit_code) x
   WHERE i.company_id=v_list.company_id AND l.company_id=v_list.company_id;
  GET DIAGNOSTICS v_lines = ROW_COUNT;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_list.company_id, v_uid, 'purchase_order.generated_from_list', 'purchase_order', v_order,
          jsonb_build_object('list_id', _list_id, 'supplier_record_id', _supplier_record_id, 'lines', v_lines, 'generation_key', _generation_key));
  RETURN jsonb_build_object('order_id', v_order, 'number', v_number, 'already_exists', false, 'lines', v_lines);
END $function$;

-- Permessi invariati per le operazioni autenticate; nessun accesso anonimo.
REVOKE ALL ON FUNCTION public.confirm_non_b2b_order_share(uuid,text,text,uuid,text), public.order_share_history(uuid), public.create_customer_invitation(uuid,text,integer,smallint), public.confirm_direct_purchase(uuid), public.copy_b2b_item_to_own_product(uuid,uuid,uuid,text,text,text,text,text,text,text,uuid,uuid,boolean), public.generate_supplier_order(uuid,uuid,uuid,jsonb,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_non_b2b_order_share(uuid,text,text,uuid,text), public.order_share_history(uuid), public.create_customer_invitation(uuid,text,integer,smallint), public.confirm_direct_purchase(uuid), public.copy_b2b_item_to_own_product(uuid,uuid,uuid,text,text,text,text,text,text,text,uuid,uuid,boolean), public.generate_supplier_order(uuid,uuid,uuid,jsonb,uuid[]) TO authenticated;

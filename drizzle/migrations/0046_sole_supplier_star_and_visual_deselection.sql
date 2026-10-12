ALTER TABLE public.product_supplier_links ADD COLUMN IF NOT EXISTS preferred_set_at timestamptz;
ALTER TABLE public.product_supplier_links ADD COLUMN IF NOT EXISTS preferred_set_by uuid;
COMMENT ON COLUMN public.product_supplier_links.preferred_set_by IS 'Chi ha scelto la stella a mano (NULL = stella automatica del fornitore unico). Una scelta manuale sul prodotto blocca la stella automatica.';

-- Scelte manuali già fatte (registro): restano manuali.
UPDATE public.product_supplier_links l SET preferred_set_at = e.created_at, preferred_set_by = e.actor_user_id
  FROM (SELECT DISTINCT ON (entity_id) entity_id, created_at, actor_user_id FROM public.audit_events
         WHERE action = 'product_supplier_link.preferred' ORDER BY entity_id, created_at DESC) e
 WHERE l.product_id = e.entity_id;

CREATE OR REPLACE FUNCTION public.set_preferred_product_supplier(_company_id uuid, _product_id uuid, _supplier_record_id uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_company_admin(_company_id) THEN RAISE EXCEPTION 'Permessi insufficienti'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _product_id AND company_id = _company_id) THEN
    RAISE EXCEPTION 'Il prodotto non appartiene a questa azienda';
  END IF;
  UPDATE public.product_supplier_links SET is_preferred = false
  WHERE product_id = _product_id AND company_id = _company_id AND is_preferred
    AND (_supplier_record_id IS NULL OR supplier_record_id <> _supplier_record_id);
  IF _supplier_record_id IS NOT NULL THEN
    UPDATE public.product_supplier_links SET is_preferred = true, is_active = true
    WHERE product_id = _product_id AND company_id = _company_id AND supplier_record_id = _supplier_record_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Associazione non trovata'; END IF;
  END IF;
  -- Scelta manuale: marcata su tutti i collegamenti del prodotto (la stella automatica non la sovrascrive mai).
  UPDATE public.product_supplier_links SET preferred_set_at = now(), preferred_set_by = v_uid
   WHERE product_id = _product_id AND company_id = _company_id;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, v_uid, 'product_supplier_link.preferred', 'product', _product_id,
          jsonb_build_object('supplier_record_id', _supplier_record_id));
END;
$function$;

-- Stella automatica: solo prodotto con UN collegamento attivo e idoneo, nessuna stella attiva, nessuna scelta manuale.
CREATE OR REPLACE FUNCTION public._ensure_sole_supplier_preferred(_product_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_link record; v_n int;
BEGIN
  IF EXISTS (SELECT 1 FROM public.product_supplier_links WHERE product_id = _product_id AND preferred_set_by IS NOT NULL) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.product_supplier_links WHERE product_id = _product_id AND is_active AND is_preferred) THEN RETURN false; END IF;
  SELECT count(*) INTO v_n FROM public.product_supplier_links WHERE product_id = _product_id AND is_active;
  IF v_n <> 1 THEN RETURN false; END IF;
  SELECT l.* INTO v_link FROM public.product_supplier_links l WHERE l.product_id = _product_id AND l.is_active;
  IF NOT EXISTS (SELECT 1 FROM public.supplier_records r WHERE r.id = v_link.supplier_record_id
                   AND r.buyer_company_id = v_link.company_id AND r.status = 'attivo') THEN RETURN false; END IF;
  IF v_link.b2b_item_id IS NOT NULL
     AND NOT public.b2b_item_purchasable(v_link.supplier_company_id, v_link.company_id, v_link.b2b_item_id) THEN RETURN false; END IF;
  UPDATE public.product_supplier_links SET is_preferred = true, preferred_set_at = now(), preferred_set_by = NULL
   WHERE id = v_link.id;
  RETURN true;
END $function$;
REVOKE ALL ON FUNCTION public._ensure_sole_supplier_preferred(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_sole_supplier_preferred()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._ensure_sole_supplier_preferred(NEW.product_id);
  IF TG_OP = 'UPDATE' AND OLD.product_id <> NEW.product_id THEN PERFORM public._ensure_sole_supplier_preferred(OLD.product_id); END IF;
  RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.trg_sole_supplier_preferred() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER product_supplier_links_sole_preferred
AFTER INSERT OR UPDATE OF is_active, supplier_record_id, b2b_item_id, product_id ON public.product_supplier_links
FOR EACH ROW EXECUTE FUNCTION public.trg_sole_supplier_preferred();

-- Righe di sola deselezione: quantità e U.M. vuote ammesse SOLO con deselected_at valorizzato.
CREATE OR REPLACE FUNCTION public.assert_assignment_purchase_data()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.deselected_at IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.purchase_quantity IS NULL OR NEW.purchase_quantity <= 0
     OR (NEW.purchase_unit_id IS NULL AND btrim(COALESCE(NEW.purchase_unit_code, '')) = '') THEN
    RAISE EXCEPTION 'Ripartizione non valida: servono quantità e U.M. d''acquisto';
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.set_shopping_list_supplier_selection(_item_id uuid, _link_id uuid, _selected boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_item record; v_list public.shopping_lists%ROWTYPE; v_n int := 0; v_r record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT i.id, i.company_id, i.list_id, i.product_id INTO v_item FROM public.shopping_list_items i WHERE i.id = _item_id;
  IF v_item.id IS NULL OR NOT public.is_company_member(v_item.company_id) THEN RAISE EXCEPTION 'Riga non trovata'; END IF;
  -- Ordine dei blocchi: Lista, poi riga, poi quote (come le altre funzioni della Lista).
  SELECT * INTO v_list FROM public.shopping_lists WHERE id = v_item.list_id AND company_id = v_item.company_id FOR UPDATE;
  IF v_list.status <> 'aperta' THEN RAISE EXCEPTION 'La lista non è più aperta'; END IF;
  PERFORM 1 FROM public.shopping_list_items WHERE id = _item_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.product_supplier_links l
                  WHERE l.id = _link_id AND l.company_id = v_item.company_id AND l.product_id = v_item.product_id) THEN
    RAISE EXCEPTION 'Fornitore non associato a questo prodotto';
  END IF;
  FOR v_r IN SELECT a.id FROM public.shopping_list_item_suppliers a
              WHERE a.item_id = _item_id AND a.product_supplier_link_id = _link_id FOR UPDATE LOOP
    IF EXISTS (SELECT 1 FROM public.purchase_order_items oi WHERE oi.source_assignment_id = v_r.id) THEN
      RAISE EXCEPTION 'Questa quota è già in un ordine: gestiscila dalle Bozze.';
    END IF;
    v_n := v_n + 1;
  END LOOP;
  IF NOT _selected THEN
    IF v_n = 0 THEN
      -- Spunta solo visiva tolta prima della quantità: si registra SOLO la deselezione (nessuna quantità, nessuna quota attiva).
      INSERT INTO public.shopping_list_item_suppliers (company_id, item_id, product_supplier_link_id, supplier_record_id,
             deselected_at, deselected_by, created_by)
      SELECT v_item.company_id, _item_id, l.id, l.supplier_record_id, now(), v_uid, v_uid
        FROM public.product_supplier_links l WHERE l.id = _link_id;
    END IF;
    UPDATE public.shopping_list_item_suppliers
       SET deselected_at = now(), deselected_by = v_uid
     WHERE item_id = _item_id AND product_supplier_link_id = _link_id AND deselected_at IS NULL;
  ELSE
    -- Riselezione: le quantità precedenti NON vengono ripristinate. Le quote tolte (mai in ordine, verificato sopra)
    -- vengono eliminate: il fornitore torna «senza quota» e la nuova quota la scrive assign_shopping_list_supplier.
    DELETE FROM public.shopping_list_item_suppliers
     WHERE item_id = _item_id AND product_supplier_link_id = _link_id AND deselected_at IS NOT NULL;
  END IF;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_item.company_id, v_uid, CASE WHEN _selected THEN 'shopping_list.supplier_selected' ELSE 'shopping_list.supplier_deselected' END,
          'shopping_list_item', _item_id, jsonb_build_object('link_id', _link_id));
  RETURN jsonb_build_object('item_id', _item_id, 'link_id', _link_id, 'selected', _selected);
END $function$;

CREATE OR REPLACE FUNCTION public.assign_shopping_list_supplier(_company_id uuid, _item_id uuid, _action text, _link_id uuid DEFAULT NULL::uuid, _assigned_quantity numeric DEFAULT NULL::numeric, _purchase_quantity numeric DEFAULT NULL::numeric, _min_warning_accepted boolean DEFAULT false, _notes text DEFAULT NULL::text, _actor_user_id uuid DEFAULT NULL::uuid, _purchase_unit_id uuid DEFAULT NULL::uuid, _assignment_id uuid DEFAULT NULL::uuid, _manual_unit_code text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item record; v_stock_unit uuid; v_stock_code text; v_link record; v_src record;
  v_unit_id uuid; v_unit_code text; v_factor numeric; v_ctype public.sale_conversion_type;
  v_qty numeric; v_equiv numeric; v_id uuid; v_manual text; v_ref text;
  v_list_status public.shopping_list_status;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT i.id, i.product_id, i.unit_id, i.unit_code INTO v_item FROM public.shopping_list_items i
   WHERE i.id = _item_id AND i.company_id = _company_id;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Riga non trovata'; END IF;
  v_stock_unit := public.shopping_item_stock_unit_id(_item_id);
  v_stock_code := v_item.unit_code;
  IF _action = 'remove' THEN
    SELECT s.status INTO v_list_status FROM public.shopping_lists s
      JOIN public.shopping_list_items i ON i.list_id = s.id
     WHERE i.id = _item_id AND s.company_id = _company_id;
    IF v_list_status = 'confermata' THEN
      RAISE EXCEPTION 'La Lista è confermata: la ripartizione non può più essere tolta';
    END IF;
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
   WHERE l.id = _link_id AND l.company_id = _company_id AND l.product_id = v_item.product_id
   FOR SHARE OF l;
  IF v_link.id IS NULL THEN RAISE EXCEPTION 'Fornitore non associato a questo prodotto'; END IF;
  IF NOT v_link.is_active THEN RAISE EXCEPTION 'Associazione fornitore non attiva'; END IF;
  v_qty := _purchase_quantity;
  IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'Quantità d''acquisto non valida'; END IF;
  v_manual := NULLIF(upper(regexp_replace(btrim(COALESCE(_manual_unit_code, '')), '\s+', ' ', 'g')), '');
  IF v_manual IS NOT NULL AND length(v_manual) > 20 THEN RAISE EXCEPTION 'U.M. troppo lunga (massimo 20 caratteri)'; END IF;
  IF _purchase_unit_id IS NULL AND v_manual IS NULL THEN
    RAISE EXCEPTION 'U.M. d''acquisto obbligatoria: sceglila esplicitamente';
  END IF;
  IF _purchase_unit_id IS NOT NULL AND v_manual IS NOT NULL THEN
    RAISE EXCEPTION 'Indica una U.M. esistente oppure un''altra U.M., non entrambe';
  END IF;
  SELECT * INTO v_src FROM public.shopping_link_b2b_source(_company_id, v_link.id);
  IF COALESCE(v_src.is_b2b, false) THEN
    IF NOT COALESCE(v_src.purchasable, false) THEN RAISE EXCEPTION 'Non in catalogo del fornitore: articolo non acquistabile'; END IF;
    IF v_manual IS NOT NULL THEN RAISE EXCEPTION 'Per i fornitori B2B la U.M. la decide il venditore'; END IF;
    IF v_src.source_product_id IS NULL THEN RAISE EXCEPTION 'Prodotto del fornitore non collegato: U.M. non disponibili'; END IF;
    SELECT um.code, su.conversion_factor, su.conversion_type, su.conversion_reference_um
      INTO v_unit_code, v_factor, v_ctype, v_ref
      FROM public.product_sale_units su JOIN public.units_of_measure um ON um.id = su.unit_id
     WHERE su.product_id = v_src.source_product_id AND su.unit_id = _purchase_unit_id
       AND su.is_active AND su.is_customer_visible;
    IF NOT FOUND THEN RAISE EXCEPTION 'U.M. non pubblicata dal venditore'; END IF;
    v_unit_id := _purchase_unit_id;
    IF lower(btrim(v_unit_code)) = lower(btrim(COALESCE(v_stock_code, ''))) THEN
      v_factor := 1; v_ctype := 'esatta';
    ELSIF v_factor IS NULL OR v_factor <= 0 OR lower(btrim(COALESCE(v_ref, ''))) <> lower(btrim(COALESCE(v_stock_code, '#'))) THEN
      v_factor := NULL; v_ctype := NULL;
    END IF;
  ELSIF v_manual IS NOT NULL THEN
    v_unit_id := NULL; v_unit_code := v_manual; v_factor := NULL; v_ctype := NULL;
  ELSIF _purchase_unit_id = v_stock_unit THEN
    v_unit_id := v_stock_unit;
    SELECT code INTO v_unit_code FROM public.units_of_measure WHERE id = v_unit_id;
    v_factor := 1; v_ctype := 'esatta';
  ELSE
    SELECT um.code, lu.conversion_factor, lu.conversion_type INTO v_unit_code, v_factor, v_ctype
      FROM public.product_supplier_link_units lu JOIN public.units_of_measure um ON um.id = lu.unit_id
     WHERE lu.link_id = v_link.id AND lu.unit_id = _purchase_unit_id AND lu.is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'U.M. di acquisto non abilitata per questa referenza'; END IF;
    v_unit_id := _purchase_unit_id;
    IF v_factor IS NULL OR v_factor <= 0 THEN v_factor := NULL; v_ctype := NULL; END IF;
  END IF;
  v_equiv := CASE WHEN v_factor IS NOT NULL THEN round(v_qty * v_factor, 3) END;
  -- Assegnazione esplicita su un fornitore tolto senza quantità: la sola «deselezione vuota» viene rimossa (riselezione).
  DELETE FROM public.shopping_list_item_suppliers
   WHERE item_id = _item_id AND product_supplier_link_id = v_link.id
     AND deselected_at IS NOT NULL AND purchase_quantity IS NULL;
  IF _assignment_id IS NOT NULL THEN
    SELECT id INTO v_id FROM public.shopping_list_item_suppliers WHERE id = _assignment_id AND item_id = _item_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Ripartizione non trovata'; END IF;
  ELSIF v_unit_id IS NOT NULL THEN
    SELECT id INTO v_id FROM public.shopping_list_item_suppliers
     WHERE item_id = _item_id AND product_supplier_link_id = v_link.id AND purchase_unit_id = v_unit_id;
  ELSE
    SELECT id INTO v_id FROM public.shopping_list_item_suppliers
     WHERE item_id = _item_id AND product_supplier_link_id = v_link.id AND purchase_unit_id IS NULL
       AND upper(btrim(purchase_unit_code)) = v_unit_code;
  END IF;
  IF v_id IS NOT NULL THEN
    UPDATE public.shopping_list_item_suppliers
       SET product_supplier_link_id = v_link.id, supplier_record_id = v_link.supplier_record_id,
           assigned_quantity = v_equiv, purchase_quantity = v_qty, purchase_unit_id = v_unit_id,
           purchase_unit_code = v_unit_code, conversion_factor = v_factor, conversion_type = v_ctype,
           min_warning_accepted = COALESCE(_min_warning_accepted, false),
           min_warning_accepted_by = CASE WHEN _min_warning_accepted THEN _actor_user_id END,
           min_warning_accepted_at = CASE WHEN _min_warning_accepted THEN now() END,
           notes = _notes, deselected_at = NULL, deselected_by = NULL
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

-- Allineamento iniziale: stella al fornitore unico (stesse condizioni del trigger).
SELECT public._ensure_sole_supplier_preferred(p.id) FROM public.products p
 WHERE EXISTS (SELECT 1 FROM public.product_supplier_links l WHERE l.product_id = p.id);
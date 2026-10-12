-- A: deselezione permanente del fornitore nella singola Lista (quantità conservate, escluse da ogni calcolo).
ALTER TABLE public.shopping_list_item_suppliers
  ADD COLUMN IF NOT EXISTS deselected_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deselected_by uuid NULL;
COMMENT ON COLUMN public.shopping_list_item_suppliers.deselected_at IS
  'Fornitore tolto volontariamente in questa Lista (NULL = quota attiva). Le quantità restano solo come storico della scelta: ogni calcolo, ordine, chiusura, semaforo e memoria filtra deselected_at IS NULL.';
COMMENT ON COLUMN public.shopping_list_item_suppliers.deselected_by IS 'Utente che ha tolto il fornitore (NULL = quota attiva).';

-- Ogni lettura delle quote nelle funzioni della Lista/ordini/semaforo ignora le quote tolte.
-- Le righe di ordine (JOIN su oi.source_assignment_id) e _assignment_residual restano invariate:
-- una quota in ordine non può essere tolta.
DO $mig$
DECLARE v_fn text; v_def text; v_new text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['inventory_purchase_cycle_status','shopping_list_generation_preview','close_shopping_list',
    '_shopping_list_try_complete','generate_supplier_order','set_shopping_list_item_quantity','_link_active_list_usage',
    'create_purchase_orders_from_list','unlink_supplier_preview','shopping_list_item_state','shopping_list_close_preview'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO STRICT v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_fn;
    v_new := regexp_replace(v_def, 'public\.shopping_list_item_suppliers a(?=\s)(?!\s*ON a\.id = oi\.source_assignment_id)',
      '(SELECT * FROM public.shopping_list_item_suppliers WHERE deselected_at IS NULL) a', 'g');
    IF v_new = v_def THEN RAISE EXCEPTION 'Nessuna lettura delle quote trovata in %', v_fn; END IF;
    EXECUTE v_new;
  END LOOP;

  SELECT pg_get_functiondef('public.assign_shopping_list_supplier'::regproc) INTO v_def;
  v_new := replace(v_def, E'           notes = _notes\n     WHERE id = v_id;',
                          E'           notes = _notes, deselected_at = NULL, deselected_by = NULL\n     WHERE id = v_id;');
  IF v_new = v_def THEN RAISE EXCEPTION 'assign_shopping_list_supplier: punto di aggiornamento non trovato'; END IF;
  EXECUTE v_new;
END $mig$;

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
      RAISE EXCEPTION 'Nessuna quota da togliere per questo fornitore';
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
REVOKE ALL ON FUNCTION public.set_shopping_list_supplier_selection(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_shopping_list_supplier_selection(uuid, uuid, boolean) TO authenticated;

-- B: correzione atomica della quantità. Riusa set_shopping_list_item_quantity_lock, set_shopping_list_item_quantity,
-- assign_shopping_list_supplier e set_shopping_list_direct_quota nella STESSA transazione: un errore annulla tutto.
CREATE OR REPLACE FUNCTION public.commit_shopping_list_item_quantity(
  _company_id uuid, _item_id uuid, _quantity numeric, _unit_id uuid, _unit_code text,
  _expected_quantity numeric, _expected_assign_count integer, _expected_assign_at timestamptz,
  _quotas jsonb DEFAULT '[]'::jsonb, _direct jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_item public.shopping_list_items%ROWTYPE; v_list public.shopping_lists%ROWTYPE;
  v_count int; v_at timestamptz; v_q jsonb; v_link uuid; v_aid uuid; v_state record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_item FROM public.shopping_list_items WHERE id = _item_id AND company_id = _company_id;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Riga non trovata'; END IF;
  SELECT * INTO v_list FROM public.shopping_lists WHERE id = v_item.list_id AND company_id = _company_id FOR UPDATE;
  IF v_list.status <> 'aperta' THEN RAISE EXCEPTION 'La lista non è più aperta'; END IF;
  SELECT * INTO v_item FROM public.shopping_list_items WHERE id = _item_id FOR UPDATE;
  IF v_item.excluded_at IS NOT NULL THEN RAISE EXCEPTION 'Prodotto escluso da questo ciclo'; END IF;
  IF _quantity IS NOT NULL AND _quantity <= 0 THEN RAISE EXCEPTION 'Quantità non valida'; END IF;
  IF jsonb_typeof(COALESCE(_quotas, '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Quote non valide'; END IF;

  -- Concorrenza: la richiesta vale solo se quantità e quote sono ancora quelle lette dalla pagina.
  IF v_item.decided_quantity IS DISTINCT FROM _expected_quantity THEN
    RAISE EXCEPTION 'Quantità cambiata nel frattempo: riprova';
  END IF;
  SELECT count(*), max(updated_at) INTO v_count, v_at FROM public.shopping_list_item_suppliers WHERE item_id = _item_id;
  IF v_count <> COALESCE(_expected_assign_count, 0) OR v_at IS DISTINCT FROM _expected_assign_at THEN
    RAISE EXCEPTION 'Ripartizione cambiata nel frattempo: riprova';
  END IF;
  PERFORM 1 FROM public.shopping_list_item_suppliers WHERE item_id = _item_id FOR UPDATE;

  -- Quantità + conferma con le funzioni esistenti (lo sblocco temporaneo non esce dalla transazione).
  IF v_item.quantity_locked_at IS NOT NULL THEN PERFORM public.set_shopping_list_item_quantity_lock(_item_id, false); END IF;
  PERFORM public.set_shopping_list_item_quantity(_company_id, _item_id, _quantity, 'Modifica manuale dell''operatore', NULL, v_uid, _unit_id, _unit_code);
  IF _quantity IS NULL THEN
    -- Campo svuotato: nessuna conferma e nessuna nuova quota; quelle già salvate restano.
    IF jsonb_array_length(COALESCE(_quotas, '[]'::jsonb)) > 0 OR _direct IS NOT NULL THEN RAISE EXCEPTION 'Nessuna quota senza quantità'; END IF;
    RETURN jsonb_build_object('item_id', _item_id, 'quantity', NULL);
  END IF;
  PERFORM public.set_shopping_list_item_quantity_lock(_item_id, true);

  -- Quote proposte: mai fidarsi del browser. Ogni quota passa da assign_shopping_list_supplier
  -- (azienda, prodotto, collegamento attivo, U.M. e conversione) e dai trigger della tabella.
  FOR v_q IN SELECT * FROM jsonb_array_elements(COALESCE(_quotas, '[]'::jsonb)) LOOP
    v_link := NULLIF(v_q->>'link_id', '')::uuid;
    v_aid := NULLIF(v_q->>'assignment_id', '')::uuid;
    IF v_link IS NULL THEN RAISE EXCEPTION 'Quota senza fornitore'; END IF;
    IF (v_q->>'purchase_quantity')::numeric IS NULL OR (v_q->>'purchase_quantity')::numeric <= 0 THEN
      RAISE EXCEPTION 'Quota con quantità non valida';
    END IF;
    IF EXISTS (SELECT 1 FROM public.shopping_list_item_suppliers a
                WHERE a.item_id = _item_id AND a.product_supplier_link_id = v_link AND a.deselected_at IS NOT NULL
                  AND (v_aid IS NULL OR a.id = v_aid)) THEN
      RAISE EXCEPTION 'Fornitore tolto in questa Lista: non viene riassegnato in automatico';
    END IF;
    IF v_aid IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.shopping_list_item_suppliers a
                      WHERE a.id = v_aid AND a.item_id = _item_id AND a.product_supplier_link_id = v_link) THEN
        RAISE EXCEPTION 'Ripartizione non trovata';
      END IF;
      IF EXISTS (SELECT 1 FROM public.purchase_order_items oi WHERE oi.source_assignment_id = v_aid) THEN
        RAISE EXCEPTION 'Questa quota è già in un ordine: gestiscila dalle Bozze.';
      END IF;
    END IF;
    PERFORM public.assign_shopping_list_supplier(_company_id, _item_id, 'set', v_link, NULL,
      (v_q->>'purchase_quantity')::numeric, true, NULL, v_uid,
      NULLIF(v_q->>'purchase_unit_id', '')::uuid, v_aid, NULLIF(v_q->>'manual_unit_code', ''));
  END LOOP;

  IF _direct IS NOT NULL THEN
    IF v_item.manual_purchase_done_at IS NOT NULL THEN RAISE EXCEPTION 'Acquisto diretto già registrato: non modificabile'; END IF;
    PERFORM public.set_shopping_list_direct_quota(_company_id, _item_id, (_direct->>'quantity')::numeric,
      NULLIF(_direct->>'unit_id', '')::uuid, NULLIF(_direct->>'unit_code', ''));
  END IF;

  SELECT * INTO v_state FROM public.shopping_list_item_state(_item_id);
  RETURN jsonb_build_object('item_id', _item_id, 'quantity', _quantity, 'status', v_state.status,
                            'assigned', v_state.assigned, 'remaining', v_state.remaining);
END $function$;
REVOKE ALL ON FUNCTION public.commit_shopping_list_item_quantity(uuid, uuid, numeric, uuid, text, numeric, integer, timestamptz, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_shopping_list_item_quantity(uuid, uuid, numeric, uuid, text, numeric, integer, timestamptz, jsonb, jsonb) TO authenticated;
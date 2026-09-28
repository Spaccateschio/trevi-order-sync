ALTER TABLE public.inventory_sessions
  ADD COLUMN purchase_list_id uuid NULL REFERENCES public.shopping_lists(id) ON DELETE SET NULL,
  ADD COLUMN purchase_evaluated_at timestamptz NULL,
  ADD COLUMN purchase_evaluated_by uuid NULL;

-- Stato del ciclo Inventario → Lista → Ordini per l'azienda.
CREATE OR REPLACE FUNCTION public.inventory_purchase_cycle_status(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open record;
  v_last record;
  v_list record;
  v_link_valid boolean := false;
  v_items int := 0;
  v_missing int := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;

  SELECT id, name, started_at INTO v_open FROM public.inventory_sessions
   WHERE company_id = _company_id AND status = 'in_corso'
   ORDER BY started_at DESC LIMIT 1;
  IF v_open.id IS NOT NULL THEN
    RETURN jsonb_build_object('color', 'giallo', 'open_session_id', v_open.id);
  END IF;

  SELECT id, name, finished_at, purchase_list_id, purchase_evaluated_at INTO v_last
    FROM public.inventory_sessions
   WHERE company_id = _company_id AND status = 'completata'
   ORDER BY finished_at DESC NULLS LAST LIMIT 1;
  IF v_last.id IS NULL THEN
    RETURN jsonb_build_object('color', 'verde');
  END IF;

  IF v_last.purchase_list_id IS NOT NULL THEN
    SELECT id, name, status, created_at INTO v_list FROM public.shopping_lists
     WHERE id = v_last.purchase_list_id AND company_id = _company_id;
    -- Una Lista Annullata (o Chiusa senza fine valutazione) fa decadere la presa in carico.
    v_link_valid := v_list.id IS NOT NULL AND v_list.status <> 'annullata'
      AND (v_list.status <> 'chiusa' OR v_last.purchase_evaluated_at IS NOT NULL);
  END IF;

  IF v_link_valid THEN
    SELECT count(*) INTO v_items FROM public.shopping_list_items WHERE list_id = v_list.id;
    -- Ripartizioni fornitore senza un ordine non annullato che ne copra la quantità.
    SELECT count(*) INTO v_missing FROM (
      SELECT i.product_id, a.product_supplier_link_id, sum(a.assigned_quantity) AS q
        FROM public.shopping_list_item_suppliers a
        JOIN public.shopping_list_items i ON i.id = a.item_id
       WHERE i.list_id = v_list.id
       GROUP BY 1, 2
    ) need
    WHERE COALESCE((
      SELECT sum(oi.ordered_quantity) FROM public.purchase_order_items oi
        JOIN public.purchase_orders o ON o.id = oi.order_id
       WHERE o.shopping_list_id = v_list.id AND o.status <> 'annullato'
         AND oi.product_id = need.product_id
         AND oi.product_supplier_link_id = need.product_supplier_link_id
    ), 0) < need.q;
    -- Righe senza nessuna ripartizione: acquisti decisi non ancora trasformati.
    v_missing := v_missing + (
      SELECT count(*) FROM public.shopping_list_items i
       WHERE i.list_id = v_list.id
         AND NOT EXISTS (SELECT 1 FROM public.shopping_list_item_suppliers a WHERE a.item_id = i.id));
  END IF;

  RETURN jsonb_build_object(
    'color', CASE WHEN v_link_valid AND v_last.purchase_evaluated_at IS NOT NULL AND v_missing = 0
                  THEN 'verde' ELSE 'rosso' END,
    'session_id', v_last.id,
    'session_name', v_last.name,
    'finished_at', v_last.finished_at,
    'evaluated_at', v_last.purchase_evaluated_at,
    'list_id', CASE WHEN v_link_valid THEN v_list.id END,
    'list_name', CASE WHEN v_link_valid THEN v_list.name END,
    'list_status', CASE WHEN v_link_valid THEN v_list.status::text END,
    'list_items', v_items,
    'missing_orders', v_missing
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_inventory_purchase_evaluation(
  _company_id uuid, _session_id uuid, _action text, _list_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s record;
  v_last uuid;
  v_list record;
  v_cur record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  SELECT * INTO v_s FROM public.inventory_sessions WHERE id = _session_id AND company_id = _company_id FOR UPDATE;
  IF v_s.id IS NULL THEN RAISE EXCEPTION 'Inventario non trovato'; END IF;
  IF v_s.status <> 'completata' THEN RAISE EXCEPTION 'L''inventario non è completato'; END IF;
  SELECT id INTO v_last FROM public.inventory_sessions
   WHERE company_id = _company_id AND status = 'completata'
   ORDER BY finished_at DESC NULLS LAST LIMIT 1;
  IF v_last <> v_s.id THEN RAISE EXCEPTION 'Si può valutare solo l''ultimo inventario completato'; END IF;
  IF v_s.purchase_evaluated_at IS NOT NULL THEN RAISE EXCEPTION 'Valutazione già terminata'; END IF;

  IF _action = 'take' THEN
    SELECT id, status INTO v_list FROM public.shopping_lists WHERE id = _list_id AND company_id = _company_id;
    IF v_list.id IS NULL THEN RAISE EXCEPTION 'Lista non trovata'; END IF;
    IF v_list.status <> 'aperta' THEN RAISE EXCEPTION 'La Lista deve essere aperta'; END IF;
    IF v_s.purchase_list_id = v_list.id THEN RETURN; END IF;
    IF v_s.purchase_list_id IS NOT NULL THEN
      SELECT status INTO v_cur FROM public.shopping_lists WHERE id = v_s.purchase_list_id;
      IF v_cur.status IN ('aperta', 'confermata') THEN
        RAISE EXCEPTION 'L''inventario è già preso in carico in un''altra Lista in lavorazione';
      END IF;
    END IF;
    UPDATE public.inventory_sessions SET purchase_list_id = v_list.id WHERE id = v_s.id;
  ELSIF _action = 'finish' THEN
    IF v_s.purchase_list_id IS NULL THEN RAISE EXCEPTION 'Inventario non preso in carico in una Lista'; END IF;
    SELECT status INTO v_cur FROM public.shopping_lists WHERE id = v_s.purchase_list_id;
    IF v_cur.status NOT IN ('aperta', 'confermata') THEN
      RAISE EXCEPTION 'La Lista collegata è chiusa o annullata: prendi in carico l''inventario in una nuova Lista';
    END IF;
    UPDATE public.inventory_sessions
       SET purchase_evaluated_at = now(), purchase_evaluated_by = auth.uid()
     WHERE id = v_s.id;
  ELSE
    RAISE EXCEPTION 'Azione non valida';
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, auth.uid(), 'inventory_purchase_' || _action, 'inventory_session', v_s.id,
          jsonb_build_object('list_id', COALESCE(_list_id, v_s.purchase_list_id)));
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_purchase_cycle_status(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.manage_inventory_purchase_evaluation(uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_purchase_cycle_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manage_inventory_purchase_evaluation(uuid, uuid, text, uuid) TO authenticated, service_role;

-- Con semaforo rosso non si apre un nuovo inventario.
CREATE OR REPLACE FUNCTION public.manage_inventory_session(_company_id uuid, _action text, _session_id uuid DEFAULT NULL::uuid, _archive_id uuid DEFAULT NULL::uuid, _name text DEFAULT NULL::text, _scope inventory_session_scope DEFAULT 'generale'::inventory_session_scope, _location_id uuid DEFAULT NULL::uuid, _notes text DEFAULT NULL::text, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid := _session_id;
  v_status public.inventory_session_status;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;

  IF _action = 'open' THEN
    IF (public.inventory_purchase_cycle_status(_company_id) ->> 'color') = 'rosso' THEN
      RAISE EXCEPTION 'Ciclo acquisti ancora da gestire: completa Lista della Spesa e ordini prima di un nuovo inventario';
    END IF;
    IF _archive_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.danea_archives WHERE id = _archive_id AND company_id = _company_id
    ) THEN
      RAISE EXCEPTION 'Archivio Danea non valido';
    END IF;
    IF _scope = 'ubicazione' THEN
      IF _location_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.inventory_locations WHERE id = _location_id AND company_id = _company_id AND status = 'attivo'
      ) THEN
        RAISE EXCEPTION 'Ubicazione non valida';
      END IF;
    END IF;
    INSERT INTO public.inventory_sessions (company_id, archive_id, name, scope, location_id, notes, created_by)
    VALUES (_company_id, _archive_id, COALESCE(NULLIF(btrim(_name), ''), 'Inventario ' || to_char(now(), 'DD/MM/YYYY')),
            _scope, CASE WHEN _scope = 'ubicazione' THEN _location_id ELSE NULL END, _notes, _actor_user_id)
    RETURNING id INTO v_id;
  ELSE
    IF v_id IS NULL THEN RAISE EXCEPTION 'Sessione non indicata'; END IF;
    SELECT status INTO v_status FROM public.inventory_sessions WHERE id = v_id AND company_id = _company_id;
    IF v_status IS NULL THEN RAISE EXCEPTION 'Sessione non trovata'; END IF;

    IF _action = 'rename' THEN
      IF v_status <> 'in_corso' THEN RAISE EXCEPTION 'La sessione è chiusa e non è modificabile'; END IF;
      UPDATE public.inventory_sessions
      SET name = COALESCE(NULLIF(btrim(_name), ''), name), notes = COALESCE(_notes, notes)
      WHERE id = v_id;
    ELSIF _action = 'close' THEN
      IF v_status <> 'in_corso' THEN RAISE EXCEPTION 'La sessione è già chiusa'; END IF;
      UPDATE public.inventory_sessions SET status = 'completata', finished_at = now() WHERE id = v_id;
    ELSIF _action = 'cancel' THEN
      IF v_status = 'completata' THEN RAISE EXCEPTION 'Una sessione completata non può essere annullata'; END IF;
      UPDATE public.inventory_sessions SET status = 'annullata', finished_at = now() WHERE id = v_id;
    ELSE
      RAISE EXCEPTION 'Azione non riconosciuta: %', _action;
    END IF;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, _actor_user_id, 'inventory_session_' || _action, 'inventory_session', v_id,
          jsonb_build_object('scope', _scope, 'location_id', _location_id));
  RETURN v_id;
END;
$function$;
-- ROLLBACK — NON APPLICATO. Ripristina manage_purchase_order com'era il 2026-10-19
-- (md5 della definizione originale: 0c9a7f2698a674844d181de50ca0d22c).
DO $$ BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'ROLLBACK_ROLE: %', current_user; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.manage_purchase_order(_order_id uuid, _action text, _destination_location_id uuid DEFAULT NULL::uuid, _notes text DEFAULT NULL::text, _actor_user_id uuid DEFAULT NULL::uuid, _send_channel text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_o public.purchase_orders; v_b2b boolean; v_channel text; v_closed boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = _order_id;
  IF v_o.id IS NULL OR NOT public.is_company_member(v_o.company_id) THEN RAISE EXCEPTION 'Ordine non trovato'; END IF;
  -- Ordine di blocco: Lista prima dell'ordine (come le funzioni di generazione), poi l'ordine.
  IF v_o.shopping_list_id IS NOT NULL THEN
    PERFORM 1 FROM public.shopping_lists WHERE id = v_o.shopping_list_id FOR UPDATE;
  END IF;
  SELECT * INTO v_o FROM public.purchase_orders WHERE id = _order_id FOR UPDATE;
  IF _action = 'send' THEN
    IF v_o.status <> 'bozza' THEN RAISE EXCEPTION 'Ordine già inviato'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.purchase_order_items WHERE order_id = _order_id) THEN RAISE EXCEPTION 'Ordine senza righe'; END IF;
    v_b2b := v_o.relation_id IS NOT NULL;
    v_channel := NULLIF(lower(btrim(COALESCE(_send_channel, ''))), '');
    IF v_b2b THEN
      IF v_channel IS NOT NULL AND v_channel <> 'piattaforma' THEN RAISE EXCEPTION 'Ordine B2B: si invia solo tramite la piattaforma'; END IF;
      v_channel := 'piattaforma';
    ELSE
      IF v_channel IS NULL THEN RAISE EXCEPTION 'Indica il canale con cui hai inviato l''ordine'; END IF;
      IF v_channel NOT IN ('whatsapp','email','sms','telefono','di_persona','altro') THEN RAISE EXCEPTION 'Canale d''invio non valido'; END IF;
    END IF;
    UPDATE public.purchase_orders SET status = 'inviato', sent_at = now(), send_channel = v_channel WHERE id = _order_id;
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
  IF _action = 'send' AND v_o.shopping_list_id IS NOT NULL THEN
    v_closed := public._shopping_list_try_complete(v_o.shopping_list_id, _actor_user_id);
  END IF;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_o.company_id, _actor_user_id, 'purchase_order.' || _action, 'purchase_order', _order_id,
          CASE WHEN _action = 'send' THEN jsonb_build_object('channel', v_channel, 'list_closed', v_closed) END);
  RETURN _order_id;
END; $function$;

DO $$ BEGIN
  IF md5(pg_get_functiondef('public.manage_purchase_order(uuid,text,uuid,text,uuid,text)'::regprocedure))
     <> '0c9a7f2698a674844d181de50ca0d22c' THEN
    RAISE EXCEPTION 'ROLLBACK_MISMATCH: definizione diversa dall''originale';
  END IF;
END $$;

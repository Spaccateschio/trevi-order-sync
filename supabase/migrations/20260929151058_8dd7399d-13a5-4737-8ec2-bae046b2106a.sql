ALTER TABLE public.shopping_list_items
  ADD COLUMN IF NOT EXISTS quantity_locked_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS quantity_locked_by uuid NULL;

CREATE OR REPLACE FUNCTION public.set_shopping_list_item_quantity(_company_id uuid, _item_id uuid, _decided_quantity numeric, _reason text DEFAULT NULL::text, _notes text DEFAULT NULL::text, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _decided_quantity IS NOT NULL AND _decided_quantity <= 0 THEN RAISE EXCEPTION 'Quantità non valida'; END IF;
  IF EXISTS (SELECT 1 FROM public.shopping_list_items WHERE id = _item_id AND company_id = _company_id AND quantity_locked_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Quantità confermata: sbloccala per modificarla';
  END IF;

  UPDATE public.shopping_list_items
     SET decided_quantity = _decided_quantity,
         change_reason = COALESCE(NULLIF(btrim(_reason), ''), change_reason),
         notes = COALESCE(_notes, notes),
         decided_by = _actor_user_id,
         decided_at = now()
   WHERE id = _item_id AND company_id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Riga non trovata'; END IF;
  RETURN _item_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.set_shopping_list_item_quantity_lock(_item_id uuid, _locked boolean)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_company uuid; v_list uuid; v_qty numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT company_id, list_id, decided_quantity INTO v_company, v_list, v_qty
    FROM public.shopping_list_items WHERE id = _item_id;
  IF v_company IS NULL OR NOT public.is_company_member(v_company) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shopping_lists WHERE id = v_list AND status = 'aperta') THEN
    RAISE EXCEPTION 'Lista non più aperta';
  END IF;
  IF _locked AND (v_qty IS NULL OR v_qty <= 0) THEN
    RAISE EXCEPTION 'Inserisci una quantità prima di confermare';
  END IF;
  UPDATE public.shopping_list_items
     SET quantity_locked_at = CASE WHEN _locked THEN now() END,
         quantity_locked_by = CASE WHEN _locked THEN auth.uid() END
   WHERE id = _item_id;
  RETURN _item_id;
END; $function$;

REVOKE ALL ON FUNCTION public.set_shopping_list_item_quantity_lock(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_shopping_list_item_quantity_lock(uuid, boolean) TO authenticated, service_role;
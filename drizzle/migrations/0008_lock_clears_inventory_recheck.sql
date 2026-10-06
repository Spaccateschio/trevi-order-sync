CREATE OR REPLACE FUNCTION public.set_shopping_list_item_quantity_lock(_item_id uuid, _locked boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
         quantity_locked_by = CASE WHEN _locked THEN auth.uid() END,
         inventory_changed_at = CASE WHEN _locked THEN NULL ELSE inventory_changed_at END,
         inventory_previous_quantity = CASE WHEN _locked THEN NULL ELSE inventory_previous_quantity END
   WHERE id = _item_id;
  RETURN _item_id;
END; $function$;
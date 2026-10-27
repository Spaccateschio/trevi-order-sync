CREATE OR REPLACE FUNCTION public.deactivate_product_supplier_link_with_lists(_company_id uuid, _link_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item uuid;
  v_removed integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF NOT public.is_company_admin(_company_id) THEN RAISE EXCEPTION 'Permessi insufficienti'; END IF;
  PERFORM 1 FROM public.product_supplier_links WHERE id = _link_id AND company_id = _company_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Associazione non trovata'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.shopping_list_item_suppliers a
      JOIN public.shopping_list_items i ON i.id = a.item_id AND i.company_id = _company_id
      JOIN public.shopping_lists s ON s.id = i.list_id AND s.company_id = _company_id
     WHERE a.product_supplier_link_id = _link_id AND a.deselected_at IS NULL AND s.status = 'confermata') THEN
    RAISE EXCEPTION 'La Lista è confermata: il fornitore potrà essere scollegato dopo la chiusura della Lista';
  END IF;
  -- Tolgo il fornitore dalle Liste aperte con il comando esistente (stessi controlli, es. quota già in ordine);
  -- qualunque errore annulla tutto, compresa la disattivazione.
  FOR v_item IN
    SELECT DISTINCT a.item_id FROM public.shopping_list_item_suppliers a
      JOIN public.shopping_list_items i ON i.id = a.item_id AND i.company_id = _company_id
      JOIN public.shopping_lists s ON s.id = i.list_id AND s.company_id = _company_id
     WHERE a.product_supplier_link_id = _link_id AND a.deselected_at IS NULL AND s.status = 'aperta'
  LOOP
    PERFORM public.set_shopping_list_supplier_selection(v_item, _link_id, false);
    v_removed := v_removed + 1;
  END LOOP;
  PERFORM public.manage_product_supplier_link(_company_id, 'deactivate', _link_id);
  RETURN jsonb_build_object('link_id', _link_id, 'removed_from_lists', v_removed);
END;
$function$;
REVOKE ALL ON FUNCTION public.deactivate_product_supplier_link_with_lists(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_product_supplier_link_with_lists(uuid, uuid) TO authenticated;
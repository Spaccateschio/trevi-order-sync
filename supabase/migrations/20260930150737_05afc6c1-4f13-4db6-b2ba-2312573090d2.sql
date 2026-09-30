CREATE OR REPLACE FUNCTION public.unlink_product_supplier(_company_id uuid, _link_id uuid, _item_id uuid DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link record;
  v_removed integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF NOT public.is_company_admin(_company_id) THEN RAISE EXCEPTION 'Permessi insufficienti'; END IF;

  SELECT id, product_id, supplier_record_id, is_preferred INTO v_link
    FROM public.product_supplier_links
   WHERE id = _link_id AND company_id = _company_id
   FOR UPDATE;
  IF v_link.id IS NULL THEN RAISE EXCEPTION 'Fornitore non associato a questo prodotto'; END IF;

  IF _item_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.shopping_list_items i
                    WHERE i.id = _item_id AND i.company_id = _company_id AND i.product_id = v_link.product_id) THEN
      RAISE EXCEPTION 'Riga della Lista non valida per questo prodotto';
    END IF;
    DELETE FROM public.shopping_list_item_suppliers
     WHERE item_id = _item_id AND product_supplier_link_id = _link_id;
    GET DIAGNOSTICS v_removed = ROW_COUNT;
  END IF;

  -- Solo per il futuro: nessuno storico cancellato, nessun altro preferito scelto in automatico.
  UPDATE public.product_supplier_links
     SET is_active = false, is_preferred = false
   WHERE id = _link_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, auth.uid(), 'product_supplier_link.unlink', 'product_supplier_link', _link_id,
          jsonb_build_object('item_id', _item_id, 'removed_assignments', v_removed, 'was_preferred', v_link.is_preferred));

  RETURN _link_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.unlink_product_supplier(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlink_product_supplier(uuid, uuid, uuid) TO authenticated, service_role;
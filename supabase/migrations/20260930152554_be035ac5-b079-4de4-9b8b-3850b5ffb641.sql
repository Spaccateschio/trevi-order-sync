CREATE OR REPLACE FUNCTION public.set_shopping_list_item_quantity(
  _company_id uuid, _item_id uuid, _decided_quantity numeric,
  _reason text DEFAULT NULL, _notes text DEFAULT NULL, _actor_user_id uuid DEFAULT NULL,
  _decided_unit_id uuid DEFAULT NULL, _decided_unit_code text DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item record;
  v_code text := NULLIF(upper(btrim(regexp_replace(COALESCE(_decided_unit_code, ''), '\s+', ' ', 'g'))), '');
  v_unit_code text;
  v_stock uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _decided_quantity IS NOT NULL AND _decided_quantity <= 0 THEN RAISE EXCEPTION 'Quantità non valida'; END IF;

  SELECT id, product_id, unit_code, quantity_locked_at INTO v_item
    FROM public.shopping_list_items WHERE id = _item_id AND company_id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Riga non trovata'; END IF;
  IF v_item.quantity_locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Quantità confermata: sbloccala per modificarla';
  END IF;

  v_stock := public.shopping_item_stock_unit_id(_item_id);
  IF _decided_unit_id IS NOT NULL THEN
    SELECT code INTO v_unit_code FROM public.units_of_measure WHERE id = _decided_unit_id;
  END IF;

  -- U.M. del prodotto = comportamento precedente: entrambe NULL
  IF (_decided_unit_id IS NOT NULL AND (_decided_unit_id = v_stock
        OR lower(btrim(COALESCE(v_unit_code, ''))) = lower(btrim(COALESCE(v_item.unit_code, '#')))))
     OR (_decided_unit_id IS NULL AND v_code IS NOT NULL AND lower(v_code) = lower(btrim(COALESCE(v_item.unit_code, '#')))) THEN
    _decided_unit_id := NULL; v_code := NULL;
  END IF;

  IF _decided_unit_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.shopping_item_supplier_units(_item_id) s, jsonb_array_elements(s.units) u
       WHERE (u->>'unit_id')::uuid = _decided_unit_id
    ) THEN
      RAISE EXCEPTION 'U.M. non configurata sui fornitori di questo prodotto';
    END IF;
    v_code := COALESCE(v_unit_code, v_code);
  ELSIF v_code IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.shopping_list_item_suppliers a
        JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
       WHERE l.company_id = _company_id AND l.product_id = v_item.product_id AND l.is_active
         AND a.purchase_unit_id IS NULL
         AND upper(btrim(regexp_replace(COALESCE(a.purchase_unit_code, ''), '\s+', ' ', 'g'))) = v_code
    ) THEN
      RAISE EXCEPTION 'U.M. manuale non configurata sui fornitori di questo prodotto';
    END IF;
  END IF;

  UPDATE public.shopping_list_items
     SET decided_quantity = _decided_quantity,
         decided_unit_id = _decided_unit_id,
         decided_unit_code = v_code,
         change_reason = COALESCE(NULLIF(btrim(_reason), ''), change_reason),
         notes = COALESCE(_notes, notes),
         decided_by = _actor_user_id,
         decided_at = now()
   WHERE id = _item_id AND company_id = _company_id;
  RETURN _item_id;
END; $function$;
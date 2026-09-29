CREATE OR REPLACE FUNCTION public.shopping_item_stock_unit_id(_item_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(i.unit_id, (
    SELECT u.id FROM public.units_of_measure u
     WHERE u.company_id = i.company_id AND lower(u.code) = lower(btrim(i.unit_code))
     ORDER BY (u.status = 'attivo') DESC LIMIT 1))
    FROM public.shopping_list_items i WHERE i.id = _item_id;
$$;
REVOKE ALL ON FUNCTION public.shopping_item_stock_unit_id(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assign_shopping_list_supplier(
  _company_id uuid, _item_id uuid, _action text, _link_id uuid DEFAULT NULL,
  _assigned_quantity numeric DEFAULT NULL, _purchase_quantity numeric DEFAULT NULL,
  _min_warning_accepted boolean DEFAULT false, _notes text DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL, _purchase_unit_id uuid DEFAULT NULL,
  _assignment_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_item record;
  v_stock_unit uuid;
  v_link record;
  v_unit_id uuid;
  v_unit_code text;
  v_factor numeric;
  v_ctype public.sale_conversion_type;
  v_qty numeric;
  v_equiv numeric;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT i.id, i.product_id, i.unit_id, i.unit_code INTO v_item FROM public.shopping_list_items i
   WHERE i.id = _item_id AND i.company_id = _company_id;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Riga non trovata'; END IF;
  v_stock_unit := public.shopping_item_stock_unit_id(_item_id);

  IF _action = 'remove' THEN
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
   WHERE l.id = _link_id AND l.company_id = _company_id AND l.product_id = v_item.product_id;
  IF v_link.id IS NULL THEN RAISE EXCEPTION 'Fornitore non associato a questo prodotto'; END IF;
  IF NOT v_link.is_active THEN RAISE EXCEPTION 'Associazione fornitore non attiva'; END IF;

  IF _purchase_quantity IS NOT NULL THEN
    v_qty := _purchase_quantity;
    v_unit_id := COALESCE(_purchase_unit_id, v_link.purchase_unit_id, v_stock_unit);
  ELSIF _assigned_quantity IS NOT NULL THEN
    v_qty := _assigned_quantity;
    v_unit_id := v_stock_unit;
  END IF;
  IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'Quantità d''acquisto non valida'; END IF;
  IF v_unit_id IS NULL THEN RAISE EXCEPTION 'U.M. d''acquisto obbligatoria'; END IF;

  IF v_unit_id = v_stock_unit THEN
    SELECT code INTO v_unit_code FROM public.units_of_measure WHERE id = v_unit_id;
    v_factor := 1; v_ctype := 'esatta'; v_equiv := v_qty;
  ELSE
    SELECT um.code, lu.conversion_factor, lu.conversion_type INTO v_unit_code, v_factor, v_ctype
      FROM public.product_supplier_link_units lu
      JOIN public.units_of_measure um ON um.id = lu.unit_id
     WHERE lu.link_id = v_link.id AND lu.unit_id = v_unit_id AND lu.is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'U.M. di acquisto non abilitata per questa referenza'; END IF;
    v_equiv := CASE WHEN v_factor IS NOT NULL AND v_factor > 0 THEN round(v_qty * v_factor, 3) END;
    IF v_factor IS NULL THEN v_ctype := NULL; END IF;
  END IF;

  IF _assignment_id IS NOT NULL THEN
    UPDATE public.shopping_list_item_suppliers
       SET product_supplier_link_id = v_link.id, supplier_record_id = v_link.supplier_record_id,
           assigned_quantity = v_equiv, purchase_quantity = v_qty, purchase_unit_id = v_unit_id,
           purchase_unit_code = v_unit_code, conversion_factor = v_factor, conversion_type = v_ctype,
           min_warning_accepted = COALESCE(_min_warning_accepted, false),
           min_warning_accepted_by = CASE WHEN _min_warning_accepted THEN _actor_user_id END,
           min_warning_accepted_at = CASE WHEN _min_warning_accepted THEN now() END,
           notes = _notes
     WHERE id = _assignment_id AND item_id = _item_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Ripartizione non trovata'; END IF;
    RETURN v_id;
  END IF;

  SELECT id INTO v_id FROM public.shopping_list_item_suppliers
   WHERE item_id = _item_id AND product_supplier_link_id = v_link.id AND purchase_unit_id = v_unit_id;

  IF v_id IS NOT NULL THEN
    UPDATE public.shopping_list_item_suppliers
       SET assigned_quantity = v_equiv, purchase_quantity = v_qty, purchase_unit_code = v_unit_code,
           conversion_factor = v_factor, conversion_type = v_ctype,
           min_warning_accepted = COALESCE(_min_warning_accepted, false),
           min_warning_accepted_by = CASE WHEN _min_warning_accepted THEN _actor_user_id END,
           min_warning_accepted_at = CASE WHEN _min_warning_accepted THEN now() END,
           notes = _notes
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
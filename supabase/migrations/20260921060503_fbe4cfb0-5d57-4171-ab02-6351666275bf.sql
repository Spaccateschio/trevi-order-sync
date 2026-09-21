DROP FUNCTION IF EXISTS public.assign_shopping_list_supplier(uuid, uuid, text, uuid, numeric, numeric, boolean, text, uuid);

CREATE OR REPLACE FUNCTION public.assign_shopping_list_supplier(
  _company_id uuid,
  _item_id uuid,
  _action text,
  _link_id uuid DEFAULT NULL,
  _assigned_quantity numeric DEFAULT NULL,
  _purchase_quantity numeric DEFAULT NULL,
  _min_warning_accepted boolean DEFAULT false,
  _notes text DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL,
  _purchase_unit_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product uuid;
  v_link record;
  v_unit record;
  v_unit_id uuid;
  v_unit_code text;
  v_factor numeric;
  v_id uuid;
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  SELECT product_id INTO v_product FROM public.shopping_list_items
   WHERE id = _item_id AND company_id = _company_id;
  IF v_product IS NULL THEN RAISE EXCEPTION 'Riga non trovata'; END IF;

  IF _action = 'remove' THEN
    DELETE FROM public.shopping_list_item_suppliers
     WHERE item_id = _item_id AND product_supplier_link_id = _link_id;
    RETURN _item_id;
  ELSIF _action <> 'set' THEN
    RAISE EXCEPTION 'Azione non valida';
  END IF;

  SELECT l.*, u.code AS unit_code INTO v_link
    FROM public.product_supplier_links l
    LEFT JOIN public.units_of_measure u ON u.id = l.purchase_unit_id
   WHERE l.id = _link_id AND l.company_id = _company_id AND l.product_id = v_product;
  IF v_link.id IS NULL THEN RAISE EXCEPTION 'Fornitore non associato a questo prodotto'; END IF;
  IF NOT v_link.is_active THEN RAISE EXCEPTION 'Associazione fornitore non attiva'; END IF;
  IF _assigned_quantity IS NULL OR _assigned_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantità da assegnare non valida';
  END IF;

  -- U.M. di acquisto: se indicata deve essere una U.M. abilitata e attiva su questa referenza.
  IF _purchase_unit_id IS NOT NULL THEN
    SELECT lu.unit_id, um.code, lu.conversion_factor INTO v_unit
      FROM public.product_supplier_link_units lu
      JOIN public.units_of_measure um ON um.id = lu.unit_id
     WHERE lu.link_id = v_link.id AND lu.unit_id = _purchase_unit_id AND lu.is_active;
    IF v_unit.unit_id IS NULL THEN
      RAISE EXCEPTION 'U.M. di acquisto non abilitata per questa referenza';
    END IF;
    v_unit_id := v_unit.unit_id;
    v_unit_code := v_unit.code;
    v_factor := v_unit.conversion_factor;
  ELSE
    v_unit_id := v_link.purchase_unit_id;
    v_unit_code := COALESCE(v_link.unit_code, v_link.conversion_reference_um);
    v_factor := v_link.conversion_factor;
  END IF;

  INSERT INTO public.shopping_list_item_suppliers (
    company_id, item_id, product_supplier_link_id, supplier_record_id,
    assigned_quantity, purchase_quantity, purchase_unit_id, purchase_unit_code, conversion_factor,
    min_warning_accepted, min_warning_accepted_by, min_warning_accepted_at, notes, created_by
  )
  VALUES (
    _company_id, _item_id, v_link.id, v_link.supplier_record_id,
    _assigned_quantity, _purchase_quantity, v_unit_id,
    v_unit_code, v_factor,
    COALESCE(_min_warning_accepted, false),
    CASE WHEN _min_warning_accepted THEN _actor_user_id END,
    CASE WHEN _min_warning_accepted THEN now() END,
    _notes, _actor_user_id
  )
  ON CONFLICT (item_id, supplier_record_id) DO UPDATE SET
    product_supplier_link_id = EXCLUDED.product_supplier_link_id,
    assigned_quantity = EXCLUDED.assigned_quantity,
    purchase_quantity = EXCLUDED.purchase_quantity,
    purchase_unit_id = EXCLUDED.purchase_unit_id,
    purchase_unit_code = EXCLUDED.purchase_unit_code,
    conversion_factor = EXCLUDED.conversion_factor,
    min_warning_accepted = EXCLUDED.min_warning_accepted,
    min_warning_accepted_by = EXCLUDED.min_warning_accepted_by,
    min_warning_accepted_at = EXCLUDED.min_warning_accepted_at,
    notes = EXCLUDED.notes
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_shopping_list_supplier(uuid, uuid, text, uuid, numeric, numeric, boolean, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_shopping_list_supplier(uuid, uuid, text, uuid, numeric, numeric, boolean, text, uuid, uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.inventory_purchase_cycle_status(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open_id uuid;
  v_last record;
  v_list_id uuid;
  v_list_name text;
  v_list_status text;
  v_link_valid boolean := false;
  v_items int := 0;
  v_missing int := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;

  SELECT id INTO v_open_id FROM public.inventory_sessions
   WHERE company_id = _company_id AND status = 'in_corso'
   ORDER BY started_at DESC LIMIT 1;
  IF v_open_id IS NOT NULL THEN
    RETURN jsonb_build_object('color', 'giallo', 'open_session_id', v_open_id);
  END IF;

  SELECT id, name, finished_at, purchase_list_id, purchase_evaluated_at INTO v_last
    FROM public.inventory_sessions
   WHERE company_id = _company_id AND status = 'completata'
   ORDER BY finished_at DESC NULLS LAST LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('color', 'verde');
  END IF;

  IF v_last.purchase_list_id IS NOT NULL THEN
    SELECT id, name, status::text INTO v_list_id, v_list_name, v_list_status FROM public.shopping_lists
     WHERE id = v_last.purchase_list_id AND company_id = _company_id;
    v_link_valid := v_list_id IS NOT NULL AND v_list_status <> 'annullata'
      AND (v_list_status <> 'chiusa' OR v_last.purchase_evaluated_at IS NOT NULL);
  END IF;

  IF v_link_valid THEN
    SELECT count(*) INTO v_items FROM public.shopping_list_items WHERE list_id = v_list_id;
    SELECT count(*) INTO v_missing FROM (
      SELECT i.product_id, a.product_supplier_link_id, sum(a.assigned_quantity) AS q
        FROM public.shopping_list_item_suppliers a
        JOIN public.shopping_list_items i ON i.id = a.item_id
       WHERE i.list_id = v_list_id
       GROUP BY 1, 2
    ) need
    WHERE COALESCE((
      SELECT sum(oi.ordered_quantity) FROM public.purchase_order_items oi
        JOIN public.purchase_orders o ON o.id = oi.order_id
       WHERE o.shopping_list_id = v_list_id AND o.status <> 'annullato'
         AND oi.product_id = need.product_id
         AND oi.product_supplier_link_id = need.product_supplier_link_id
    ), 0) < need.q;
    v_missing := v_missing + (
      SELECT count(*) FROM public.shopping_list_items i
       WHERE i.list_id = v_list_id
         AND NOT EXISTS (SELECT 1 FROM public.shopping_list_item_suppliers a WHERE a.item_id = i.id));
  END IF;

  RETURN jsonb_build_object(
    'color', CASE WHEN v_link_valid AND v_last.purchase_evaluated_at IS NOT NULL AND v_missing = 0
                  THEN 'verde' ELSE 'rosso' END,
    'session_id', v_last.id,
    'session_name', v_last.name,
    'finished_at', v_last.finished_at,
    'evaluated_at', v_last.purchase_evaluated_at,
    'list_id', CASE WHEN v_link_valid THEN v_list_id END,
    'list_name', CASE WHEN v_link_valid THEN v_list_name END,
    'list_status', CASE WHEN v_link_valid THEN v_list_status END,
    'list_items', v_items,
    'missing_orders', v_missing
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.shopping_list_cards_bundle(_company_id uuid, _item_ids uuid[])
RETURNS TABLE(item_id uuid, product_id uuid, overview jsonb, b2b_options jsonb, supplier_units jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  -- Sola lettura: riusa le stesse funzioni delle card, quindi stessi controlli e stessi risultati.
  RETURN QUERY
  SELECT i.id, i.product_id,
    COALESCE((SELECT jsonb_agg(to_jsonb(o)) FROM public.product_supplier_overview(i.product_id) o), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(to_jsonb(b)) FROM public.product_supplier_b2b_options(_company_id, i.product_id) b), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(to_jsonb(u)) FROM public.shopping_item_supplier_units(i.id) u), '[]'::jsonb)
  FROM public.shopping_list_items i
  JOIN public.shopping_lists l ON l.id = i.shopping_list_id
  WHERE i.id = ANY(_item_ids) AND l.company_id = _company_id;
END;
$$;
REVOKE ALL ON FUNCTION public.shopping_list_cards_bundle(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shopping_list_cards_bundle(uuid, uuid[]) TO authenticated;
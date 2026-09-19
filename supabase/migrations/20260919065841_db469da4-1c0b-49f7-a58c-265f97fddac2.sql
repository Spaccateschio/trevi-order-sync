CREATE OR REPLACE FUNCTION public.inventory_location_stock_list(
  _company_id uuid,
  _archive_id uuid,
  _location_id uuid
)
RETURNS TABLE (product_id uuid, has_count boolean, quantity numeric, counted_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_locations l WHERE l.id = _location_id AND l.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Ubicazione non valida';
  END IF;

  RETURN QUERY
  SELECT p.id, s.has_count, s.quantity, s.counted_at
  FROM public.products p
  CROSS JOIN LATERAL public.inventory_location_stock(p.id, _location_id) s
  WHERE p.company_id = _company_id AND p.archive_id = _archive_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.inventory_location_stock_list(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_location_stock_list(uuid, uuid, uuid) TO authenticated;
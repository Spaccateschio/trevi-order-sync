CREATE OR REPLACE FUNCTION public.available_suppliers()
RETURNS TABLE (id uuid, legal_name text, city text, province text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.legal_name, c.city, c.province
  FROM public.companies c
  WHERE c.can_sell = true
    AND c.status = 'attivo'
    AND NOT EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.company_id = c.id
        AND m.user_id = auth.uid()
        AND m.status = 'attivo'
    )
  ORDER BY (c.legal_name = 'Trevi Fruit') DESC, c.legal_name;
$$;

REVOKE EXECUTE ON FUNCTION public.available_suppliers() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.available_suppliers() TO authenticated;
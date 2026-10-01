CREATE OR REPLACE FUNCTION public.company_delivery_addresses(_company_id uuid)
RETURNS TABLE(id uuid, label text, address_line text, street_number text, postal_code text, city text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.label, a.address_line, a.street_number, a.postal_code, a.city
    FROM public.addresses a
   WHERE a.company_id = _company_id AND a.customer_record_id IS NULL AND a.supplier_record_id IS NULL
     AND a.status = 'attivo' AND public.is_company_member(_company_id)
   ORDER BY a.created_at;
$$;
REVOKE ALL ON FUNCTION public.company_delivery_addresses(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_delivery_addresses(uuid) TO authenticated;
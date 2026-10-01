CREATE OR REPLACE FUNCTION public.address_has_partner_function(_address_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.address_functions af
    WHERE af.address_id = _address_id
      AND af.function = ANY (ARRAY['sede_legale','sede_operativa','consegna','ritiro']::public.address_function[]));
$$;
REVOKE EXECUTE ON FUNCTION public.address_has_partner_function(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.address_has_partner_function(uuid) TO authenticated, service_role;

DROP POLICY "Indirizzi visibili a proprietari e partner autorizzati" ON public.addresses;
CREATE POLICY "Indirizzi visibili a proprietari e partner autorizzati" ON public.addresses
FOR SELECT USING (
  ((company_id IS NOT NULL) AND public.is_company_member(company_id))
  OR public.owns_customer_record(customer_record_id)
  OR public.owns_supplier_record(supplier_record_id)
  OR (COALESCE(visible_to_partners, false)
      AND public.can_read_company_address(company_id, visible_to_partners)
      AND public.address_has_partner_function(id))
);
ALTER POLICY "Funzioni indirizzo aggiornate dagli amministratori" ON public.address_functions
WITH CHECK (EXISTS (SELECT 1 FROM public.addresses a WHERE a.id = address_functions.address_id
  AND ((a.company_id IS NOT NULL AND public.is_company_admin(a.company_id))
       OR public.can_write_customer_record(a.customer_record_id)
       OR public.can_write_supplier_record(a.supplier_record_id))));
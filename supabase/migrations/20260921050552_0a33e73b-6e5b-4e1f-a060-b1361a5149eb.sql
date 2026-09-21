CREATE OR REPLACE FUNCTION public.set_product_price_unit(_company_id uuid, _product_id uuid, _price_unit_id uuid DEFAULT NULL::uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Solo gli amministratori possono impostare l''U.M. del prezzo';
  END IF;

  IF _price_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.units_of_measure u
    WHERE u.id = _price_unit_id AND u.company_id = _company_id AND u.status = 'attivo'
  ) THEN
    RAISE EXCEPTION 'Unità di misura non valida per questa azienda';
  END IF;

  UPDATE public.products
  SET price_unit_id = _price_unit_id, updated_at = now()
  WHERE id = _product_id AND company_id = _company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prodotto non trovato';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_product_price_unit(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_product_price_unit(uuid, uuid, uuid) TO authenticated, service_role;
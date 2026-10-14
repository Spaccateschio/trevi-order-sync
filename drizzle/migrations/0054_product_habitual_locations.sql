CREATE TABLE public.product_habitual_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  location_id uuid NOT NULL REFERENCES public.inventory_locations(id),
  is_primary boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, location_id)
);
CREATE UNIQUE INDEX product_habitual_locations_one_primary ON public.product_habitual_locations(product_id) WHERE is_primary;
CREATE INDEX product_habitual_locations_company_location ON public.product_habitual_locations(company_id, location_id);
COMMENT ON TABLE public.product_habitual_locations IS 'Zone abituali (solo organizzative) del prodotto; scritte solo da set_product_habitual_locations. Non influenzano card, giacenze, conteggi, Lista o ordini.';

GRANT SELECT ON public.product_habitual_locations TO authenticated;
GRANT ALL ON public.product_habitual_locations TO service_role;
ALTER TABLE public.product_habitual_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membri leggono zone abituali" ON public.product_habitual_locations
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

CREATE OR REPLACE FUNCTION public.set_product_habitual_locations(_product_id uuid, _location_ids uuid[], _primary_location_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid;
  v_ids uuid[] := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(_location_ids, '{}'::uuid[])) x WHERE x IS NOT NULL);
  v_valid int;
BEGIN
  SELECT company_id INTO v_company FROM products WHERE id = _product_id FOR UPDATE;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Prodotto non trovato'; END IF;
  IF NOT (has_company_role(v_company, 'amministratore') OR has_company_role(v_company, 'operatore')) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;
  SELECT count(*) INTO v_valid FROM inventory_locations
   WHERE id = ANY(v_ids) AND company_id = v_company AND status = 'attivo';
  IF v_valid <> coalesce(array_length(v_ids, 1), 0) THEN
    RAISE EXCEPTION 'Zona non valida';
  END IF;
  IF array_length(v_ids, 1) IS NULL THEN
    IF _primary_location_id IS NOT NULL THEN RAISE EXCEPTION 'La zona principale deve essere tra le zone abituali'; END IF;
  ELSIF _primary_location_id IS NULL THEN
    RAISE EXCEPTION 'Scegli la zona principale';
  ELSIF NOT (_primary_location_id = ANY(v_ids)) THEN
    RAISE EXCEPTION 'La zona principale deve essere tra le zone abituali';
  END IF;

  DELETE FROM product_habitual_locations WHERE product_id = _product_id AND NOT (location_id = ANY(v_ids));
  UPDATE product_habitual_locations SET is_primary = false WHERE product_id = _product_id AND is_primary AND location_id <> _primary_location_id;
  INSERT INTO product_habitual_locations(company_id, product_id, location_id, is_primary, created_by)
  SELECT v_company, _product_id, x, x = _primary_location_id, auth.uid() FROM unnest(v_ids) x
  ON CONFLICT (product_id, location_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;
END $$;
REVOKE ALL ON FUNCTION public.set_product_habitual_locations(uuid, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_habitual_locations(uuid, uuid[], uuid) TO authenticated;
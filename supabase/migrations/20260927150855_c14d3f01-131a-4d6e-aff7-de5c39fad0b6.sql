CREATE TABLE public.inventory_count_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  session_id uuid NOT NULL REFERENCES public.inventory_sessions(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  location_id uuid NOT NULL REFERENCES public.inventory_locations(id),
  quantity text NOT NULL,
  unit_code text,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, product_id, location_id)
);
GRANT SELECT ON public.inventory_count_drafts TO authenticated;
GRANT ALL ON public.inventory_count_drafts TO service_role;
ALTER TABLE public.inventory_count_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membri leggono le bozze della propria azienda"
  ON public.inventory_count_drafts FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE OR REPLACE FUNCTION public.manage_inventory_count_draft(
  _action text, _session_id uuid, _product_id uuid DEFAULT NULL, _location_id uuid DEFAULT NULL,
  _quantity text DEFAULT NULL, _unit_code text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _company uuid; _status inventory_session_status; _n integer := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT company_id, status INTO _company, _status FROM inventory_sessions WHERE id = _session_id;
  IF _company IS NULL OR NOT is_company_member(_company) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _status <> 'in_corso' THEN RAISE EXCEPTION 'Inventario non aperto'; END IF;

  IF _action = 'set' THEN
    IF _product_id IS NULL OR _location_id IS NULL OR _quantity IS NULL OR btrim(_quantity) = '' THEN
      RAISE EXCEPTION 'Dati bozza incompleti'; END IF;
    IF NOT EXISTS (SELECT 1 FROM products WHERE id = _product_id AND company_id = _company) THEN
      RAISE EXCEPTION 'Prodotto non valido'; END IF;
    IF NOT EXISTS (SELECT 1 FROM inventory_locations WHERE id = _location_id AND company_id = _company) THEN
      RAISE EXCEPTION 'Zona non valida'; END IF;
    INSERT INTO inventory_count_drafts(company_id, session_id, product_id, location_id, quantity, unit_code, updated_by)
    VALUES (_company, _session_id, _product_id, _location_id, left(btrim(_quantity), 30), nullif(btrim(_unit_code), ''), _uid)
    ON CONFLICT (session_id, product_id, location_id) DO UPDATE
      SET quantity = EXCLUDED.quantity, unit_code = EXCLUDED.unit_code, updated_by = _uid, updated_at = now();
    RETURN 1;
  ELSIF _action = 'clear_one' THEN
    DELETE FROM inventory_count_drafts WHERE session_id = _session_id AND product_id = _product_id AND location_id = _location_id;
    GET DIAGNOSTICS _n = ROW_COUNT; RETURN _n;
  ELSIF _action = 'clear_all' THEN
    DELETE FROM inventory_count_drafts WHERE session_id = _session_id;
    GET DIAGNOSTICS _n = ROW_COUNT; RETURN _n;
  END IF;
  RAISE EXCEPTION 'Azione non valida';
END $$;
REVOKE EXECUTE ON FUNCTION public.manage_inventory_count_draft(text,uuid,uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_inventory_count_draft(text,uuid,uuid,uuid,text,text) TO authenticated, service_role;
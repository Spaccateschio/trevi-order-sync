-- Confezioni del prodotto condivise da tutti i fornitori non B2B: una U.M. d'acquisto
-- del fornitore senza conversione prende la confezione attiva della stessa U.M.
-- Non sovrascrive mai conversioni già impostate; B2B esclusi.
CREATE OR REPLACE FUNCTION public._link_units_fill_from_package(_package_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pk public.product_stock_packages;
BEGIN
  SELECT * INTO pk FROM public.product_stock_packages WHERE id = _package_id;
  IF NOT FOUND OR pk.status <> 'attivo' OR pk.stock_quantity IS NULL OR pk.stock_quantity <= 0
     OR pk.verified_stock_unit_id IS NULL THEN RETURN; END IF;
  PERFORM set_config('app.unit_config_rpc', 'on', true);
  UPDATE public.product_supplier_link_units lu
     SET conversion_mode = 'fissa', stock_conversion_factor = pk.stock_quantity,
         package_id = pk.id, verified_stock_unit_id = pk.verified_stock_unit_id,
         verified_package_version = pk.package_version
    FROM public.product_supplier_links l, public.products p
   WHERE l.id = lu.link_id AND p.id = l.product_id AND l.product_id = pk.product_id
     AND l.b2b_item_id IS NULL AND l.is_active AND lu.is_active
     AND lu.unit_id = pk.unit_id AND lu.conversion_mode IS NULL
     AND p.stock_unit_id = pk.verified_stock_unit_id AND lu.unit_id <> p.stock_unit_id;
  PERFORM set_config('app.unit_config_rpc', 'off', true);
END $$;
REVOKE ALL ON FUNCTION public._link_units_fill_from_package(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._trg_package_fill_link_units()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public._link_units_fill_from_package(NEW.id); RETURN NULL; END $$;
DROP TRIGGER IF EXISTS trg_package_fill_link_units ON public.product_stock_packages;
CREATE TRIGGER trg_package_fill_link_units AFTER INSERT OR UPDATE ON public.product_stock_packages
  FOR EACH ROW EXECUTE FUNCTION public._trg_package_fill_link_units();

CREATE OR REPLACE FUNCTION public._trg_link_unit_fill_from_package()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  IF NEW.conversion_mode IS NOT NULL THEN RETURN NULL; END IF;
  SELECT pk.id INTO v FROM public.product_stock_packages pk
    JOIN public.product_supplier_links l ON l.product_id = pk.product_id
   WHERE l.id = NEW.link_id AND pk.unit_id = NEW.unit_id AND pk.status = 'attivo'
   ORDER BY pk.updated_at DESC LIMIT 1;
  IF v IS NOT NULL AND (SELECT count(*) FROM public.product_stock_packages pk
      JOIN public.product_supplier_links l ON l.product_id = pk.product_id
     WHERE l.id = NEW.link_id AND pk.unit_id = NEW.unit_id AND pk.status = 'attivo') = 1 THEN
    PERFORM public._link_units_fill_from_package(v);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_link_unit_fill_from_package ON public.product_supplier_link_units;
CREATE TRIGGER trg_link_unit_fill_from_package AFTER INSERT ON public.product_supplier_link_units
  FOR EACH ROW EXECUTE FUNCTION public._trg_link_unit_fill_from_package();

-- Riempimento iniziale: solo U.M. con una sola confezione attiva (le ambigue restano da configurare)
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT pk.id FROM public.product_stock_packages pk WHERE pk.status = 'attivo'
     AND (SELECT count(*) FROM public.product_stock_packages o WHERE o.product_id = pk.product_id AND o.unit_id = pk.unit_id AND o.status = 'attivo') = 1
  LOOP PERFORM public._link_units_fill_from_package(r.id); END LOOP;
END $$;
ALTER TABLE public.units_of_measure ADD COLUMN IF NOT EXISTS allows_decimals boolean NOT NULL DEFAULT true;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_unit_id uuid REFERENCES public.units_of_measure(id),
  ADD COLUMN IF NOT EXISTS stock_base_at timestamptz;
COMMENT ON COLUMN public.products.stock_unit_id IS 'U.M. di magazzino: scritta solo dall app, mai dall import Danea. Inizializzata da danea_um.';

CREATE TABLE public.product_stock_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  name text NOT NULL,
  unit_id uuid NOT NULL REFERENCES public.units_of_measure(id),
  stock_quantity numeric NOT NULL CHECK (stock_quantity > 0),
  status public.entity_status NOT NULL DEFAULT 'attivo',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX product_stock_packages_active_name ON public.product_stock_packages (product_id, lower(name)) WHERE status = 'attivo';
GRANT SELECT, INSERT, UPDATE ON public.product_stock_packages TO authenticated;
GRANT ALL ON public.product_stock_packages TO service_role;
ALTER TABLE public.product_stock_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membri leggono le confezioni" ON public.product_stock_packages FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY "Admin inseriscono confezioni" ON public.product_stock_packages FOR INSERT TO authenticated WITH CHECK (public.is_company_admin(company_id));
CREATE POLICY "Admin modificano confezioni" ON public.product_stock_packages FOR UPDATE TO authenticated USING (public.is_company_admin(company_id)) WITH CHECK (public.is_company_admin(company_id));

ALTER TABLE public.product_supplier_link_units
  ADD COLUMN IF NOT EXISTS conversion_mode text CHECK (conversion_mode IN ('stessa','fissa','variabile')),
  ADD COLUMN IF NOT EXISTS indicative_factor numeric CHECK (indicative_factor IS NULL OR indicative_factor > 0),
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.product_stock_packages(id);

ALTER TABLE public.shopping_list_item_suppliers
  ADD COLUMN IF NOT EXISTS conversion_mode text CHECK (conversion_mode IN ('stessa','fissa','variabile')),
  ADD COLUMN IF NOT EXISTS stock_unit_id uuid REFERENCES public.units_of_measure(id),
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.product_stock_packages(id);
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS conversion_mode text CHECK (conversion_mode IN ('stessa','fissa','variabile')),
  ADD COLUMN IF NOT EXISTS stock_unit_id uuid REFERENCES public.units_of_measure(id),
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.product_stock_packages(id);
ALTER TABLE public.goods_receipt_items
  ADD COLUMN IF NOT EXISTS conversion_mode text CHECK (conversion_mode IN ('stessa','fissa','variabile')),
  ADD COLUMN IF NOT EXISTS stock_unit_id uuid REFERENCES public.units_of_measure(id),
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.product_stock_packages(id);

ALTER TABLE public.inventory_counts
  ADD COLUMN IF NOT EXISTS stock_unit_id uuid REFERENCES public.units_of_measure(id),
  ADD COLUMN IF NOT EXISTS stock_quantity numeric,
  ADD COLUMN IF NOT EXISTS conversion_factor numeric,
  ADD COLUMN IF NOT EXISTS count_breakdown jsonb;

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS original_quantity numeric,
  ADD COLUMN IF NOT EXISTS original_unit_id uuid REFERENCES public.units_of_measure(id),
  ADD COLUMN IF NOT EXISTS original_unit_code text,
  ADD COLUMN IF NOT EXISTS conversion_factor numeric,
  ADD COLUMN IF NOT EXISTS conversion_mode text CHECK (conversion_mode IN ('stessa','fissa','variabile')),
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.product_stock_packages(id),
  ADD COLUMN IF NOT EXISTS stock_unit_id uuid REFERENCES public.units_of_measure(id);

ALTER TYPE public.inventory_movement_type ADD VALUE IF NOT EXISTS 'reso_cliente';
ALTER TYPE public.inventory_movement_type ADD VALUE IF NOT EXISTS 'reso_fornitore';
ALTER TYPE public.inventory_movement_type ADD VALUE IF NOT EXISTS 'adeguamento_inventario';

CREATE OR REPLACE FUNCTION public.guard_product_stock_unit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stock_unit_id IS NOT DISTINCT FROM OLD.stock_unit_id AND NEW.stock_base_at IS NOT DISTINCT FROM OLD.stock_base_at THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_company_admin(NEW.company_id) THEN
    RAISE EXCEPTION 'Solo un amministratore può cambiare la U.M. di magazzino';
  END IF;
  IF NEW.stock_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.units_of_measure u WHERE u.id = NEW.stock_unit_id AND u.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'U.M. di magazzino non valida per questa azienda';
  END IF;
  IF current_setting('app.stock_unit_backfill', true) = 'on' THEN
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER products_stock_unit_guard BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.guard_product_stock_unit();

CREATE OR REPLACE FUNCTION public.guard_supplier_link_unit_conversion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.conversion_mode = 'fissa' AND (NEW.conversion_factor IS NULL OR NEW.conversion_factor <= 0) THEN
    RAISE EXCEPTION 'Con conversione fissa serve un fattore maggiore di zero';
  END IF;
  IF NEW.conversion_mode = 'variabile' AND NEW.conversion_factor IS NOT NULL THEN
    RAISE EXCEPTION 'Con quantità variabile non si indica un fattore fisso: usa il valore indicativo';
  END IF;
  IF NEW.package_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.product_stock_packages pk JOIN public.product_supplier_links l ON l.id = NEW.link_id
    WHERE pk.id = NEW.package_id AND pk.product_id = l.product_id) THEN
    RAISE EXCEPTION 'La confezione non appartiene a questo prodotto';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER supplier_link_units_conversion_guard BEFORE INSERT OR UPDATE ON public.product_supplier_link_units
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_link_unit_conversion();

CREATE OR REPLACE FUNCTION public.guard_product_stock_package()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = NEW.product_id AND p.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'Prodotto non valido per questa azienda';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.units_of_measure u WHERE u.id = NEW.unit_id AND u.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'U.M. non valida per questa azienda';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER product_stock_packages_guard BEFORE INSERT OR UPDATE ON public.product_stock_packages
  FOR EACH ROW EXECUTE FUNCTION public.guard_product_stock_package();

SELECT set_config('app.stock_unit_backfill', 'on', true);
UPDATE public.products p SET stock_unit_id = u.id
FROM public.units_of_measure u
WHERE p.stock_unit_id IS NULL AND u.company_id = p.company_id AND u.status = 'attivo'
  AND lower(u.code) = lower(p.danea_um);
SELECT set_config('app.stock_unit_backfill', 'off', true);
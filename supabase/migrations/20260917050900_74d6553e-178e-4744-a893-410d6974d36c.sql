CREATE TABLE public.units_of_measure (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  code text NOT NULL,
  description text NOT NULL,
  status public.entity_status NOT NULL DEFAULT 'attivo',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT units_of_measure_code_not_blank CHECK (btrim(code) <> '' AND length(btrim(code)) <= 20),
  CONSTRAINT units_of_measure_description_not_blank CHECK (btrim(description) <> '' AND length(btrim(description)) <= 100)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units_of_measure TO authenticated;
GRANT ALL ON public.units_of_measure TO service_role;
ALTER TABLE public.units_of_measure ENABLE ROW LEVEL SECURITY;
CREATE POLICY units_of_measure_select_member ON public.units_of_measure FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY units_of_measure_insert_admin ON public.units_of_measure FOR INSERT TO authenticated WITH CHECK (public.is_company_admin(company_id));
CREATE POLICY units_of_measure_update_admin ON public.units_of_measure FOR UPDATE TO authenticated USING (public.is_company_admin(company_id)) WITH CHECK (public.is_company_admin(company_id));
CREATE POLICY units_of_measure_delete_admin ON public.units_of_measure FOR DELETE TO authenticated USING (public.is_company_admin(company_id));
CREATE UNIQUE INDEX units_of_measure_company_code_unique ON public.units_of_measure (company_id, lower(btrim(code)));
CREATE INDEX units_of_measure_company_status_idx ON public.units_of_measure (company_id, status, code);
CREATE TRIGGER units_of_measure_set_updated_at BEFORE UPDATE ON public.units_of_measure FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.product_sale_units (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  unit_id uuid NOT NULL REFERENCES public.units_of_measure(id),
  is_active boolean NOT NULL DEFAULT true,
  is_customer_visible boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  conversion_factor numeric(18,6),
  conversion_reference_um text,
  needs_review boolean NOT NULL DEFAULT false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_sale_units_product_unit_unique UNIQUE (product_id, unit_id),
  CONSTRAINT product_sale_units_factor_positive CHECK (conversion_factor IS NULL OR conversion_factor > 0),
  CONSTRAINT product_sale_units_default_usable CHECK (NOT is_default OR (is_active AND is_customer_visible)),
  CONSTRAINT product_sale_units_review_has_factor CHECK (NOT needs_review OR conversion_factor IS NOT NULL)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_sale_units TO authenticated;
GRANT ALL ON public.product_sale_units TO service_role;
ALTER TABLE public.product_sale_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_sale_units_select_member ON public.product_sale_units FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY product_sale_units_insert_admin ON public.product_sale_units FOR INSERT TO authenticated WITH CHECK (public.is_company_admin(company_id));
CREATE POLICY product_sale_units_update_admin ON public.product_sale_units FOR UPDATE TO authenticated USING (public.is_company_admin(company_id)) WITH CHECK (public.is_company_admin(company_id));
CREATE POLICY product_sale_units_delete_admin ON public.product_sale_units FOR DELETE TO authenticated USING (public.is_company_admin(company_id));
CREATE UNIQUE INDEX product_sale_units_one_default ON public.product_sale_units (product_id) WHERE is_default;
CREATE INDEX product_sale_units_company_product_idx ON public.product_sale_units (company_id, product_id);
CREATE INDEX product_sale_units_review_idx ON public.product_sale_units (company_id, needs_review) WHERE needs_review;
CREATE TRIGGER product_sale_units_set_updated_at BEFORE UPDATE ON public.product_sale_units FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.customer_product_unit_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_company_id uuid NOT NULL REFERENCES public.companies(id),
  buyer_company_id uuid NOT NULL REFERENCES public.companies(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  product_sale_unit_id uuid NOT NULL REFERENCES public.product_sale_units(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_product_unit_preferences_unique UNIQUE (seller_company_id, buyer_company_id, product_id),
  CONSTRAINT customer_product_unit_preferences_not_self CHECK (seller_company_id <> buyer_company_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_product_unit_preferences TO authenticated;
GRANT ALL ON public.customer_product_unit_preferences TO service_role;
ALTER TABLE public.customer_product_unit_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_product_unit_preferences_select_parties ON public.customer_product_unit_preferences FOR SELECT TO authenticated USING (public.is_company_member(seller_company_id) OR public.is_company_member(buyer_company_id));
CREATE POLICY customer_product_unit_preferences_insert_buyer ON public.customer_product_unit_preferences FOR INSERT TO authenticated WITH CHECK (public.is_company_member(buyer_company_id));
CREATE POLICY customer_product_unit_preferences_update_parties ON public.customer_product_unit_preferences FOR UPDATE TO authenticated USING (public.is_company_member(buyer_company_id) OR public.is_company_admin(seller_company_id)) WITH CHECK (public.is_company_member(buyer_company_id) OR public.is_company_admin(seller_company_id));
CREATE POLICY customer_product_unit_preferences_delete_parties ON public.customer_product_unit_preferences FOR DELETE TO authenticated USING (public.is_company_member(buyer_company_id) OR public.is_company_admin(seller_company_id));
CREATE INDEX customer_product_unit_preferences_buyer_idx ON public.customer_product_unit_preferences (buyer_company_id, product_id);
CREATE TRIGGER customer_product_unit_preferences_set_updated_at BEFORE UPDATE ON public.customer_product_unit_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_product_sale_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _product_company uuid;
  _unit_company uuid;
BEGIN
  SELECT company_id INTO _product_company FROM public.products WHERE id = NEW.product_id;
  SELECT company_id INTO _unit_company FROM public.units_of_measure WHERE id = NEW.unit_id;
  IF _product_company IS NULL OR _unit_company IS NULL OR _product_company <> NEW.company_id OR _unit_company <> NEW.company_id THEN
    RAISE EXCEPTION 'Prodotto e unità di misura devono appartenere alla stessa azienda';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_product_sale_unit() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER product_sale_units_validate BEFORE INSERT OR UPDATE OF company_id, product_id, unit_id ON public.product_sale_units FOR EACH ROW EXECUTE FUNCTION public.validate_product_sale_unit();

CREATE OR REPLACE FUNCTION public.validate_customer_product_unit_preference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _product_company uuid;
  _sale_unit_product uuid;
  _sale_unit_active boolean;
  _sale_unit_visible boolean;
BEGIN
  SELECT company_id INTO _product_company FROM public.products WHERE id = NEW.product_id;
  SELECT product_id, is_active, is_customer_visible INTO _sale_unit_product, _sale_unit_active, _sale_unit_visible
  FROM public.product_sale_units WHERE id = NEW.product_sale_unit_id;
  IF _product_company IS NULL OR _product_company <> NEW.seller_company_id OR _sale_unit_product IS DISTINCT FROM NEW.product_id THEN
    RAISE EXCEPTION 'Preferenza U.M. non coerente con il prodotto e il venditore';
  END IF;
  IF NOT _sale_unit_active OR NOT _sale_unit_visible THEN
    RAISE EXCEPTION 'La U.M. preferita deve essere attiva e visibile al cliente';
  END IF;
  IF NOT public.has_active_relation(NEW.seller_company_id, NEW.buyer_company_id) THEN
    RAISE EXCEPTION 'È richiesto un rapporto commerciale attivo';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_customer_product_unit_preference() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER customer_product_unit_preferences_validate BEFORE INSERT OR UPDATE ON public.customer_product_unit_preferences FOR EACH ROW EXECUTE FUNCTION public.validate_customer_product_unit_preference();

CREATE OR REPLACE FUNCTION public.prevent_used_unit_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.product_sale_units WHERE unit_id = OLD.id) THEN
    RAISE EXCEPTION 'Una U.M. già associata a un prodotto non può essere eliminata; disattivala';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_used_unit_deletion() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER units_of_measure_prevent_used_delete BEFORE DELETE ON public.units_of_measure FOR EACH ROW EXECUTE FUNCTION public.prevent_used_unit_deletion();

CREATE OR REPLACE FUNCTION public.seed_company_units_of_measure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.units_of_measure (company_id, code, description)
  VALUES
    (NEW.id, 'kg', 'Chilogrammo'),
    (NEW.id, 'pz', 'Pezzo'),
    (NEW.id, 'cs', 'Cassa'),
    (NEW.id, 'ct', 'Cartone'),
    (NEW.id, 'vasch', 'Vaschetta'),
    (NEW.id, 'mz', 'Mazzo'),
    (NEW.id, 'lt', 'Litro'),
    (NEW.id, 'ml', 'Millilitro')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_company_units_of_measure() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER companies_seed_units_of_measure AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION public.seed_company_units_of_measure();

INSERT INTO public.units_of_measure (company_id, code, description)
SELECT c.id, seed.code, seed.description
FROM public.companies c
CROSS JOIN (VALUES
  ('kg', 'Chilogrammo'), ('pz', 'Pezzo'), ('cs', 'Cassa'), ('ct', 'Cartone'),
  ('vasch', 'Vaschetta'), ('mz', 'Mazzo'), ('lt', 'Litro'), ('ml', 'Millilitro')
) AS seed(code, description)
ON CONFLICT DO NOTHING;
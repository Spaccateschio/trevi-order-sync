-- ============ ENUM ============
CREATE TYPE public.danea_connection_status AS ENUM ('attivo', 'revocato');
CREATE TYPE public.product_publish_status AS ENUM ('pubblicato', 'non_pubblicato');
CREATE TYPE public.danea_sync_mode AS ENUM ('full', 'incremental');
CREATE TYPE public.danea_sync_outcome AS ENUM ('in_corso', 'completato', 'fallito');

-- ============ danea_connections ============
CREATE TABLE public.danea_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  label TEXT NOT NULL DEFAULT 'Danea Easyfatt',
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  basic_login TEXT,
  basic_password_hash TEXT,
  status public.danea_connection_status NOT NULL DEFAULT 'attivo',
  detected_app_version TEXT,
  detected_creator TEXT,
  detected_default_price INTEGER,
  detected_warehouse TEXT,
  detected_image_folder TEXT,
  last_success_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX danea_connections_company_idx ON public.danea_connections(company_id);

GRANT SELECT ON public.danea_connections TO authenticated;
GRANT ALL ON public.danea_connections TO service_role;
ALTER TABLE public.danea_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY danea_connections_select_admin ON public.danea_connections
  FOR SELECT TO authenticated USING (public.is_company_admin(company_id));

CREATE TRIGGER danea_connections_set_updated_at BEFORE UPDATE ON public.danea_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ danea_price_lists ============
CREATE TABLE public.danea_price_lists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  list_number SMALLINT NOT NULL,
  danea_name TEXT,
  display_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT danea_price_lists_number_range CHECK (list_number BETWEEN 1 AND 9),
  CONSTRAINT danea_price_lists_unique UNIQUE (company_id, list_number)
);

GRANT SELECT, UPDATE ON public.danea_price_lists TO authenticated;
GRANT ALL ON public.danea_price_lists TO service_role;
ALTER TABLE public.danea_price_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY danea_price_lists_select_member ON public.danea_price_lists
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY danea_price_lists_update_admin ON public.danea_price_lists
  FOR UPDATE TO authenticated USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

CREATE TRIGGER danea_price_lists_set_updated_at BEFORE UPDATE ON public.danea_price_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ danea_sync_runs ============
CREATE TABLE public.danea_sync_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  connection_id UUID NOT NULL REFERENCES public.danea_connections(id),
  mode public.danea_sync_mode NOT NULL,
  outcome public.danea_sync_outcome NOT NULL DEFAULT 'in_corso',
  app_version TEXT,
  creator TEXT,
  warehouse TEXT,
  payload_bytes INTEGER,
  payload_hash TEXT,
  duplicate_payload BOOLEAN NOT NULL DEFAULT false,
  received_count INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  unpublished_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX danea_sync_runs_company_idx ON public.danea_sync_runs(company_id, started_at DESC);

GRANT SELECT ON public.danea_sync_runs TO authenticated;
GRANT ALL ON public.danea_sync_runs TO service_role;
ALTER TABLE public.danea_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY danea_sync_runs_select_member ON public.danea_sync_runs
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

CREATE TRIGGER danea_sync_runs_set_updated_at BEFORE UPDATE ON public.danea_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ products ============
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  danea_internal_id TEXT,
  code TEXT NOT NULL,
  description TEXT,
  description_html TEXT,
  category TEXT,
  subcategory TEXT,
  subcategory_levels TEXT[],
  danea_um TEXT,
  vat_code TEXT,
  vat_perc NUMERIC(6,3),
  vat_class TEXT,
  vat_description TEXT,
  barcode TEXT,
  product_type TEXT,
  producer_name TEXT,
  link TEXT,
  notes TEXT,
  custom_field_1 TEXT,
  custom_field_2 TEXT,
  custom_field_3 TEXT,
  custom_field_4 TEXT,
  supplier_code TEXT,
  supplier_name TEXT,
  supplier_product_code TEXT,
  supplier_notes TEXT,
  image_file_name TEXT,
  image_folder TEXT,
  publish_status public.product_publish_status NOT NULL DEFAULT 'pubblicato',
  unpublished_at TIMESTAMPTZ,
  first_received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sync_run_id UUID REFERENCES public.danea_sync_runs(id),
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT products_company_code_unique UNIQUE (company_id, code)
);
CREATE UNIQUE INDEX products_company_internal_id_unique
  ON public.products(company_id, danea_internal_id) WHERE danea_internal_id IS NOT NULL;
CREATE INDEX products_company_status_idx ON public.products(company_id, publish_status);

GRANT SELECT ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY products_select_member ON public.products
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ product_prices ============
CREATE TABLE public.product_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  list_number SMALLINT NOT NULL,
  net_price NUMERIC(14,4),
  gross_price NUMERIC(14,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_prices_number_range CHECK (list_number BETWEEN 1 AND 9),
  CONSTRAINT product_prices_unique UNIQUE (product_id, list_number)
);
CREATE INDEX product_prices_company_idx ON public.product_prices(company_id);

GRANT SELECT ON public.product_prices TO authenticated;
GRANT ALL ON public.product_prices TO service_role;
ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_prices_select_member ON public.product_prices
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

CREATE TRIGGER product_prices_set_updated_at BEFORE UPDATE ON public.product_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ product_supplier_costs (riservato) ============
CREATE TABLE public.product_supplier_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  supplier_code TEXT,
  supplier_name TEXT,
  supplier_product_code TEXT,
  supplier_net_price NUMERIC(14,4),
  supplier_gross_price NUMERIC(14,4),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_supplier_costs_unique UNIQUE (product_id)
);
CREATE INDEX product_supplier_costs_company_idx ON public.product_supplier_costs(company_id);

GRANT SELECT ON public.product_supplier_costs TO authenticated;
GRANT ALL ON public.product_supplier_costs TO service_role;
ALTER TABLE public.product_supplier_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_supplier_costs_select_admin ON public.product_supplier_costs
  FOR SELECT TO authenticated USING (public.is_company_admin(company_id));

CREATE TRIGGER product_supplier_costs_set_updated_at BEFORE UPDATE ON public.product_supplier_costs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ danea_sync_issues ============
CREATE TABLE public.danea_sync_issues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  sync_run_id UUID NOT NULL REFERENCES public.danea_sync_runs(id),
  product_code TEXT,
  field_name TEXT,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX danea_sync_issues_run_idx ON public.danea_sync_issues(sync_run_id);

GRANT SELECT ON public.danea_sync_issues TO authenticated;
GRANT ALL ON public.danea_sync_issues TO service_role;
ALTER TABLE public.danea_sync_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY danea_sync_issues_select_member ON public.danea_sync_issues
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
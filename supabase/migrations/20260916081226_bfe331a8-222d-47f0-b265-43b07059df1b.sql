-- 1. Postazioni Danea
CREATE TABLE public.danea_stations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  name text NOT NULL,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  password_salt text NOT NULL,
  status public.danea_connection_status NOT NULL DEFAULT 'attivo',
  allowed_uses text[] NOT NULL DEFAULT ARRAY['prodotti'],
  last_auth_at timestamptz,
  last_auth_outcome text,
  last_success_at timestamptz,
  detected_app_version text,
  detected_creator text,
  detected_default_price integer,
  detected_warehouse text,
  detected_image_folder text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.danea_stations TO authenticated;
GRANT ALL ON public.danea_stations TO service_role;

ALTER TABLE public.danea_stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gli amministratori vedono le postazioni della propria azienda"
ON public.danea_stations FOR SELECT TO authenticated
USING (public.is_company_admin(company_id));

CREATE TRIGGER danea_stations_set_updated_at
BEFORE UPDATE ON public.danea_stations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Solo aziende che vendono, massimo 5 postazioni attive
CREATE OR REPLACE FUNCTION public.danea_station_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _active integer;
BEGIN
  IF NOT public.company_sells(NEW.company_id) THEN
    RAISE EXCEPTION 'Le postazioni Danea sono disponibili solo per le aziende che vendono';
  END IF;

  IF NEW.status = 'attivo' THEN
    SELECT count(*) INTO _active
    FROM public.danea_stations s
    WHERE s.company_id = NEW.company_id
      AND s.status = 'attivo'
      AND s.id <> NEW.id;

    IF _active >= 5 THEN
      RAISE EXCEPTION 'Massimo 5 postazioni Danea attive per azienda';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER danea_stations_guard
BEFORE INSERT OR UPDATE ON public.danea_stations
FOR EACH ROW EXECUTE FUNCTION public.danea_station_guard();

CREATE INDEX danea_stations_company_idx ON public.danea_stations(company_id, status);

-- 2. Accessi non riusciti (nessuna password memorizzata)
CREATE TABLE public.danea_auth_failures (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attempted_username text,
  reason text NOT NULL,
  remote_hint text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.danea_auth_failures TO service_role;

ALTER TABLE public.danea_auth_failures ENABLE ROW LEVEL SECURITY;

CREATE INDEX danea_auth_failures_created_idx ON public.danea_auth_failures(created_at DESC);

-- 3. Gli invii fanno riferimento alla postazione
ALTER TABLE public.danea_sync_issues DROP CONSTRAINT IF EXISTS danea_sync_issues_sync_run_id_fkey;
DELETE FROM public.danea_sync_issues;
DELETE FROM public.danea_sync_runs;
ALTER TABLE public.danea_sync_issues
  ADD CONSTRAINT danea_sync_issues_sync_run_id_fkey
  FOREIGN KEY (sync_run_id) REFERENCES public.danea_sync_runs(id) ON DELETE CASCADE;

ALTER TABLE public.danea_sync_runs DROP COLUMN connection_id;
ALTER TABLE public.danea_sync_runs
  ADD COLUMN station_id uuid NOT NULL REFERENCES public.danea_stations(id) ON DELETE CASCADE;

-- 4. Rimozione del vecchio meccanismo con indirizzo segreto
DROP TRIGGER IF EXISTS danea_connections_require_selling ON public.danea_connections;
DROP TRIGGER IF EXISTS danea_connections_set_updated_at ON public.danea_connections;
DROP TABLE public.danea_connections;
DROP FUNCTION IF EXISTS public.danea_requires_selling_company();
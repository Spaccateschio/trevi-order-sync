-- 1. Archivi Danea
CREATE TABLE public.danea_archives (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  name text NOT NULL,
  notes text,
  is_default boolean NOT NULL DEFAULT false,
  status public.entity_status NOT NULL DEFAULT 'attivo',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.danea_archives TO authenticated;
GRANT ALL ON public.danea_archives TO service_role;

ALTER TABLE public.danea_archives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membri vedono gli archivi della propria azienda"
ON public.danea_archives FOR SELECT TO authenticated
USING (public.is_company_member(company_id));

CREATE POLICY "Amministratori creano archivi"
ON public.danea_archives FOR INSERT TO authenticated
WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY "Amministratori aggiornano archivi"
ON public.danea_archives FOR UPDATE TO authenticated
USING (public.is_company_admin(company_id))
WITH CHECK (public.is_company_admin(company_id));

CREATE TRIGGER danea_archives_set_updated_at
BEFORE UPDATE ON public.danea_archives
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX danea_archives_name_unique
ON public.danea_archives (company_id, lower(name));

CREATE UNIQUE INDEX danea_archives_one_default
ON public.danea_archives (company_id) WHERE is_default;

-- 2. Archivio predefinito per le aziende che hanno già dati Danea
INSERT INTO public.danea_archives (company_id, name, is_default, notes)
SELECT c.id, 'Archivio principale', true,
       'Creato automaticamente durante l''introduzione degli archivi Danea.'
FROM public.companies c
WHERE EXISTS (SELECT 1 FROM public.products p WHERE p.company_id = c.id)
   OR EXISTS (SELECT 1 FROM public.danea_stations s WHERE s.company_id = c.id)
   OR EXISTS (SELECT 1 FROM public.danea_price_lists l WHERE l.company_id = c.id)
   OR EXISTS (SELECT 1 FROM public.danea_sync_runs r WHERE r.company_id = c.id);

-- 3. Collegamento delle entità esistenti all'archivio
ALTER TABLE public.danea_stations
  ADD COLUMN archive_id uuid REFERENCES public.danea_archives(id);
ALTER TABLE public.products
  ADD COLUMN archive_id uuid REFERENCES public.danea_archives(id);
ALTER TABLE public.danea_price_lists
  ADD COLUMN archive_id uuid REFERENCES public.danea_archives(id);
ALTER TABLE public.danea_sync_runs
  ADD COLUMN archive_id uuid REFERENCES public.danea_archives(id);

UPDATE public.danea_stations s
SET archive_id = a.id
FROM public.danea_archives a
WHERE a.company_id = s.company_id AND a.is_default AND s.archive_id IS NULL;

UPDATE public.products p
SET archive_id = a.id
FROM public.danea_archives a
WHERE a.company_id = p.company_id AND a.is_default AND p.archive_id IS NULL;

UPDATE public.danea_price_lists l
SET archive_id = a.id
FROM public.danea_archives a
WHERE a.company_id = l.company_id AND a.is_default AND l.archive_id IS NULL;

UPDATE public.danea_sync_runs r
SET archive_id = a.id
FROM public.danea_archives a
WHERE a.company_id = r.company_id AND a.is_default AND r.archive_id IS NULL;

ALTER TABLE public.danea_stations ALTER COLUMN archive_id SET NOT NULL;
ALTER TABLE public.products ALTER COLUMN archive_id SET NOT NULL;
ALTER TABLE public.danea_price_lists ALTER COLUMN archive_id SET NOT NULL;
ALTER TABLE public.danea_sync_runs ALTER COLUMN archive_id SET NOT NULL;

-- 4. Identità prodotto e listini nel contesto dell'archivio
ALTER TABLE public.products DROP CONSTRAINT products_company_code_unique;
DROP INDEX IF EXISTS public.products_company_internal_id_unique;
ALTER TABLE public.danea_price_lists DROP CONSTRAINT danea_price_lists_unique;

CREATE UNIQUE INDEX products_archive_code_unique
ON public.products (company_id, archive_id, code);

CREATE UNIQUE INDEX products_archive_internal_id_unique
ON public.products (company_id, archive_id, danea_internal_id)
WHERE danea_internal_id IS NOT NULL;

CREATE UNIQUE INDEX danea_price_lists_archive_unique
ON public.danea_price_lists (company_id, archive_id, list_number);

CREATE INDEX products_archive_status_idx
ON public.products (archive_id, publish_status);

-- 5. L'archivio deve appartenere alla stessa azienda dell'entità collegata
CREATE OR REPLACE FUNCTION public.assert_archive_same_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company uuid;
BEGIN
  SELECT company_id INTO _company FROM public.danea_archives WHERE id = NEW.archive_id;
  IF _company IS NULL OR _company <> NEW.company_id THEN
    RAISE EXCEPTION 'L''archivio Danea non appartiene a questa azienda';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER danea_stations_archive_company
BEFORE INSERT OR UPDATE OF archive_id, company_id ON public.danea_stations
FOR EACH ROW EXECUTE FUNCTION public.assert_archive_same_company();

CREATE TRIGGER products_archive_company
BEFORE INSERT OR UPDATE OF archive_id, company_id ON public.products
FOR EACH ROW EXECUTE FUNCTION public.assert_archive_same_company();
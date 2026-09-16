ALTER TABLE public.danea_sync_runs ALTER COLUMN station_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'danea_sync_source') THEN
    CREATE TYPE public.danea_sync_source AS ENUM ('postazione', 'manuale');
  END IF;
END $$;

ALTER TABLE public.danea_sync_runs
  ADD COLUMN IF NOT EXISTS source public.danea_sync_source NOT NULL DEFAULT 'postazione',
  ADD COLUMN IF NOT EXISTS imported_by uuid;

ALTER TABLE public.danea_sync_runs
  ADD CONSTRAINT danea_sync_runs_origin_check
  CHECK (
    (source = 'postazione' AND station_id IS NOT NULL)
    OR (source = 'manuale' AND imported_by IS NOT NULL)
  );
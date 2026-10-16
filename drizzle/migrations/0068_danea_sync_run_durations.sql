ALTER TABLE public.danea_sync_runs
  ADD COLUMN IF NOT EXISTS price_replace_ms integer,
  ADD COLUMN IF NOT EXISTS total_ms integer;
COMMENT ON COLUMN public.danea_sync_runs.price_replace_ms IS 'Durata in ms della sostituzione prezzi (danea_replace_product_prices); NULL se non eseguita';
COMMENT ON COLUMN public.danea_sync_runs.total_ms IS 'Durata totale in ms dell''invio prodotti, registrata a fine invio (riuscito o fallito)';
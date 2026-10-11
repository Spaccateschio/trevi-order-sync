-- M1 Fase 1 «Genera ordini»: solo colonne nullable e indici, nessun dato modificato.
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS generation_key uuid,
  ADD COLUMN IF NOT EXISTS send_channel text;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_send_channel_check
  CHECK (send_channel IS NULL OR send_channel IN ('piattaforma','whatsapp','email','sms','telefono','di_persona','altro'));
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_generation_key_uq
  ON public.purchase_orders (company_id, generation_key) WHERE generation_key IS NOT NULL;
COMMENT ON COLUMN public.purchase_orders.generation_key IS 'Chiave del tentativo di generazione dalla Lista: stessa chiave = stesso ordine (idempotenza).';
COMMENT ON COLUMN public.purchase_orders.send_channel IS 'Canale con cui l''ordine è stato effettivamente inviato; NULL finché non inviato.';

ALTER TABLE public.shopping_list_items
  ADD COLUMN IF NOT EXISTS excluded_at timestamptz,
  ADD COLUMN IF NOT EXISTS excluded_by uuid,
  ADD COLUMN IF NOT EXISTS exclusion_reason text,
  ADD COLUMN IF NOT EXISTS direct_purchase_id uuid;
COMMENT ON COLUMN public.shopping_list_items.excluded_at IS 'Riga esclusa esplicitamente dall''acquisto del ciclo («Procedi comunque»); riprendibile finché la Lista è aperta.';

ALTER TABLE public.shopping_list_item_suppliers
  ADD COLUMN IF NOT EXISTS coverage_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS coverage_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS coverage_quantity numeric,
  ADD COLUMN IF NOT EXISTS coverage_unit_code text;
COMMENT ON COLUMN public.shopping_list_item_suppliers.coverage_confirmed_at IS 'Conferma esplicita che la quantità ordinata copre il fabbisogno quando manca la conversione U.M.; nessuna equivalenza calcolata.';

CREATE INDEX IF NOT EXISTS purchase_order_items_source_assignment_idx
  ON public.purchase_order_items (source_assignment_id) WHERE source_assignment_id IS NOT NULL;
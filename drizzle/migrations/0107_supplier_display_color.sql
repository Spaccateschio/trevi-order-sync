ALTER TABLE public.supplier_records ADD COLUMN IF NOT EXISTS display_color text;
ALTER TABLE public.supplier_records ADD CONSTRAINT supplier_records_display_color_palette
  CHECK (display_color IS NULL OR display_color IN ('p01','p02','p03','p04','p05','p06','p07','p08','p09','p10','p11','p12'));
COMMENT ON COLUMN public.supplier_records.display_color IS 'Colore pastello di presentazione scelto dall''azienda (p01-p12); NULL = colore automatico dall''id. Solo presentazione.';
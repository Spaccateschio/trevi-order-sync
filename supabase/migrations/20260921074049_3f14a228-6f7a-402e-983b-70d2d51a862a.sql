ALTER TABLE public.supplier_records
  ADD COLUMN IF NOT EXISTS delivery_weekdays smallint[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}',
  ADD COLUMN IF NOT EXISTS delivery_month_day smallint NULL;

ALTER TABLE public.supplier_records
  ADD CONSTRAINT supplier_records_delivery_month_day_check
  CHECK (delivery_month_day IS NULL OR (delivery_month_day BETWEEN 1 AND 31));

ALTER TABLE public.product_supplier_links
  ADD COLUMN IF NOT EXISTS delivery_weekdays smallint[] NULL,
  ADD COLUMN IF NOT EXISTS delivery_month_day smallint NULL;

ALTER TABLE public.product_supplier_links
  ADD CONSTRAINT product_supplier_links_delivery_month_day_check
  CHECK (delivery_month_day IS NULL OR (delivery_month_day BETWEEN 1 AND 31));

CREATE OR REPLACE FUNCTION public.normalize_delivery_weekdays(_weekdays smallint[])
RETURNS smallint[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _weekdays IS NULL THEN NULL
    ELSE coalesce((
      SELECT array_agg(DISTINCT d ORDER BY d)
      FROM unnest(_weekdays) AS d
      WHERE d BETWEEN 1 AND 7
    ), '{}'::smallint[])
  END
$$;

CREATE OR REPLACE FUNCTION public.set_supplier_delivery_schedule(
  _supplier_record_id uuid,
  _weekdays smallint[] DEFAULT NULL,
  _month_day smallint DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _company uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non autorizzato'; END IF;

  SELECT buyer_company_id INTO _company
  FROM public.supplier_records
  WHERE id = _supplier_record_id;

  IF _company IS NULL THEN RAISE EXCEPTION 'Fornitore non trovato'; END IF;

  IF NOT public.is_company_admin(_company) THEN
    RAISE EXCEPTION 'Solo un amministratore può gestire i giorni di consegna';
  END IF;
  IF NOT public.company_buys(_company) THEN
    RAISE EXCEPTION 'Il profilo di acquisto non è attivo per la tua azienda';
  END IF;
  IF _month_day IS NOT NULL AND (_month_day < 1 OR _month_day > 31) THEN
    RAISE EXCEPTION 'Il giorno del mese deve essere compreso tra 1 e 31';
  END IF;

  UPDATE public.supplier_records SET
    delivery_weekdays = coalesce(public.normalize_delivery_weekdays(_weekdays), '{}'::smallint[]),
    delivery_month_day = _month_day,
    updated_at = now()
  WHERE id = _supplier_record_id;

  RETURN _supplier_record_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_product_supplier_delivery_schedule(
  _link_id uuid,
  _weekdays smallint[] DEFAULT NULL,
  _month_day smallint DEFAULT NULL,
  _inherit boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _company uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non autorizzato'; END IF;

  SELECT buyer_company_id INTO _company
  FROM public.product_supplier_links
  WHERE id = _link_id;

  IF _company IS NULL THEN RAISE EXCEPTION 'Referenza fornitore non trovata'; END IF;

  IF NOT public.is_company_admin(_company) THEN
    RAISE EXCEPTION 'Solo un amministratore può gestire i giorni di consegna';
  END IF;
  IF NOT public.company_buys(_company) THEN
    RAISE EXCEPTION 'Il profilo di acquisto non è attivo per la tua azienda';
  END IF;
  IF _month_day IS NOT NULL AND (_month_day < 1 OR _month_day > 31) THEN
    RAISE EXCEPTION 'Il giorno del mese deve essere compreso tra 1 e 31';
  END IF;

  UPDATE public.product_supplier_links SET
    delivery_weekdays = CASE WHEN _inherit THEN NULL ELSE coalesce(public.normalize_delivery_weekdays(_weekdays), '{}'::smallint[]) END,
    delivery_month_day = CASE WHEN _inherit THEN NULL ELSE _month_day END,
    updated_at = now()
  WHERE id = _link_id;

  RETURN _link_id;
END;
$$;
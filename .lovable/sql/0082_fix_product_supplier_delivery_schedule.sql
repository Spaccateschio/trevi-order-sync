-- Repair only the company lookup. No operational rows are changed.
DO $check$
DECLARE v_oid regprocedure := 'public.set_product_supplier_delivery_schedule(uuid,smallint[],smallint,boolean)'::regprocedure;
BEGIN
  IF md5(pg_get_functiondef(v_oid)) <> '3ced33b64bb8d2059d6378b4ac721af3' THEN
    RAISE EXCEPTION 'Unexpected delivery schedule function: stop and review';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='product_supplier_links' AND column_name='company_id') THEN
    RAISE EXCEPTION 'Missing product supplier company ownership column';
  END IF;
  PERFORM set_config('app.delivery_schedule_original_acl',
    (SELECT proacl::text FROM pg_proc WHERE oid=v_oid), true);
END;
$check$;

CREATE OR REPLACE FUNCTION public.set_product_supplier_delivery_schedule(
  _link_id uuid, _weekdays smallint[] DEFAULT NULL::smallint[],
  _month_day smallint DEFAULT NULL::smallint, _inherit boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _company uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non autorizzato'; END IF;

  SELECT company_id INTO _company
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
$function$;

DO $check$
DECLARE v_oid regprocedure := 'public.set_product_supplier_delivery_schedule(uuid,smallint[],smallint,boolean)'::regprocedure;
BEGIN
  IF position('SELECT company_id INTO _company' IN pg_get_functiondef(v_oid)) = 0
     OR position('buyer_company_id' IN pg_get_functiondef(v_oid)) > 0 THEN
    RAISE EXCEPTION 'Delivery schedule company lookup repair failed';
  END IF;
  IF (SELECT proacl::text FROM pg_proc WHERE oid=v_oid)
     IS DISTINCT FROM current_setting('app.delivery_schedule_original_acl', true) THEN
    RAISE EXCEPTION 'Delivery schedule execute permissions changed';
  END IF;
END;
$check$;
CREATE OR REPLACE FUNCTION public.manage_company_delivery_preferences(_company_id uuid, _address_id uuid, _time_from time without time zone, _window_hours smallint, _day text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _time_to time without time zone;
  _display_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_admin(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _day NOT IN ('oggi','domani') THEN RAISE EXCEPTION 'Data predefinita non valida'; END IF;
  IF _window_hours IS NULL OR _window_hours NOT IN (2, 3, 4) THEN RAISE EXCEPTION 'Durata fascia non valida'; END IF;
  IF _address_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.addresses WHERE id = _address_id AND company_id = _company_id AND customer_record_id IS NULL AND supplier_record_id IS NULL) THEN
    RAISE EXCEPTION 'Indirizzo non valido'; END IF;
  _time_to := CASE WHEN _time_from IS NULL THEN NULL ELSE (_time_from + make_interval(hours => _window_hours))::time END;
  SELECT legal_name INTO _display_name FROM public.companies WHERE id = _company_id;
  INSERT INTO public.company_settings (company_id, display_name, default_delivery_address_id, default_delivery_time_from, default_delivery_time_to, default_delivery_day, delivery_window_hours)
  VALUES (_company_id, _display_name, _address_id, _time_from, _time_to, _day, _window_hours)
  ON CONFLICT (company_id) DO UPDATE SET default_delivery_address_id = EXCLUDED.default_delivery_address_id,
    default_delivery_time_from = EXCLUDED.default_delivery_time_from, default_delivery_time_to = EXCLUDED.default_delivery_time_to,
    default_delivery_day = EXCLUDED.default_delivery_day, delivery_window_hours = EXCLUDED.delivery_window_hours, updated_at = now();
END; $function$;
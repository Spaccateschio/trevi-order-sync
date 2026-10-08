-- Eccezione «solo oggi» del promemoria Lista della Spesa (Opzione A approvata):
-- la programmazione standard resta invariata; l'eccezione vale solo per override_date.
ALTER TABLE public.company_operational_schedules
  ADD COLUMN override_date date,
  ADD COLUMN override_time time without time zone,
  ADD CONSTRAINT company_operational_schedules_override_check
    CHECK ((override_date IS NULL) = (override_time IS NULL));

COMMENT ON COLUMN public.company_operational_schedules.override_date IS 'Giorno in cui vale l''eccezione temporanea; NULL = nessuna eccezione';
COMMENT ON COLUMN public.company_operational_schedules.override_time IS 'Orario eccezionale valido solo in override_date; non modifica reminder_time';

-- Imposta o annulla (_time NULL) l'eccezione di oggi. Admin only; azienda validata lato DB.
CREATE OR REPLACE FUNCTION public.set_shopping_list_schedule_override(_company_id uuid, _time time without time zone)
RETURNS company_operational_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r public.company_operational_schedules;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Solo gli amministratori dell''azienda possono modificare il promemoria';
  END IF;
  UPDATE public.company_operational_schedules s
  SET override_date = CASE WHEN _time IS NULL THEN NULL ELSE public.company_local_today(_company_id) END,
      override_time = _time,
      updated_at = now()
  WHERE s.company_id = _company_id AND s.schedule_type = 'shopping_list'
  RETURNING * INTO r;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configura prima il promemoria standard in Azienda → Preferenze';
  END IF;
  RETURN r;
END $function$;

GRANT EXECUTE ON FUNCTION public.set_shopping_list_schedule_override(uuid, time without time zone) TO authenticated;
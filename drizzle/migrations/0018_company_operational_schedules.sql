CREATE TABLE public.company_operational_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  schedule_type text NOT NULL CHECK (schedule_type IN ('shopping_list')),
  monday boolean NOT NULL DEFAULT false,
  tuesday boolean NOT NULL DEFAULT false,
  wednesday boolean NOT NULL DEFAULT false,
  thursday boolean NOT NULL DEFAULT false,
  friday boolean NOT NULL DEFAULT false,
  saturday boolean NOT NULL DEFAULT false,
  sunday boolean NOT NULL DEFAULT false,
  reminder_time time,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, schedule_type)
);
GRANT SELECT ON public.company_operational_schedules TO authenticated;
GRANT ALL ON public.company_operational_schedules TO service_role;
ALTER TABLE public.company_operational_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membri leggono promemoria" ON public.company_operational_schedules
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

CREATE OR REPLACE FUNCTION public.manage_company_operational_schedule(
  _company_id uuid, _schedule_type text,
  _monday boolean, _tuesday boolean, _wednesday boolean, _thursday boolean,
  _friday boolean, _saturday boolean, _sunday boolean,
  _reminder_time time, _enabled boolean)
RETURNS public.company_operational_schedules
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.company_operational_schedules;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Solo gli amministratori dell''azienda possono modificare i promemoria';
  END IF;
  IF _schedule_type <> 'shopping_list' THEN
    RAISE EXCEPTION 'Tipo di promemoria non valido';
  END IF;
  IF _enabled AND NOT (_monday OR _tuesday OR _wednesday OR _thursday OR _friday OR _saturday OR _sunday) THEN
    RAISE EXCEPTION 'Seleziona almeno un giorno';
  END IF;
  IF _enabled AND _reminder_time IS NULL THEN
    RAISE EXCEPTION 'Indica un orario valido';
  END IF;
  INSERT INTO public.company_operational_schedules AS s
    (company_id, schedule_type, monday, tuesday, wednesday, thursday, friday, saturday, sunday, reminder_time, enabled, created_by)
  VALUES (_company_id, _schedule_type, _monday, _tuesday, _wednesday, _thursday, _friday, _saturday, _sunday, _reminder_time, _enabled, auth.uid())
  ON CONFLICT (company_id, schedule_type) DO UPDATE SET
    monday = EXCLUDED.monday, tuesday = EXCLUDED.tuesday, wednesday = EXCLUDED.wednesday,
    thursday = EXCLUDED.thursday, friday = EXCLUDED.friday, saturday = EXCLUDED.saturday,
    sunday = EXCLUDED.sunday, reminder_time = EXCLUDED.reminder_time, enabled = EXCLUDED.enabled,
    updated_at = now()
  RETURNING * INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.manage_company_operational_schedule(uuid, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, time, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_company_operational_schedule(uuid, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, time, boolean) TO authenticated;
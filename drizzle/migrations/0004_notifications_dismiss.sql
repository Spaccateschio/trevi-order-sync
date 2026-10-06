ALTER TABLE public.notification_reads ADD COLUMN dismissed_at timestamptz;
CREATE OR REPLACE FUNCTION public.dismiss_notifications(_ids uuid[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;
  INSERT INTO public.notification_reads(notification_id, user_id, dismissed_at)
  SELECT x.id, auth.uid(), now() FROM public.notifications x
  WHERE public.is_company_member(x.company_id) AND (_ids IS NULL OR x.id = ANY(_ids))
  ON CONFLICT (notification_id, user_id) DO UPDATE SET dismissed_at = coalesce(public.notification_reads.dismissed_at, now());
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.dismiss_notifications(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_notifications(uuid[]) TO authenticated;
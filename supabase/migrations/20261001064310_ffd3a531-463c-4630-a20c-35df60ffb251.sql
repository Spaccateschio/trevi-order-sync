REVOKE ALL ON FUNCTION public.company_local_today(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_local_today(uuid) TO authenticated;
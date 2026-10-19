REVOKE ALL ON public.company_ownerships, public.company_collaboration_events FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.company_ownerships, public.company_collaboration_events TO authenticated;
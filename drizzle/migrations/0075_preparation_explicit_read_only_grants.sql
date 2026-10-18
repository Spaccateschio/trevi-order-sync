REVOKE ALL ON public.order_preparations, public.order_preparation_lines, public.order_preparation_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.order_preparations, public.order_preparation_lines, public.order_preparation_events FROM authenticated;
GRANT SELECT ON public.order_preparations, public.order_preparation_lines, public.order_preparation_events TO authenticated;
GRANT ALL ON public.order_preparations, public.order_preparation_lines, public.order_preparation_events TO service_role;
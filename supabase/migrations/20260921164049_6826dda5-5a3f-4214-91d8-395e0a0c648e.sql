DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('set_product_b2b_visibility','set_product_price_unit')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', r.proname, r.args);
  END LOOP;
END $$;

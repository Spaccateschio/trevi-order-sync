DO $$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef('public.shopping_list_close_preview(uuid)'::regprocedure) INTO v_src;
  v_src := replace(v_src, 'max(s.company_name)', 'max(s.legal_name)');
  EXECUTE v_src;
END $$;
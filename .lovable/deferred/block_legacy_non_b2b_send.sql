-- DEFERRED: not applied. Apply only during coordinated release after the new frontend is available.
-- Fail closed if the installed function differs from the reviewed baseline.
DO $deferred$
DECLARE original text; replacement text;
BEGIN
 SELECT pg_get_functiondef('public.manage_purchase_order(uuid,text,uuid,text,uuid,text)'::regprocedure) INTO original;
 IF position('IF _action = ''send'' THEN' IN original)=0 OR position('v_b2b := v_o.relation_id IS NOT NULL;' IN original)=0 THEN
  RAISE EXCEPTION 'Unexpected manage_purchase_order definition; review before release';
 END IF;
 replacement := replace(original,
   'IF _action = ''send'' THEN',
   E'IF _action = ''send'' THEN\n    IF v_o.relation_id IS NULL THEN\n      RAISE EXCEPTION ''Use confirm_non_b2b_order_share for non B2B orders'';\n    END IF;');
 EXECUTE replacement;
END $deferred$;

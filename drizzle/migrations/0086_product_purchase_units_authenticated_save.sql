DO $check$
BEGIN
 IF NOT pg_has_role(current_user,'postgres','USAGE') THEN RAISE EXCEPTION 'Ruolo inatteso'; END IF;
 IF to_regprocedure('public.save_product_purchase_units(uuid,uuid[],uuid,uuid)') IS NULL OR to_regprocedure('public.save_product_purchase_units(uuid,uuid[],uuid)') IS NOT NULL THEN RAISE EXCEPTION 'Firme iniziali inattese'; END IF;
 IF to_regprocedure('public.is_company_admin(uuid)') IS NULL OR to_regclass('public.product_purchase_units') IS NULL THEN RAISE EXCEPTION 'Prerequisiti mancanti'; END IF;
 IF NOT has_function_privilege('service_role','public.save_product_purchase_units(uuid,uuid[],uuid,uuid)','EXECUTE') OR has_function_privilege('authenticated','public.save_product_purchase_units(uuid,uuid[],uuid,uuid)','EXECUTE') OR has_function_privilege('anon','public.save_product_purchase_units(uuid,uuid[],uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Privilegi iniziali inattesi'; END IF;
END;
$check$;
CREATE FUNCTION public.save_product_purchase_units(_product_id uuid, _unit_ids uuid[], _default_unit_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_company uuid; v_ids uuid[]; v_actor uuid := auth.uid();
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Autenticazione richiesta'; END IF;
 SELECT company_id INTO v_company FROM public.products WHERE id=_product_id FOR UPDATE;
 IF v_company IS NULL THEN RAISE EXCEPTION 'Prodotto non trovato'; END IF;
 IF NOT public.is_company_admin(v_company) THEN RAISE EXCEPTION 'Solo amministratori aziendali'; END IF;
 IF _unit_ids IS NULL OR cardinality(_unit_ids)>200 THEN RAISE EXCEPTION 'Selezione U.M. non valida'; END IF;
 SELECT coalesce(array_agg(DISTINCT u), ARRAY[]::uuid[]) INTO v_ids FROM unnest(_unit_ids) u;
 IF EXISTS (SELECT 1 FROM unnest(v_ids) u LEFT JOIN public.units_of_measure x ON x.id=u WHERE u IS NULL OR x.id IS NULL OR x.company_id<>v_company OR x.status<>'attivo' OR x.usage NOT IN ('acquisto','entrambi')) THEN RAISE EXCEPTION 'Scegli solo U.M. aziendali attive per acquisto'; END IF;
 IF _default_unit_id IS NOT NULL AND NOT (_default_unit_id=ANY(v_ids)) THEN RAISE EXCEPTION 'La predefinita deve essere tra le U.M. scelte'; END IF;
 DELETE FROM public.product_purchase_units WHERE product_id=_product_id AND company_id=v_company;
 INSERT INTO public.product_purchase_units(product_id,company_id,unit_id,is_default,updated_by)
 SELECT _product_id,v_company,u,coalesce(u=_default_unit_id,false),v_actor FROM unnest(v_ids) u;
 INSERT INTO public.audit_events(company_id,actor_user_id,action,entity_type,entity_id,detail)
 VALUES(v_company,v_actor,'product.purchase_units','product',_product_id,jsonb_build_object('unit_ids',v_ids,'default_unit_id',_default_unit_id));
END;
$function$;
REVOKE ALL ON FUNCTION public.save_product_purchase_units(uuid,uuid[],uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_product_purchase_units(uuid,uuid[],uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.save_product_purchase_units(uuid,uuid[],uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION public.save_product_purchase_units(uuid,uuid[],uuid,uuid) IS 'DEPRECATED: disabled for all application roles; use the three-argument authenticated signature with auth.uid().';
DO $check$
DECLARE f regprocedure := 'public.save_product_purchase_units(uuid,uuid[],uuid)'; old_f regprocedure := 'public.save_product_purchase_units(uuid,uuid[],uuid,uuid)';
BEGIN
 IF NOT has_function_privilege('authenticated',f,'EXECUTE') OR has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('service_role',f,'EXECUTE') THEN RAISE EXCEPTION 'Privilegi nuova firma inattesi'; END IF;
 IF has_function_privilege('authenticated',old_f,'EXECUTE') OR has_function_privilege('anon',old_f,'EXECUTE') OR has_function_privilege('service_role',old_f,'EXECUTE') THEN RAISE EXCEPTION 'Vecchia firma ancora accessibile'; END IF;
 IF EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid IN (f,old_f) AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'EXECUTE pubblico inatteso'; END IF;
 IF NOT (SELECT prosecdef AND proconfig @> ARRAY['search_path=public'] FROM pg_proc WHERE oid=f) THEN RAISE EXCEPTION 'Funzione non protetta'; END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.product_purchase_units'::regclass) THEN RAISE EXCEPTION 'RLS assente'; END IF;
END;
$check$;
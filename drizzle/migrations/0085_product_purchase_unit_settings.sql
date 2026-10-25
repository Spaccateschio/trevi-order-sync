DO $check$
BEGIN
 IF NOT pg_has_role(current_user, 'postgres', 'USAGE') THEN RAISE EXCEPTION 'Ruolo inatteso'; END IF;
 IF to_regclass('public.product_purchase_units') IS NOT NULL THEN RAISE EXCEPTION 'Configurazione già presente'; END IF;
 IF to_regprocedure('public.is_company_admin(uuid)') IS NULL OR to_regprocedure('public.is_company_member(uuid)') IS NULL THEN RAISE EXCEPTION 'Controlli appartenenza mancanti'; END IF;
END;
$check$;
CREATE TABLE public.product_purchase_units (
 product_id uuid NOT NULL REFERENCES public.products(id),
 company_id uuid NOT NULL REFERENCES public.companies(id),
 unit_id uuid NOT NULL REFERENCES public.units_of_measure(id),
 is_default boolean NOT NULL DEFAULT false,
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (product_id, unit_id)
);
GRANT SELECT ON public.product_purchase_units TO authenticated;
GRANT ALL ON public.product_purchase_units TO service_role;
REVOKE ALL ON public.product_purchase_units FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.product_purchase_units TO authenticated;
ALTER TABLE public.product_purchase_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_purchase_units_member_read ON public.product_purchase_units FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE UNIQUE INDEX product_purchase_units_one_default ON public.product_purchase_units(product_id) WHERE is_default;
COMMENT ON TABLE public.product_purchase_units IS 'U.M. proprie del prodotto per acquisto diretto e proposte a nuove referenze manuali. Nessuna conversione, stella o configurazione B2B; indipendente da Danea.';
CREATE FUNCTION public.save_product_purchase_units(_product_id uuid, _unit_ids uuid[], _default_unit_id uuid, _actor_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_company uuid; v_ids uuid[];
BEGIN
 SELECT company_id INTO v_company FROM public.products WHERE id=_product_id FOR UPDATE;
 IF v_company IS NULL THEN RAISE EXCEPTION 'Prodotto non trovato'; END IF;
 IF _actor_user_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM public.company_members m JOIN public.company_member_roles r ON r.member_id=m.id
  WHERE m.company_id=v_company AND m.user_id=_actor_user_id AND m.status='attivo' AND r.role='amministratore'
 ) THEN RAISE EXCEPTION 'Solo amministratori aziendali'; END IF;
 IF _unit_ids IS NULL OR cardinality(_unit_ids)>200 THEN RAISE EXCEPTION 'Selezione U.M. non valida'; END IF;
 SELECT coalesce(array_agg(DISTINCT u), ARRAY[]::uuid[]) INTO v_ids FROM unnest(_unit_ids) u;
 IF EXISTS (SELECT 1 FROM unnest(v_ids) u LEFT JOIN public.units_of_measure x ON x.id=u WHERE u IS NULL OR x.id IS NULL OR x.company_id<>v_company OR x.status<>'attivo' OR x.usage NOT IN ('acquisto','entrambi')) THEN RAISE EXCEPTION 'Scegli solo U.M. aziendali attive per acquisto'; END IF;
 IF _default_unit_id IS NOT NULL AND NOT (_default_unit_id=ANY(v_ids)) THEN RAISE EXCEPTION 'La predefinita deve essere tra le U.M. scelte'; END IF;
 DELETE FROM public.product_purchase_units WHERE product_id=_product_id AND company_id=v_company;
 INSERT INTO public.product_purchase_units(product_id,company_id,unit_id,is_default,updated_by)
 SELECT _product_id,v_company,u,coalesce(u=_default_unit_id,false),_actor_user_id FROM unnest(v_ids) u;
 INSERT INTO public.audit_events(company_id,actor_user_id,action,entity_type,entity_id,detail)
 VALUES(v_company,_actor_user_id,'product.purchase_units','product',_product_id,jsonb_build_object('unit_ids',v_ids,'default_unit_id',_default_unit_id));
END;
$function$;
REVOKE ALL ON FUNCTION public.save_product_purchase_units(uuid,uuid[],uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_purchase_units(uuid,uuid[],uuid,uuid) TO service_role;
DO $check$
DECLARE t regclass := 'public.product_purchase_units'; f regprocedure := 'public.save_product_purchase_units(uuid,uuid[],uuid,uuid)';
BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=t) THEN RAISE EXCEPTION 'RLS assente'; END IF;
 IF has_table_privilege('authenticated',t,'INSERT') OR has_table_privilege('authenticated',t,'UPDATE') OR has_table_privilege('authenticated',t,'DELETE') OR has_table_privilege('anon',t,'SELECT') OR NOT has_table_privilege('authenticated',t,'SELECT') THEN RAISE EXCEPTION 'Privilegi tabella inattesi'; END IF;
 IF has_function_privilege('authenticated',f,'EXECUTE') OR has_function_privilege('anon',f,'EXECUTE') OR NOT has_function_privilege('service_role',f,'EXECUTE') THEN RAISE EXCEPTION 'Privilegi funzione inattesi'; END IF;
 IF NOT (SELECT prosecdef AND proconfig @> ARRAY['search_path=public'] FROM pg_proc WHERE oid=f) THEN RAISE EXCEPTION 'Funzione non protetta'; END IF;
END;
$check$;
-- 0083: stelle su più destinazioni (additiva). Non modifica set_preferred_product_supplier né il trigger product_supplier_links_sole_preferred.
DO $check$
BEGIN
  IF NOT pg_has_role(current_user, 'postgres', 'USAGE') THEN
    RAISE EXCEPTION 'Ruolo inatteso per la migrazione: %', current_user;
  END IF;
  IF to_regclass('public.product_direct_purchase_preferences') IS NOT NULL THEN
    RAISE EXCEPTION 'Tabella product_direct_purchase_preferences già esistente: stop';
  END IF;
  IF to_regprocedure('public.toggle_product_destination_star(uuid,uuid,uuid,boolean,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'Funzione toggle_product_destination_star già esistente: stop';
  END IF;
  IF to_regprocedure('public.is_company_member(uuid)') IS NULL OR to_regprocedure('public.is_company_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Funzioni di appartenenza mancanti';
  END IF;
END;
$check$;

CREATE TABLE public.product_direct_purchase_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  is_preferred boolean NOT NULL DEFAULT false,
  preferred_set_at timestamptz,
  preferred_set_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_direct_purchase_preferences_unique UNIQUE (company_id, product_id)
);
ALTER TABLE public.product_direct_purchase_preferences OWNER TO postgres;
REVOKE ALL ON public.product_direct_purchase_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.product_direct_purchase_preferences TO authenticated;
GRANT ALL ON public.product_direct_purchase_preferences TO service_role;
ALTER TABLE public.product_direct_purchase_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membri leggono le stelle acquisto diretto" ON public.product_direct_purchase_preferences
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

CREATE FUNCTION public.toggle_product_destination_star(
  _company_id uuid, _product_id uuid, _link_id uuid DEFAULT NULL, _direct boolean DEFAULT false, _on boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_uid uuid := auth.uid(); v_link record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Accesso non autorizzato'; END IF;
  IF NOT public.is_company_admin(_company_id) THEN RAISE EXCEPTION 'Solo un amministratore può impostare le stelle'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _product_id AND company_id = _company_id) THEN
    RAISE EXCEPTION 'Il prodotto non appartiene a questa azienda';
  END IF;
  IF _direct = (_link_id IS NOT NULL) THEN RAISE EXCEPTION 'Indica un fornitore oppure l''acquisto diretto'; END IF;
  IF NOT _direct THEN
    SELECT l.id, l.is_active, l.supplier_record_id INTO v_link FROM public.product_supplier_links l
     WHERE l.id = _link_id AND l.product_id = _product_id AND l.company_id = _company_id;
    IF v_link.id IS NULL THEN RAISE EXCEPTION 'Fornitore non collegato a questo prodotto'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.supplier_records r WHERE r.id = v_link.supplier_record_id AND r.buyer_company_id = _company_id) THEN
      RAISE EXCEPTION 'Il fornitore non appartiene a questa azienda';
    END IF;
    IF _on AND NOT v_link.is_active THEN RAISE EXCEPTION 'Fornitore non attivo'; END IF;
  END IF;
  -- Da qui solo scritture.
  IF _direct THEN
    INSERT INTO public.product_direct_purchase_preferences (company_id, product_id, is_preferred, preferred_set_at, preferred_set_by)
    VALUES (_company_id, _product_id, _on, now(), v_uid)
    ON CONFLICT (company_id, product_id) DO UPDATE SET is_preferred = EXCLUDED.is_preferred,
      preferred_set_at = now(), preferred_set_by = v_uid, updated_at = now();
  ELSE
    UPDATE public.product_supplier_links SET is_preferred = _on WHERE id = _link_id;
  END IF;
  -- Scelta manuale: come set_preferred_product_supplier (la stella automatica non la sovrascrive).
  UPDATE public.product_supplier_links SET preferred_set_at = now(), preferred_set_by = v_uid
   WHERE product_id = _product_id AND company_id = _company_id;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, v_uid, 'product_destination.star', 'product', _product_id,
          jsonb_build_object('link_id', _link_id, 'direct', _direct, 'on', _on));
END;
$function$;
ALTER FUNCTION public.toggle_product_destination_star(uuid,uuid,uuid,boolean,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.toggle_product_destination_star(uuid,uuid,uuid,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_product_destination_star(uuid,uuid,uuid,boolean,boolean) TO authenticated;

DO $check$
DECLARE t regclass := 'public.product_direct_purchase_preferences'; f regprocedure := 'public.toggle_product_destination_star(uuid,uuid,uuid,boolean,boolean)';
BEGIN
  IF has_table_privilege('anon', t, 'SELECT') OR has_table_privilege('authenticated', t, 'INSERT')
     OR has_table_privilege('authenticated', t, 'UPDATE') OR has_table_privilege('authenticated', t, 'DELETE')
     OR NOT has_table_privilege('authenticated', t, 'SELECT') THEN
    RAISE EXCEPTION 'Privilegi tabella inattesi';
  END IF;
  IF has_function_privilege('anon', f, 'EXECUTE') OR NOT has_function_privilege('authenticated', f, 'EXECUTE') THEN
    RAISE EXCEPTION 'Privilegi funzione inattesi';
  END IF;
  IF (SELECT relowner::regrole::text FROM pg_class WHERE oid = t) <> 'postgres'
     OR (SELECT proowner::regrole::text FROM pg_proc WHERE oid = f) <> 'postgres' THEN
    RAISE EXCEPTION 'Proprietario inatteso';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = t) THEN RAISE EXCEPTION 'RLS non attiva'; END IF;
END;
$check$;
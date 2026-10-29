ALTER TABLE public.inventory_counts ADD COLUMN snapshot_version integer;
ALTER TABLE public.inventory_count_entries ADD COLUMN snapshot_version integer;
COMMENT ON COLUMN public.inventory_counts.snapshot_version IS 'NULL for legacy observations; 1 for explicit raw-unit snapshots. Unknown equivalents are never reconstructed from later configuration.';
COMMENT ON COLUMN public.inventory_count_entries.snapshot_version IS 'Snapshot format of new count observations; legacy entries remain unchanged.';
CREATE OR REPLACE FUNCTION public.inventory_count_conversion(_product_id uuid,_unit_id uuid)
RETURNS TABLE(stock_unit_id uuid,unit_id uuid,unit_code text,factor numeric,package_id uuid,package_version integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_product public.products; v_unit uuid; v_code text; v_package public.product_stock_packages; v_factors integer;
BEGIN
 SELECT * INTO v_product FROM public.products WHERE id=_product_id;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_company_member(v_product.company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
 v_unit:=COALESCE(_unit_id,v_product.stock_unit_id);
 SELECT u.code INTO v_code FROM public.units_of_measure u WHERE u.id=v_unit AND u.company_id=v_product.company_id;
 IF v_code IS NULL THEN RAISE EXCEPTION 'Scegli la U.M. della quantità contata'; END IF;
 IF v_unit=v_product.stock_unit_id THEN RETURN QUERY SELECT v_product.stock_unit_id,v_unit,v_code,1::numeric,NULL::uuid,NULL::integer; RETURN; END IF;
 SELECT count(distinct pk.stock_quantity) INTO v_factors FROM public.product_stock_packages pk WHERE pk.product_id=_product_id AND pk.unit_id=v_unit AND pk.status='attivo' AND pk.stock_quantity>0 AND pk.verified_stock_unit_id=v_product.stock_unit_id;
 IF v_product.stock_unit_id IS NULL OR v_factors<>1 THEN RETURN QUERY SELECT v_product.stock_unit_id,v_unit,v_code,NULL::numeric,NULL::uuid,NULL::integer; RETURN; END IF;
 SELECT pk.* INTO v_package FROM public.product_stock_packages pk WHERE pk.product_id=_product_id AND pk.unit_id=v_unit AND pk.status='attivo' AND pk.stock_quantity>0 AND pk.verified_stock_unit_id=v_product.stock_unit_id ORDER BY pk.created_at,pk.id LIMIT 1;
 RETURN QUERY SELECT v_product.stock_unit_id,v_unit,v_code,v_package.stock_quantity,v_package.id,v_package.package_version;
END $$;
REVOKE ALL ON FUNCTION public.inventory_count_conversion(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inventory_count_conversion(uuid,uuid) TO authenticated;
DO $migration$
DECLARE def text; old text; replacement text; signature text;
BEGIN
 SELECT pg_get_functiondef('public.record_inventory_count_entry(uuid,uuid,uuid,uuid,text,numeric,uuid,text,text,boolean,numeric,uuid,uuid,boolean)'::regprocedure) INTO def;
 old:=substring(def FROM '  IF v_stock_unit IS NULL[\s\S]*?  SELECT \* INTO v_current');
 IF old IS NULL THEN RAISE EXCEPTION 'Definizione conteggio inattesa'; END IF;
 replacement:=$new$  IF _entry_type IN ('conteggio','riconteggio') THEN
    IF _unit_id IS NULL AND NULLIF(btrim(_unit_code),'') IS NOT NULL THEN
      SELECT u.id INTO _unit_id FROM public.units_of_measure u WHERE u.company_id=_company_id AND lower(btrim(u.code))=lower(btrim(_unit_code));
      IF _unit_id IS NULL THEN RAISE EXCEPTION 'U.M. del conteggio non valida'; END IF;
    END IF;
  END IF;

  SELECT * INTO v_current$new$;
 def:=replace(def,old,replacement);
 old:='stock_unit_id, stock_quantity, conversion_factor, counted_package_id, counted_package_version';
 IF strpos(def,old)=0 THEN RAISE EXCEPTION 'Colonne snapshot conteggio inattese'; END IF;
 def:=replace(def,old,old||', snapshot_version');
 def:=replace(def,'v_conversion.factor, v_conversion.package_id, v_conversion.package_version)','v_conversion.factor, v_conversion.package_id, v_conversion.package_version, 1)');
 def:=replace(def,'counted_package_version=EXCLUDED.counted_package_version;','counted_package_version=EXCLUDED.counted_package_version, snapshot_version=EXCLUDED.snapshot_version;');
 old:='CASE WHEN _entry_type IN (''conteggio'',''riconteggio'') THEN v_conversion.package_version ELSE v_current.counted_package_version END)';
 IF strpos(def,old)=0 THEN RAISE EXCEPTION 'Snapshot storico inatteso'; END IF;
 def:=replace(def,old,'CASE WHEN _entry_type IN (''conteggio'',''riconteggio'') THEN v_conversion.package_version ELSE v_current.counted_package_version END, CASE WHEN _entry_type IN (''conteggio'',''riconteggio'') THEN 1 ELSE v_current.snapshot_version END)');
 EXECUTE def;
 SELECT pg_get_functiondef('public.record_inventory_count(uuid,uuid,uuid,uuid,numeric,uuid,text,text,uuid,uuid,boolean)'::regprocedure) INTO def;
 old:='  SELECT * INTO v_conversion FROM public.inventory_count_conversion(_product_id,_unit_id);';
 IF strpos(def,old)=0 THEN RAISE EXCEPTION 'Conteggio compatibilita inatteso'; END IF;
 def:=replace(def,old,$new$  IF _unit_id IS NULL AND NULLIF(btrim(_unit_code),'') IS NOT NULL THEN
    SELECT u.id INTO _unit_id FROM public.units_of_measure u WHERE u.company_id=_company_id AND lower(btrim(u.code))=lower(btrim(_unit_code));
    IF _unit_id IS NULL THEN RAISE EXCEPTION 'U.M. del conteggio non valida'; END IF;
  END IF;
$new$||old);
 def:=replace(def,'stock_unit_id, stock_quantity, conversion_factor, counted_package_id, counted_package_version','stock_unit_id, stock_quantity, conversion_factor, counted_package_id, counted_package_version, snapshot_version');
 def:=replace(def,'v_conversion.factor,v_conversion.package_id,v_conversion.package_version)','v_conversion.factor,v_conversion.package_id,v_conversion.package_version,1)');
 def:=replace(def,'counted_package_version=EXCLUDED.counted_package_version','counted_package_version=EXCLUDED.counted_package_version, snapshot_version=EXCLUDED.snapshot_version');
 EXECUTE def;
 SELECT pg_get_functiondef('public.confirm_all_inventory_drafts(uuid)'::regprocedure) INTO def;
 def:=replace(def,'lower(u.code) = lower(v_draft.unit_code)','lower(btrim(u.code)) = lower(btrim(v_draft.unit_code))');
 old:='''conteggio'', v_qty, v_unit, NULL, NULL, NULL, NULL,';
 IF strpos(def,old)=0 THEN RAISE EXCEPTION 'Conferma collettiva inattesa'; END IF;
 def:=replace(def,old,'''conteggio'', v_qty, v_unit, v_draft.unit_code, NULL, NULL, NULL,');
 EXECUTE def;
 FOREACH signature IN ARRAY ARRAY['public._inventory_card_stock(uuid,uuid,uuid)','public.inventory_location_stock(uuid,uuid)','public.inventory_session_progress(uuid)','public.inventory_session_rows(uuid,uuid,text,text,text,boolean,integer)','public.close_general_inventory(uuid,uuid,uuid)'] LOOP
 SELECT pg_get_functiondef(signature::regprocedure) INTO def;
 IF strpos(def,'c.stock_unit_id IS NULL AND c.stock_quantity IS NULL')=0 THEN RAISE EXCEPTION 'Lettore snapshot inatteso: %',signature; END IF;
 def:=replace(def,'c.stock_unit_id IS NULL AND c.stock_quantity IS NULL','c.snapshot_version IS NULL AND c.stock_unit_id IS NULL AND c.stock_quantity IS NULL');
 IF signature LIKE '%_inventory_card_stock%' OR signature LIKE '%inventory_location_stock%' THEN
 old:='AND s.status = ''completata''';
 IF strpos(def,old)=0 THEN RAISE EXCEPTION 'Lettore giacenza inatteso'; END IF;
 replacement:=old||$new$
       AND NOT EXISTS (
         SELECT 1 FROM public.inventory_counts unknown_count
         JOIN public.inventory_sessions unknown_session ON unknown_session.id=unknown_count.session_id
         WHERE unknown_count.product_id=c.product_id AND unknown_count.location_id=c.location_id
           AND unknown_session.status='completata' AND unknown_count.counted_quantity IS NOT NULL
           AND unknown_count.snapshot_version IS NOT NULL
           AND (unknown_count.stock_unit_id IS DISTINCT FROM p.stock_unit_id OR unknown_count.stock_quantity IS NULL)
           AND (unknown_count.session_id=c.session_id OR unknown_count.counted_at>=c.counted_at)
       )$new$;
 def:=replace(def,old,replacement);
 END IF;
 IF signature LIKE '%close_general%' THEN
 old:=substring(def FROM '    IF v_uncounted > 0 THEN[\s\S]*?    UPDATE public.inventory_sessions SET status');
 IF old IS NULL THEN RAISE EXCEPTION 'Chiusura inventario inattesa'; END IF;
 def:=replace(def,old,'    UPDATE public.inventory_sessions SET status');
 old:='SELECT COALESCE(sum(CASE WHEN c.stock_unit_id=p.stock_unit_id AND c.stock_quantity IS NOT NULL THEN c.stock_quantity WHEN c.snapshot_version IS NULL AND c.stock_unit_id IS NULL AND c.stock_quantity IS NULL AND lower(btrim(c.unit_code))=lower(btrim(su.code)) THEN c.counted_quantity END), 0) INTO v_new';
 IF strpos(def,old)=0 THEN RAISE EXCEPTION 'Riepilogo riapertura inatteso'; END IF;
 replacement:='SELECT CASE WHEN count(*) FILTER (WHERE c.counted_quantity IS NOT NULL AND NOT COALESCE((c.stock_unit_id=p.stock_unit_id AND c.stock_quantity IS NOT NULL) OR (c.snapshot_version IS NULL AND c.stock_unit_id IS NULL AND c.stock_quantity IS NULL AND lower(btrim(c.unit_code))=lower(btrim(su.code))),false))>0 THEN NULL ELSE sum(CASE WHEN c.stock_unit_id=p.stock_unit_id AND c.stock_quantity IS NOT NULL THEN c.stock_quantity WHEN c.snapshot_version IS NULL AND c.stock_unit_id IS NULL AND c.stock_quantity IS NULL AND lower(btrim(c.unit_code))=lower(btrim(su.code)) THEN c.counted_quantity END) END INTO v_new';
 def:=replace(def,old,replacement);
 END IF;
 EXECUTE def;
 END LOOP;
END $migration$;
CREATE OR REPLACE FUNCTION public.product_count_units(_company_id uuid,_product_ids uuid[])
RETURNS TABLE(product_id uuid,unit_code text,unit_label text,is_base boolean,sources text[],conversion_factor numeric,conversion_reference_um text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
 RETURN QUERY WITH wanted AS(SELECT p.id,p.stock_unit_id FROM public.products p WHERE p.company_id=_company_id AND p.id=ANY(COALESCE(_product_ids,ARRAY[]::uuid[]))), candidates AS(
 SELECT w.id,w.stock_unit_id,u.id AS unit_id FROM wanted w JOIN public.units_of_measure u ON u.company_id=_company_id AND u.status='attivo'
 UNION SELECT w.id,w.stock_unit_id,w.stock_unit_id FROM wanted w WHERE w.stock_unit_id IS NOT NULL
 UNION SELECT w.id,w.stock_unit_id,iu.unit_id FROM wanted w JOIN public.product_inventory_units iu ON iu.product_id=w.id
 ), factors AS(SELECT c.id,c.stock_unit_id,c.unit_id,count(distinct pk.stock_quantity) AS n,min(pk.stock_quantity) AS factor FROM candidates c LEFT JOIN public.product_stock_packages pk ON pk.product_id=c.id AND pk.unit_id=c.unit_id AND pk.status='attivo' AND pk.stock_quantity>0 AND pk.verified_stock_unit_id=c.stock_unit_id GROUP BY c.id,c.stock_unit_id,c.unit_id)
 SELECT f.id,u.code,u.description,COALESCE(f.unit_id=f.stock_unit_id,false),ARRAY['inventario']::text[],CASE WHEN f.unit_id=f.stock_unit_id THEN 1::numeric WHEN f.n=1 THEN f.factor END,CASE WHEN f.unit_id=f.stock_unit_id OR f.n=1 THEN su.code END FROM factors f JOIN public.units_of_measure u ON u.id=f.unit_id LEFT JOIN public.units_of_measure su ON su.id=f.stock_unit_id ORDER BY f.id,COALESCE(f.unit_id=f.stock_unit_id,false) DESC,u.code;
END $$;
REVOKE ALL ON FUNCTION public.product_count_units(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.product_count_units(uuid,uuid[]) TO authenticated;
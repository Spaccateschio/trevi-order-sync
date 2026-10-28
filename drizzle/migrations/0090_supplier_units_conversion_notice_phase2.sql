CREATE OR REPLACE FUNCTION public.sync_supplier_link_default_unit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_link uuid:=COALESCE(NEW.link_id,OLD.link_id); v_unit uuid;
BEGIN
 PERFORM 1 FROM public.product_supplier_links WHERE id=v_link FOR UPDATE;
 SELECT unit_id INTO v_unit FROM public.product_supplier_link_units WHERE link_id=v_link AND is_active ORDER BY is_default DESC,created_at,id LIMIT 1;
 UPDATE public.product_supplier_links SET purchase_unit_id=v_unit WHERE id=v_link AND purchase_unit_id IS DISTINCT FROM v_unit;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.inherit_manual_supplier_purchase_units() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.origin<>'manuale' OR NEW.b2b_item_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.supplier_customer_relations WHERE supplier_record_id=NEW.supplier_record_id AND buyer_company_id=NEW.company_id AND status='attivo') THEN RETURN NEW; END IF;
 INSERT INTO public.product_supplier_link_units(company_id,link_id,unit_id,is_default,is_active,created_by)
 SELECT NEW.company_id,NEW.id,pu.unit_id,pu.is_default,true,auth.uid() FROM public.product_purchase_units pu JOIN public.units_of_measure u ON u.id=pu.unit_id WHERE pu.product_id=NEW.product_id AND pu.company_id=NEW.company_id AND u.company_id=NEW.company_id AND u.status='attivo' AND u.usage IN ('acquisto','entrambi');
 RETURN NEW;
END $$;
CREATE TRIGGER inherit_manual_supplier_purchase_units AFTER INSERT ON public.product_supplier_links FOR EACH ROW EXECUTE FUNCTION public.inherit_manual_supplier_purchase_units();
ALTER TABLE public.supplier_records ADD COLUMN lead_time_days integer;
ALTER TABLE public.supplier_records ADD CONSTRAINT supplier_notice_nonnegative CHECK(lead_time_days IS NULL OR lead_time_days>=0);
WITH freqs AS (SELECT company_id,supplier_record_id,lead_time_days,count(*) n FROM public.product_supplier_links WHERE lead_time_days IS NOT NULL GROUP BY company_id,supplier_record_id,lead_time_days), ranked AS(SELECT *,row_number() OVER(PARTITION BY company_id,supplier_record_id ORDER BY n DESC,lead_time_days) r FROM freqs)
UPDATE public.supplier_records s SET lead_time_days=r.lead_time_days FROM ranked r WHERE r.r=1 AND s.id=r.supplier_record_id AND s.buyer_company_id=r.company_id AND s.lead_time_days IS NULL;
CREATE OR REPLACE FUNCTION public.set_supplier_notice(_supplier_record_id uuid,_days integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_company uuid;
BEGIN
 SELECT buyer_company_id INTO v_company FROM public.supplier_records WHERE id=_supplier_record_id FOR UPDATE;
 IF auth.uid() IS NULL OR v_company IS NULL OR NOT public.is_company_admin(v_company) THEN RAISE EXCEPTION 'Permessi insufficienti'; END IF;
 IF _days IS NOT NULL AND _days<0 THEN RAISE EXCEPTION 'Preavviso non valido'; END IF;
 UPDATE public.supplier_records SET lead_time_days=_days WHERE id=_supplier_record_id;
END $$;
REVOKE ALL ON FUNCTION public.set_supplier_notice(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_supplier_notice(uuid,integer) TO authenticated;
SELECT set_config('app.unit_config_rpc','on',true);
WITH candidates AS(SELECT lu.id,p.stock_unit_id,su.code,lu.conversion_factor,lu.unit_id,lower(btrim(COALESCE(l.conversion_reference_um,''))) target FROM public.product_supplier_link_units lu JOIN public.product_supplier_links l ON l.id=lu.link_id JOIN public.products p ON p.id=l.product_id JOIN public.units_of_measure su ON su.id=p.stock_unit_id WHERE lu.conversion_mode IS NULL AND lu.stock_conversion_factor IS NULL AND lu.indicative_factor IS NULL AND lu.package_id IS NULL AND lu.verified_stock_unit_id IS NULL AND lu.verified_package_version IS NULL AND lu.conversion_factor>0)
UPDATE public.product_supplier_link_units lu SET conversion_mode=CASE WHEN c.code='kg' THEN 'variabile' ELSE 'fissa' END,stock_conversion_factor=CASE WHEN c.code<>'kg' THEN c.conversion_factor END,indicative_factor=CASE WHEN c.code='kg' THEN c.conversion_factor END,verified_stock_unit_id=c.stock_unit_id FROM candidates c WHERE lu.id=c.id AND ((c.unit_id<>c.stock_unit_id AND c.target=lower(btrim(c.code))) OR (c.unit_id=c.stock_unit_id AND c.conversion_factor=1));
SELECT set_config('app.unit_config_rpc','off',true);
COMMENT ON COLUMN public.product_supplier_links.lead_time_days IS 'DEPRECATED: supplier notice is supplier_records.lead_time_days; retained for published compatibility';
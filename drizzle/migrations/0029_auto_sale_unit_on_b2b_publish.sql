-- Regola: un prodotto pubblicato in vetrina B2B ha sempre almeno una U.M. di vendita.
-- Se non ne ha, si crea dalla U.M. di magazzino (stock_unit_id) o, in mancanza, dall'U.M. aziendale
-- attiva con codice = danea_um: attiva, visibile, predefinita, fattore 1, conversione esatta.
-- Nessuna conversione verso la giacenza del cliente (product_supplier_link_units non toccata).
CREATE OR REPLACE FUNCTION public.ensure_default_product_sale_unit(_product_id uuid, _actor_user_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _p record;
  _unit_id uuid;
  _id uuid;
BEGIN
  SELECT id, company_id, stock_unit_id, danea_um INTO _p FROM public.products WHERE id = _product_id;
  IF _p.id IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.product_sale_units WHERE product_id = _product_id) THEN RETURN NULL; END IF;

  SELECT u.id INTO _unit_id FROM public.units_of_measure u
   WHERE u.id = _p.stock_unit_id AND u.company_id = _p.company_id AND u.status = 'attivo';
  IF _unit_id IS NULL AND NULLIF(btrim(coalesce(_p.danea_um, '')), '') IS NOT NULL THEN
    SELECT u.id INTO _unit_id FROM public.units_of_measure u
     WHERE u.company_id = _p.company_id AND u.status = 'attivo' AND lower(u.code) = lower(btrim(_p.danea_um))
     ORDER BY u.created_at LIMIT 1;
  END IF;
  IF _unit_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.product_sale_units (company_id, product_id, unit_id, is_active, is_customer_visible, is_default,
    conversion_factor, conversion_reference_um, conversion_type, created_by, updated_by)
  VALUES (_p.company_id, _product_id, _unit_id, true, true, true, 1,
    (SELECT code FROM public.units_of_measure WHERE id = _unit_id), 'esatta', _actor_user_id, _actor_user_id)
  ON CONFLICT (product_id, unit_id) DO NOTHING
  RETURNING id INTO _id;

  IF _id IS NOT NULL THEN
    INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
    VALUES (_p.company_id, _actor_user_id, 'product_sale_unit.auto_default', 'product', _product_id,
      jsonb_build_object('unit_id', _unit_id, 'conversion_factor', 1, 'conversion_type', 'esatta', 'source', 'b2b_publish'));
  END IF;
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_default_product_sale_unit(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_default_product_sale_unit(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.products_ensure_sale_unit_on_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _explicit boolean;
BEGIN
  IF NOT (NEW.b2b_visible AND NEW.publish_status = 'pubblicato') THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.product_sale_units WHERE product_id = NEW.id) THEN RETURN NULL; END IF;
  PERFORM public.ensure_default_product_sale_unit(NEW.id, auth.uid());
  IF NOT EXISTS (SELECT 1 FROM public.product_sale_units WHERE product_id = NEW.id) THEN
    -- Blocco solo sulla pubblicazione esplicita in vetrina (b2b_visible da false a true):
    -- l'import Danea non cambia b2b_visible e non viene interrotto.
    _explicit := TG_OP = 'UPDATE' AND NOT coalesce(OLD.b2b_visible, false);
    IF _explicit THEN
      RAISE EXCEPTION 'Imposta almeno una U.M. di vendita prima di pubblicare';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS products_ensure_sale_unit_on_publish ON public.products;
CREATE TRIGGER products_ensure_sale_unit_on_publish
AFTER INSERT OR UPDATE OF b2b_visible, publish_status, stock_unit_id, danea_um ON public.products
FOR EACH ROW EXECUTE FUNCTION public.products_ensure_sale_unit_on_publish();
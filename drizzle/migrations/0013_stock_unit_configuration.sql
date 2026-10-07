-- Passo 2: configurazione U.M. di magazzino, confezioni versionate e conversioni fornitore verso la U.M. di magazzino.
-- Nessuna tabella storica e nessun dato esistente vengono modificati.

ALTER TABLE public.product_stock_packages
  ADD COLUMN IF NOT EXISTS package_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS verified_stock_unit_id uuid REFERENCES public.units_of_measure(id);
COMMENT ON COLUMN public.product_stock_packages.package_version IS 'Aumenta di 1 a ogni modifica sostanziale (quantità, U.M. confezione, U.M. di magazzino di riferimento).';
COMMENT ON COLUMN public.product_stock_packages.verified_stock_unit_id IS 'U.M. di magazzino per cui vale stock_quantity. Diversa da products.stock_unit_id = confezione da rivedere.';

ALTER TABLE public.product_supplier_link_units
  ADD COLUMN IF NOT EXISTS stock_conversion_factor numeric CHECK (stock_conversion_factor IS NULL OR stock_conversion_factor > 0),
  ADD COLUMN IF NOT EXISTS verified_stock_unit_id uuid REFERENCES public.units_of_measure(id),
  ADD COLUMN IF NOT EXISTS verified_package_version integer;
COMMENT ON COLUMN public.product_supplier_link_units.stock_conversion_factor IS 'Conversione U.M. acquisto fornitore -> U.M. di magazzino. Separata da conversion_factor (sistema attuale, letto da Lista e vecchio selettore).';
COMMENT ON COLUMN public.product_supplier_link_units.verified_stock_unit_id IS 'U.M. di magazzino per cui la conversione è stata confermata.';
COMMENT ON COLUMN public.product_supplier_link_units.verified_package_version IS 'Versione della confezione collegata al momento della conferma.';

-- Versione della confezione
CREATE OR REPLACE FUNCTION public.bump_package_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stock_quantity IS DISTINCT FROM OLD.stock_quantity
     OR NEW.unit_id IS DISTINCT FROM OLD.unit_id
     OR NEW.verified_stock_unit_id IS DISTINCT FROM OLD.verified_stock_unit_id THEN
    NEW.package_version := OLD.package_version + 1;
  ELSE
    NEW.package_version := OLD.package_version;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER product_stock_packages_version BEFORE UPDATE ON public.product_stock_packages
  FOR EACH ROW EXECUTE FUNCTION public.bump_package_version();

-- Le confezioni si scrivono solo tramite manage_product_stock_package
CREATE OR REPLACE FUNCTION public.guard_product_stock_package()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND COALESCE(current_setting('app.unit_config_rpc', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Le confezioni si modificano solo dalla scheda prodotto';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = NEW.product_id AND p.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'Prodotto non valido per questa azienda';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.units_of_measure u WHERE u.id = NEW.unit_id AND u.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'U.M. non valida per questa azienda';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- U.M. di magazzino: solo amministratori e solo tramite set_product_stock_unit
CREATE OR REPLACE FUNCTION public.guard_product_stock_unit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stock_unit_id IS NOT DISTINCT FROM OLD.stock_unit_id AND NEW.stock_base_at IS NOT DISTINCT FROM OLD.stock_base_at THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_company_admin(NEW.company_id) THEN
    RAISE EXCEPTION 'Solo un amministratore può cambiare la U.M. di magazzino';
  END IF;
  IF auth.uid() IS NOT NULL AND COALESCE(current_setting('app.unit_config_rpc', true), '') <> 'on' THEN
    RAISE EXCEPTION 'La U.M. di magazzino si cambia solo dalla scheda prodotto';
  END IF;
  IF NEW.stock_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.units_of_measure u WHERE u.id = NEW.stock_unit_id AND u.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'U.M. di magazzino non valida per questa azienda';
  END IF;
  IF current_setting('app.stock_unit_backfill', true) = 'on' THEN
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END $$;

-- Conversione fornitore: controlli sui nuovi campi; il vecchio conversion_factor non viene più vincolato
CREATE OR REPLACE FUNCTION public.guard_supplier_link_unit_conversion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND COALESCE(current_setting('app.unit_config_rpc', true), '') <> 'on'
     AND (TG_OP = 'INSERT' AND (NEW.conversion_mode IS NOT NULL OR NEW.stock_conversion_factor IS NOT NULL OR NEW.verified_stock_unit_id IS NOT NULL OR NEW.verified_package_version IS NOT NULL OR NEW.package_id IS NOT NULL OR NEW.indicative_factor IS NOT NULL)
       OR TG_OP = 'UPDATE' AND (NEW.conversion_mode IS DISTINCT FROM OLD.conversion_mode
         OR NEW.stock_conversion_factor IS DISTINCT FROM OLD.stock_conversion_factor
         OR NEW.verified_stock_unit_id IS DISTINCT FROM OLD.verified_stock_unit_id
         OR NEW.verified_package_version IS DISTINCT FROM OLD.verified_package_version
         OR NEW.package_id IS DISTINCT FROM OLD.package_id
         OR NEW.indicative_factor IS DISTINCT FROM OLD.indicative_factor)) THEN
    RAISE EXCEPTION 'La conversione verso la U.M. di magazzino si modifica solo dalla scheda prodotto';
  END IF;
  IF NEW.conversion_mode = 'fissa' AND NEW.stock_conversion_factor IS NULL THEN
    RAISE EXCEPTION 'Con conversione fissa serve un fattore maggiore di zero o una confezione';
  END IF;
  IF NEW.conversion_mode = 'variabile' AND (NEW.stock_conversion_factor IS NOT NULL OR NEW.package_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Con quantità variabile non si indica un fattore fisso: usa il valore indicativo';
  END IF;
  IF NEW.package_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.product_stock_packages pk JOIN public.product_supplier_links l ON l.id = NEW.link_id
    WHERE pk.id = NEW.package_id AND pk.product_id = l.product_id) THEN
    RAISE EXCEPTION 'La confezione non appartiene a questo prodotto';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.set_product_stock_unit(_product_id uuid, _unit_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_product public.products;
  v_unit public.units_of_measure;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_company_admin(v_product.company_id) THEN
    RAISE EXCEPTION 'Solo un amministratore può cambiare la U.M. di magazzino';
  END IF;
  SELECT * INTO v_unit FROM public.units_of_measure WHERE id = _unit_id AND company_id = v_product.company_id AND status = 'attivo';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'U.M. non valida per questa azienda';
  END IF;
  IF v_product.stock_unit_id IS NOT DISTINCT FROM _unit_id THEN
    RETURN jsonb_build_object('changed', false, 'stock_base_at', v_product.stock_base_at);
  END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_sessions s WHERE s.company_id = v_product.company_id AND s.status = 'in_corso') THEN
    RAISE EXCEPTION 'Chiudi o annulla l''inventario in corso prima di cambiare la U.M. di magazzino';
  END IF;
  PERFORM set_config('app.unit_config_rpc', 'on', true);
  UPDATE public.products SET stock_unit_id = _unit_id, stock_base_at = now() WHERE id = _product_id
    RETURNING * INTO v_product;
  PERFORM set_config('app.unit_config_rpc', 'off', true);
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (v_product.company_id, auth.uid(), 'stock_unit_changed', 'product', _product_id,
    jsonb_build_object('new_unit_id', _unit_id, 'new_unit_code', v_unit.code, 'stock_base_at', v_product.stock_base_at));
  RETURN jsonb_build_object('changed', true, 'stock_base_at', v_product.stock_base_at);
END $$;

CREATE OR REPLACE FUNCTION public.manage_product_stock_package(
  _product_id uuid, _package_id uuid, _name text, _unit_id uuid, _stock_quantity numeric, _active boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_product public.products;
  v_stock public.units_of_measure;
  v_id uuid;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = _product_id;
  IF NOT FOUND OR NOT public.is_company_admin(v_product.company_id) THEN
    RAISE EXCEPTION 'Solo un amministratore può gestire le confezioni';
  END IF;
  IF v_product.stock_unit_id IS NULL THEN
    RAISE EXCEPTION 'Imposta prima la U.M. di magazzino';
  END IF;
  SELECT * INTO v_stock FROM public.units_of_measure WHERE id = v_product.stock_unit_id;
  IF btrim(COALESCE(_name, '')) = '' THEN RAISE EXCEPTION 'Indica il nome della confezione'; END IF;
  IF _stock_quantity IS NULL OR _stock_quantity <= 0 THEN RAISE EXCEPTION 'La quantità deve essere maggiore di zero'; END IF;
  IF NOT v_stock.allows_decimals AND _stock_quantity <> trunc(_stock_quantity) THEN
    RAISE EXCEPTION 'La U.M. di magazzino % non ammette decimali', v_stock.code;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.units_of_measure u WHERE u.id = _unit_id AND u.company_id = v_product.company_id AND u.status = 'attivo') THEN
    RAISE EXCEPTION 'U.M. della confezione non valida';
  END IF;
  PERFORM set_config('app.unit_config_rpc', 'on', true);
  IF _package_id IS NULL THEN
    INSERT INTO public.product_stock_packages (company_id, product_id, name, unit_id, stock_quantity, status, verified_stock_unit_id)
    VALUES (v_product.company_id, _product_id, btrim(_name), _unit_id, _stock_quantity,
      CASE WHEN _active THEN 'attivo'::public.entity_status ELSE 'disattivato'::public.entity_status END, v_product.stock_unit_id)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.product_stock_packages
       SET name = btrim(_name), unit_id = _unit_id, stock_quantity = _stock_quantity,
           status = CASE WHEN _active THEN 'attivo'::public.entity_status ELSE 'disattivato'::public.entity_status END,
           verified_stock_unit_id = v_product.stock_unit_id
     WHERE id = _package_id AND product_id = _product_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Confezione non trovata'; END IF;
  END IF;
  PERFORM set_config('app.unit_config_rpc', 'off', true);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.set_supplier_unit_conversion(
  _link_unit_id uuid, _mode text, _package_id uuid DEFAULT NULL, _factor numeric DEFAULT NULL, _indicative numeric DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lu public.product_supplier_link_units;
  v_product public.products;
  v_stock public.units_of_measure;
  v_pk public.product_stock_packages;
  v_factor numeric;
  v_version integer;
BEGIN
  SELECT * INTO v_lu FROM public.product_supplier_link_units WHERE id = _link_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'U.M. d''acquisto non trovata'; END IF;
  SELECT p.* INTO v_product FROM public.products p JOIN public.product_supplier_links l ON l.product_id = p.id WHERE l.id = v_lu.link_id;
  IF NOT public.is_company_admin(v_product.company_id) OR v_lu.company_id <> v_product.company_id THEN
    RAISE EXCEPTION 'Solo un amministratore può configurare le conversioni';
  END IF;
  IF _mode IS NOT NULL AND _mode NOT IN ('stessa','fissa','variabile') THEN RAISE EXCEPTION 'Modalità non valida'; END IF;

  PERFORM set_config('app.unit_config_rpc', 'on', true);
  IF _mode IS NULL THEN
    UPDATE public.product_supplier_link_units
       SET conversion_mode = NULL, stock_conversion_factor = NULL, indicative_factor = NULL, package_id = NULL,
           verified_stock_unit_id = NULL, verified_package_version = NULL
     WHERE id = _link_unit_id;
    PERFORM set_config('app.unit_config_rpc', 'off', true);
    RETURN;
  END IF;

  IF v_product.stock_unit_id IS NULL THEN RAISE EXCEPTION 'Imposta prima la U.M. di magazzino'; END IF;
  SELECT * INTO v_stock FROM public.units_of_measure WHERE id = v_product.stock_unit_id;

  IF _mode = 'stessa' THEN
    IF v_lu.unit_id <> v_product.stock_unit_id THEN
      RAISE EXCEPTION 'Modalità «stessa» possibile solo se la U.M. d''acquisto coincide con la U.M. di magazzino';
    END IF;
    v_factor := NULL;
  ELSIF _mode = 'fissa' THEN
    IF _package_id IS NOT NULL THEN
      SELECT * INTO v_pk FROM public.product_stock_packages WHERE id = _package_id AND product_id = v_product.id;
      IF NOT FOUND OR v_pk.status <> 'attivo' THEN RAISE EXCEPTION 'Confezione non disponibile'; END IF;
      IF v_pk.verified_stock_unit_id IS DISTINCT FROM v_product.stock_unit_id THEN
        RAISE EXCEPTION 'La confezione «%» è da rivedere: riconfermala prima di usarla', v_pk.name;
      END IF;
      v_factor := v_pk.stock_quantity;
      v_version := v_pk.package_version;
    ELSE
      IF _factor IS NULL OR _factor <= 0 THEN RAISE EXCEPTION 'Indica un fattore maggiore di zero o una confezione'; END IF;
      IF NOT v_stock.allows_decimals AND _factor <> trunc(_factor) THEN
        RAISE EXCEPTION 'La U.M. di magazzino % non ammette decimali', v_stock.code;
      END IF;
      v_factor := _factor;
    END IF;
  ELSE
    IF _indicative IS NOT NULL AND _indicative <= 0 THEN RAISE EXCEPTION 'Il valore indicativo deve essere maggiore di zero'; END IF;
    v_factor := NULL;
  END IF;

  UPDATE public.product_supplier_link_units
     SET conversion_mode = _mode,
         stock_conversion_factor = v_factor,
         package_id = CASE WHEN _mode = 'fissa' THEN _package_id END,
         indicative_factor = CASE WHEN _mode = 'variabile' THEN _indicative END,
         verified_stock_unit_id = v_product.stock_unit_id,
         verified_package_version = CASE WHEN _mode = 'fissa' AND _package_id IS NOT NULL THEN v_version END
   WHERE id = _link_unit_id;
  PERFORM set_config('app.unit_config_rpc', 'off', true);
END $$;

CREATE OR REPLACE FUNCTION public.effective_supplier_conversion(_link_unit_id uuid)
RETURNS TABLE(conversion_mode text, stock_conversion_factor numeric, indicative_factor numeric, package_id uuid, stock_unit_id uuid, is_valid boolean, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lu public.product_supplier_link_units;
  v_product public.products;
  v_pk public.product_stock_packages;
  v_reason text;
BEGIN
  SELECT * INTO v_lu FROM public.product_supplier_link_units WHERE id = _link_unit_id;
  IF NOT FOUND OR NOT public.is_company_member(v_lu.company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT p.* INTO v_product FROM public.products p JOIN public.product_supplier_links l ON l.product_id = p.id WHERE l.id = v_lu.link_id;
  IF v_lu.package_id IS NOT NULL THEN SELECT * INTO v_pk FROM public.product_stock_packages WHERE id = v_lu.package_id; END IF;

  v_reason := CASE
    WHEN v_product.stock_unit_id IS NULL THEN 'U.M. di magazzino mancante'
    WHEN v_lu.conversion_mode IS NULL THEN 'Conversione da configurare'
    WHEN v_lu.verified_stock_unit_id IS DISTINCT FROM v_product.stock_unit_id THEN 'Conversione confermata per un''altra U.M. di magazzino'
    WHEN v_lu.conversion_mode = 'stessa' AND v_lu.unit_id <> v_product.stock_unit_id THEN 'U.M. diverse con modalità «stessa»'
    WHEN v_lu.package_id IS NOT NULL AND v_pk.status <> 'attivo' THEN 'Confezione disattivata'
    WHEN v_lu.package_id IS NOT NULL AND v_pk.verified_stock_unit_id IS DISTINCT FROM v_product.stock_unit_id THEN 'Confezione da rivedere'
    WHEN v_lu.package_id IS NOT NULL AND v_pk.package_version IS DISTINCT FROM v_lu.verified_package_version THEN 'Confezione modificata dopo la conferma'
    WHEN v_lu.conversion_mode = 'fissa' AND v_lu.stock_conversion_factor IS NULL THEN 'Fattore mancante'
    ELSE NULL END;

  RETURN QUERY SELECT v_lu.conversion_mode,
    CASE WHEN v_reason IS NULL THEN CASE v_lu.conversion_mode WHEN 'stessa' THEN 1::numeric WHEN 'fissa' THEN v_lu.stock_conversion_factor END END,
    CASE WHEN v_reason IS NULL THEN v_lu.indicative_factor END,
    CASE WHEN v_reason IS NULL THEN v_lu.package_id END,
    v_product.stock_unit_id, v_reason IS NULL, v_reason;
END $$;

CREATE OR REPLACE FUNCTION public.product_unit_config_issues(_company_id uuid, _product_ids uuid[] DEFAULT NULL)
RETURNS TABLE(product_id uuid, reason_code text, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  RETURN QUERY
  WITH prods AS (
    SELECT p.id, p.stock_unit_id, p.danea_um, su.code AS stock_code, su.allows_decimals
    FROM public.products p LEFT JOIN public.units_of_measure su ON su.id = p.stock_unit_id
    WHERE p.company_id = _company_id AND (_product_ids IS NULL OR p.id = ANY(_product_ids))
  ),
  lus AS (
    SELECT pr.id AS product_id, pr.stock_unit_id, pr.stock_code, pr.allows_decimals, lu.*, u.code AS unit_code,
           COALESCE(sr.legal_name, 'fornitore') AS supplier_name,
           pk.status AS pk_status, pk.name AS pk_name, pk.package_version AS pk_version, pk.verified_stock_unit_id AS pk_verified
    FROM prods pr
    JOIN public.product_supplier_links l ON l.product_id = pr.id AND l.company_id = _company_id AND l.is_active
    JOIN public.product_supplier_link_units lu ON lu.link_id = l.id AND lu.is_active
    JOIN public.units_of_measure u ON u.id = lu.unit_id
    LEFT JOIN public.supplier_records sr ON sr.id = l.supplier_record_id
    LEFT JOIN public.product_stock_packages pk ON pk.id = lu.package_id
    WHERE pr.stock_unit_id IS NOT NULL
  )
  SELECT pr.id, 'stock_unit_missing', 'U.M. di magazzino mancante' || COALESCE(' — Danea: ' || NULLIF(btrim(pr.danea_um), ''), '')
    FROM prods pr WHERE pr.stock_unit_id IS NULL
  UNION ALL
  SELECT x.product_id, 'mode_missing', 'U.M. d''acquisto ' || x.unit_code || ' (' || x.supplier_name || ') diversa dalla U.M. di magazzino senza modalità'
    FROM lus x WHERE x.conversion_mode IS NULL AND x.unit_id <> x.stock_unit_id
  UNION ALL
  SELECT x.product_id, 'same_mismatch', 'Modalità «stessa» con U.M. diverse: ' || x.unit_code || ' / ' || x.stock_code || ' (' || x.supplier_name || ')'
    FROM lus x WHERE x.conversion_mode = 'stessa' AND x.unit_id <> x.stock_unit_id
  UNION ALL
  SELECT x.product_id, 'factor_missing', 'Conversione fissa senza fattore né confezione: ' || x.unit_code || ' (' || x.supplier_name || ')'
    FROM lus x WHERE x.conversion_mode = 'fissa' AND x.stock_conversion_factor IS NULL
  UNION ALL
  SELECT x.product_id, 'verified_other_unit', 'Conversione ' || x.unit_code || ' (' || x.supplier_name || ') confermata per un''altra U.M. di magazzino'
    FROM lus x WHERE x.conversion_mode IS NOT NULL AND x.verified_stock_unit_id IS DISTINCT FROM x.stock_unit_id
  UNION ALL
  SELECT x.product_id, 'package_inactive', 'Confezione «' || x.pk_name || '» disattivata ma collegata a ' || x.unit_code || ' (' || x.supplier_name || ')'
    FROM lus x WHERE x.package_id IS NOT NULL AND x.pk_status <> 'attivo'
  UNION ALL
  SELECT x.product_id, 'package_version_changed', 'Confezione «' || x.pk_name || '» modificata dopo la conferma (versione ' || COALESCE(x.verified_package_version::text, '?') || ' → ' || x.pk_version || ')'
    FROM lus x WHERE x.package_id IS NOT NULL AND x.pk_version IS DISTINCT FROM x.verified_package_version
  UNION ALL
  SELECT x.product_id, 'factor_decimals', 'Fattore ' || x.stock_conversion_factor || ' non intero ma la U.M. ' || x.stock_code || ' non ammette decimali'
    FROM lus x WHERE x.stock_conversion_factor IS NOT NULL AND NOT x.allows_decimals AND x.stock_conversion_factor <> trunc(x.stock_conversion_factor)
  UNION ALL
  SELECT pk.product_id, 'package_review', 'Confezione «' || pk.name || '» da rivedere: definita per un''altra U.M. di magazzino'
    FROM public.product_stock_packages pk JOIN prods pr ON pr.id = pk.product_id
    WHERE pk.status = 'attivo' AND pr.stock_unit_id IS NOT NULL AND pk.verified_stock_unit_id IS DISTINCT FROM pr.stock_unit_id;
END $$;

REVOKE ALL ON FUNCTION public.set_product_stock_unit(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.manage_product_stock_package(uuid, uuid, text, uuid, numeric, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_supplier_unit_conversion(uuid, text, uuid, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.effective_supplier_conversion(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.product_unit_config_issues(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_stock_unit(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_product_stock_package(uuid, uuid, text, uuid, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_supplier_unit_conversion(uuid, text, uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.effective_supplier_conversion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.product_unit_config_issues(uuid, uuid[]) TO authenticated;

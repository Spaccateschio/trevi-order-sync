DO $$
BEGIN
  IF current_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION 'Migrazione riservata al ruolo proprietario';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_supplier_link_code_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_code text; v_item public.products;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NULLIF(btrim(COALESCE(NEW.supplier_product_code,'')),'') IS NOT DISTINCT FROM NULLIF(btrim(COALESCE(OLD.supplier_product_code,'')),'')
     AND NEW.b2b_item_id IS NOT DISTINCT FROM OLD.b2b_item_id
     AND NEW.supplier_company_id IS NOT DISTINCT FROM OLD.supplier_company_id THEN
    RETURN NEW;
  END IF;
  v_code := NULLIF(btrim(COALESCE(NEW.supplier_product_code,'')),'');
  IF v_code IS NULL OR NEW.b2b_item_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_item FROM public.products WHERE id = NEW.b2b_item_id;
  IF v_item.id IS NULL OR btrim(COALESCE(v_item.code,'')) = v_code THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.products o
              WHERE o.company_id = v_item.company_id
                AND o.archive_id IS NOT DISTINCT FROM v_item.archive_id
                AND o.id <> v_item.id
                AND btrim(o.code) = v_code) THEN
    RAISE EXCEPTION 'Il codice indica un altro articolo del fornitore: verifica l''abbinamento prima di salvare';
  END IF;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.guard_supplier_link_code_identity() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER product_supplier_links_code_identity_guard
BEFORE INSERT OR UPDATE OF supplier_product_code, b2b_item_id, supplier_company_id
ON public.product_supplier_links
FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_link_code_identity();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='product_supplier_links_code_identity_guard' AND tgrelid='public.product_supplier_links'::regclass) THEN
    RAISE EXCEPTION 'Controllo finale fallito: trigger assente';
  END IF;
END $$;
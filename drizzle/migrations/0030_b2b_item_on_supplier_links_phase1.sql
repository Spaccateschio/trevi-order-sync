ALTER TABLE public.product_supplier_links
  ADD COLUMN IF NOT EXISTS supplier_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS b2b_item_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.shopping_list_item_suppliers
  ADD COLUMN IF NOT EXISTS is_selected boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.shopping_list_item_suppliers.is_selected IS
  'Spunta «compro da qui»: letta solo nelle Liste aperte (fase 5); non significativa nelle Liste chiuse o annullate';

UPDATE public.product_supplier_links k
SET supplier_company_id = r.seller_company_id
FROM public.supplier_customer_relations r
WHERE k.supplier_company_id IS NULL
  AND r.supplier_record_id = k.supplier_record_id
  AND r.buyer_company_id  = k.company_id
  AND (SELECT count(*) FROM public.supplier_customer_relations r2
       WHERE r2.supplier_record_id = k.supplier_record_id
         AND r2.buyer_company_id = k.company_id) = 1;

UPDATE public.product_supplier_links k
SET b2b_item_id = p.created_from_product_id
FROM public.products p, public.products s
WHERE k.b2b_item_id IS NULL
  AND p.id = k.product_id
  AND p.created_from_product_id IS NOT NULL
  AND k.supplier_company_id = p.created_from_company_id
  AND s.id = p.created_from_product_id
  AND s.company_id = k.supplier_company_id;

UPDATE public.shopping_list_item_suppliers s
SET is_selected = true
FROM public.shopping_list_items i
JOIN public.shopping_lists l ON l.id = i.list_id
WHERE i.id = s.item_id
  AND l.status = 'aperta'
  AND s.is_selected = false
  AND (COALESCE(s.purchase_quantity,0) > 0 OR COALESCE(s.assigned_quantity,0) > 0);

CREATE OR REPLACE FUNCTION public.guard_supplier_link_b2b_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_seller uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = NEW.product_id AND company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'Il prodotto non appartiene all''azienda del collegamento';
  END IF;

  SELECT r.seller_company_id INTO v_seller
  FROM public.supplier_customer_relations r
  WHERE r.supplier_record_id = NEW.supplier_record_id AND r.buyer_company_id = NEW.company_id
  LIMIT 1;

  IF v_seller IS NULL THEN
    IF NEW.supplier_company_id IS NOT NULL OR NEW.b2b_item_id IS NOT NULL THEN
      RAISE EXCEPTION 'Fornitore esterno: non può avere un articolo B2B';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.supplier_company_id IS NOT NULL AND NEW.supplier_company_id <> v_seller THEN
    RAISE EXCEPTION 'L''azienda fornitrice non corrisponde al rapporto B2B';
  END IF;

  IF NEW.b2b_item_id IS NOT NULL THEN
    IF NEW.supplier_company_id IS NULL THEN
      RAISE EXCEPTION 'Articolo B2B senza azienda fornitrice';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.products s
                   WHERE s.id = NEW.b2b_item_id AND s.company_id = NEW.supplier_company_id) THEN
      RAISE EXCEPTION 'L''articolo B2B non appartiene a questo fornitore';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_supplier_link_b2b_item() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER product_supplier_links_b2b_guard
  BEFORE INSERT OR UPDATE OF b2b_item_id, supplier_company_id, supplier_record_id, company_id, product_id
  ON public.product_supplier_links
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_link_b2b_item();

CREATE UNIQUE INDEX IF NOT EXISTS product_supplier_links_one_active_b2b_item
  ON public.product_supplier_links (company_id, b2b_item_id)
  WHERE b2b_item_id IS NOT NULL AND is_active;
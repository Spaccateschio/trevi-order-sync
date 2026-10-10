-- 0037 Modello 2 — struttura (card = prodotto + collegamento fornitore). NULL = «Senza fornitore».

-- B. chiave univoca supplementare sul collegamento (additiva: id già univoco)
ALTER TABLE public.product_supplier_links
  ADD CONSTRAINT product_supplier_links_id_company_product_key UNIQUE (id, company_id, product_id);

-- A. colonne + B. FK composte NO ACTION
ALTER TABLE public.inventory_counts           ADD COLUMN product_supplier_link_id uuid NULL;
ALTER TABLE public.inventory_count_entries    ADD COLUMN product_supplier_link_id uuid NULL;
ALTER TABLE public.inventory_session_products ADD COLUMN product_supplier_link_id uuid NULL;
ALTER TABLE public.inventory_movements        ADD COLUMN product_supplier_link_id uuid NULL;
ALTER TABLE public.inventory_adjustments      ADD COLUMN product_supplier_link_id uuid NULL;
ALTER TABLE public.stock_lots                 ADD COLUMN product_supplier_link_id uuid NULL;

ALTER TABLE public.inventory_counts ADD CONSTRAINT inventory_counts_link_fkey
  FOREIGN KEY (product_supplier_link_id, company_id, product_id)
  REFERENCES public.product_supplier_links (id, company_id, product_id) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE public.inventory_count_entries ADD CONSTRAINT inventory_count_entries_link_fkey
  FOREIGN KEY (product_supplier_link_id, company_id, product_id)
  REFERENCES public.product_supplier_links (id, company_id, product_id) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE public.inventory_session_products ADD CONSTRAINT inventory_session_products_link_fkey
  FOREIGN KEY (product_supplier_link_id, company_id, product_id)
  REFERENCES public.product_supplier_links (id, company_id, product_id) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_link_fkey
  FOREIGN KEY (product_supplier_link_id, company_id, product_id)
  REFERENCES public.product_supplier_links (id, company_id, product_id) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE public.inventory_adjustments ADD CONSTRAINT inventory_adjustments_link_fkey
  FOREIGN KEY (product_supplier_link_id, company_id, product_id)
  REFERENCES public.product_supplier_links (id, company_id, product_id) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE public.stock_lots ADD CONSTRAINT stock_lots_link_fkey
  FOREIGN KEY (product_supplier_link_id, company_id, product_id)
  REFERENCES public.product_supplier_links (id, company_id, product_id) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- C. unicità per card: prima i nuovi vincoli, poi via i vecchi indici
ALTER TABLE public.inventory_counts ADD CONSTRAINT inventory_counts_card_key
  UNIQUE NULLS NOT DISTINCT (session_id, product_id, location_id, product_supplier_link_id);
ALTER TABLE public.inventory_session_products ADD CONSTRAINT inventory_session_products_card_key
  UNIQUE NULLS NOT DISTINCT (session_id, product_id, location_id, product_supplier_link_id);
DROP INDEX public.inventory_counts_unique_key;
DROP INDEX public.inventory_session_products_key;

-- D. indici per card
CREATE INDEX inventory_counts_card_idx      ON public.inventory_counts      (product_id, location_id, product_supplier_link_id);
CREATE INDEX inventory_movements_card_idx   ON public.inventory_movements   (product_id, location_id, product_supplier_link_id);
CREATE INDEX inventory_adjustments_card_idx ON public.inventory_adjustments (product_id, location_id, product_supplier_link_id);
CREATE INDEX stock_lots_card_idx            ON public.stock_lots            (product_id, location_id, product_supplier_link_id);

-- F. preferiti delle card
CREATE TABLE public.company_product_supplier_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_supplier_link_id uuid NOT NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cpsf_company_link_key UNIQUE (company_id, product_supplier_link_id),
  CONSTRAINT cpsf_link_fkey FOREIGN KEY (product_supplier_link_id, company_id, product_id)
    REFERENCES public.product_supplier_links (id, company_id, product_id) ON DELETE NO ACTION ON UPDATE NO ACTION
);
GRANT SELECT ON public.company_product_supplier_favorites TO authenticated;
GRANT ALL ON public.company_product_supplier_favorites TO service_role;
ALTER TABLE public.company_product_supplier_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY cpsf_select ON public.company_product_supplier_favorites
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

-- Stella della singola card: stesso permesso della stella prodotto attuale (is_company_admin)
CREATE OR REPLACE FUNCTION public.manage_card_favorite(_company_id uuid, _link_id uuid, _favorite boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _product uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;
  SELECT product_id INTO _product FROM public.product_supplier_links
   WHERE id = _link_id AND company_id = _company_id;
  IF _product IS NULL THEN RAISE EXCEPTION 'Collegamento fornitore non valido per questa azienda'; END IF;
  IF _favorite THEN
    INSERT INTO public.company_product_supplier_favorites (company_id, product_id, product_supplier_link_id, created_by)
    VALUES (_company_id, _product, _link_id, auth.uid())
    ON CONFLICT (company_id, product_supplier_link_id) DO NOTHING;
  ELSE
    DELETE FROM public.company_product_supplier_favorites
     WHERE company_id = _company_id AND product_supplier_link_id = _link_id;
  END IF;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, auth.uid(), CASE WHEN _favorite THEN 'card_favorite_add' ELSE 'card_favorite_remove' END,
          'product_supplier_link', _link_id, jsonb_build_object('product_id', _product));
  RETURN _favorite;
END $$;
REVOKE ALL ON FUNCTION public.manage_card_favorite(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_card_favorite(uuid, uuid, boolean) TO authenticated, service_role;

-- G. bozze di conteggio per card (approvato 10/10/2026): prima il nuovo vincolo, poi via il vecchio
ALTER TABLE public.inventory_count_drafts ADD COLUMN product_supplier_link_id uuid NULL;
ALTER TABLE public.inventory_count_drafts ADD CONSTRAINT inventory_count_drafts_link_fkey
  FOREIGN KEY (product_supplier_link_id, company_id, product_id)
  REFERENCES public.product_supplier_links (id, company_id, product_id) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE public.inventory_count_drafts ADD CONSTRAINT inventory_count_drafts_card_key
  UNIQUE NULLS NOT DISTINCT (session_id, product_id, location_id, product_supplier_link_id);
ALTER TABLE public.inventory_count_drafts DROP CONSTRAINT inventory_count_drafts_session_id_product_id_location_id_key;

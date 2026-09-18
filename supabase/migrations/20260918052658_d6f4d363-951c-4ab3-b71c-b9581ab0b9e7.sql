-- 1. Flag vetrina B2B sui prodotti (mai incluso negli upsert di import)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS b2b_visible boolean NOT NULL DEFAULT true;

-- 2. Listino assegnato al cliente d'anagrafica (preparazione minima punto 5c)
ALTER TABLE public.customer_records
  ADD COLUMN IF NOT EXISTS assigned_price_list_number smallint;

-- 3. Preferiti dell'acquirente
CREATE TABLE public.buyer_product_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_company_id uuid NOT NULL REFERENCES public.companies(id),
  seller_company_id uuid NOT NULL REFERENCES public.companies(id),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (buyer_company_id, product_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.buyer_product_favorites TO authenticated;
GRANT ALL ON public.buyer_product_favorites TO service_role;

ALTER TABLE public.buyer_product_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "favorites_select_own_company"
  ON public.buyer_product_favorites FOR SELECT TO authenticated
  USING (public.is_company_member(buyer_company_id));

CREATE POLICY "favorites_insert_operational"
  ON public.buyer_product_favorites FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_member(buyer_company_id)
    AND public.relation_is_operational(seller_company_id, buyer_company_id)
  );

CREATE POLICY "favorites_delete_own_company"
  ON public.buyer_product_favorites FOR DELETE TO authenticated
  USING (public.is_company_member(buyer_company_id));

CREATE INDEX buyer_product_favorites_buyer_seller_idx
  ON public.buyer_product_favorites (buyer_company_id, seller_company_id);

-- 4. Helper: l'utente ha un collegamento operativo verso questo fornitore?
CREATE OR REPLACE FUNCTION public.can_view_seller_catalogue(_seller_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.supplier_customer_relations r
    JOIN public.company_members m ON m.company_id = r.buyer_company_id
    WHERE r.seller_company_id = _seller_company_id
      AND r.status = 'attivo'
      AND r.seller_enabled
      AND r.buyer_enabled
      AND m.user_id = auth.uid()
      AND m.status = 'attivo'
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_seller_catalogue(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_view_seller_catalogue(uuid) TO authenticated;

-- 5. Lettura catalogo lato acquirente
CREATE POLICY "products_select_catalogue_buyer"
  ON public.products FOR SELECT TO authenticated
  USING (
    publish_status = 'pubblicato'
    AND b2b_visible
    AND public.can_view_seller_catalogue(company_id)
  );

CREATE POLICY "product_images_select_catalogue_buyer"
  ON public.product_images FOR SELECT TO authenticated
  USING (
    public.can_view_seller_catalogue(company_id)
    AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_images.product_id
        AND p.publish_status = 'pubblicato'
        AND p.b2b_visible
    )
  );

CREATE POLICY "product_sale_units_select_catalogue_buyer"
  ON public.product_sale_units FOR SELECT TO authenticated
  USING (
    is_active
    AND is_customer_visible
    AND public.can_view_seller_catalogue(company_id)
    AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_sale_units.product_id
        AND p.publish_status = 'pubblicato'
        AND p.b2b_visible
    )
  );

CREATE POLICY "units_of_measure_select_catalogue_buyer"
  ON public.units_of_measure FOR SELECT TO authenticated
  USING (status = 'attivo' AND public.can_view_seller_catalogue(company_id));

-- 6. Prezzi: solo listino assegnato tramite cliente d'anagrafica collegato
CREATE OR REPLACE FUNCTION public.buyer_catalog_prices(
  _seller_company_id uuid,
  _product_ids uuid[]
)
RETURNS TABLE(product_id uuid, list_number smallint, net_price numeric, gross_price numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH assignment AS (
    SELECT cr.assigned_price_list_number AS list_number
    FROM public.supplier_customer_relations r
    JOIN public.company_members m
      ON m.company_id = r.buyer_company_id
     AND m.user_id = auth.uid()
     AND m.status = 'attivo'
    JOIN public.customer_records cr
      ON cr.id = r.customer_record_id
     AND cr.seller_company_id = r.seller_company_id
    WHERE r.seller_company_id = _seller_company_id
      AND r.status = 'attivo'
      AND r.seller_enabled
      AND r.buyer_enabled
      AND cr.assigned_price_list_number IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.danea_price_lists l
        WHERE l.company_id = _seller_company_id
          AND l.list_number = cr.assigned_price_list_number
          AND l.is_active
      )
    LIMIT 1
  )
  SELECT pp.product_id, pp.list_number, pp.net_price, pp.gross_price
  FROM public.product_prices pp
  JOIN assignment a ON a.list_number = pp.list_number
  JOIN public.products p
    ON p.id = pp.product_id
   AND p.publish_status = 'pubblicato'
   AND p.b2b_visible
  WHERE pp.company_id = _seller_company_id
    AND pp.product_id = ANY(_product_ids);
$$;

REVOKE ALL ON FUNCTION public.buyer_catalog_prices(uuid, uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.buyer_catalog_prices(uuid, uuid[]) TO authenticated;

-- 7. Interruttore vetrina lato venditore (products resta in sola scrittura Danea)
CREATE OR REPLACE FUNCTION public.set_product_b2b_visibility(
  _company_id uuid,
  _product_ids uuid[],
  _visible boolean,
  _actor_user_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated integer;
BEGIN
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Permesso negato';
  END IF;

  UPDATE public.products
     SET b2b_visible = _visible,
         updated_at = now()
   WHERE company_id = _company_id
     AND id = ANY(_product_ids);

  GET DIAGNOSTICS _updated = ROW_COUNT;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (
    _company_id,
    COALESCE(_actor_user_id, auth.uid()),
    CASE WHEN _visible THEN 'product.b2b_visible.on' ELSE 'product.b2b_visible.off' END,
    'product',
    NULL,
    jsonb_build_object('product_ids', to_jsonb(_product_ids), 'updated', _updated)
  );

  RETURN _updated;
END;
$$;

REVOKE ALL ON FUNCTION public.set_product_b2b_visibility(uuid, uuid[], boolean, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_product_b2b_visibility(uuid, uuid[], boolean, uuid) TO authenticated;
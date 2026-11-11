-- Visibilità del catalogo limitata all'archivio Danea dell'anagrafica cliente.
-- NULL = nessun filtro (anagrafica senza archivio o nessuna anagrafica collegata).
CREATE OR REPLACE FUNCTION public.buyer_visible_archive(_seller_company_id uuid, _buyer_company_id uuid DEFAULT NULL)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH recs AS (
    SELECT cr.archive_id
    FROM public.supplier_customer_relations r
    LEFT JOIN public.customer_records cr
      ON cr.id = r.customer_record_id AND cr.seller_company_id = r.seller_company_id
    WHERE r.seller_company_id = _seller_company_id
      AND (
        (_buyer_company_id IS NOT NULL AND r.buyer_company_id = _buyer_company_id)
        OR (_buyer_company_id IS NULL
            AND r.status = 'attivo' AND r.seller_enabled AND r.buyer_enabled
            AND EXISTS (SELECT 1 FROM public.company_members m
                        WHERE m.company_id = r.buyer_company_id
                          AND m.user_id = auth.uid() AND m.status = 'attivo'))
      )
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM recs) THEN NULL
    WHEN EXISTS (SELECT 1 FROM recs WHERE archive_id IS NULL) THEN NULL
    WHEN (SELECT count(DISTINCT archive_id) FROM recs) = 1 THEN (SELECT min(archive_id::text)::uuid FROM recs)
    ELSE NULL
  END;
$function$;
REVOKE ALL ON FUNCTION public.buyer_visible_archive(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buyer_visible_archive(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS products_select_catalogue_buyer ON public.products;
CREATE POLICY products_select_catalogue_buyer ON public.products
  FOR SELECT TO authenticated
  USING (
    publish_status = 'pubblicato'::product_publish_status
    AND b2b_visible
    AND public.can_view_seller_catalogue(company_id)
    AND (public.buyer_visible_archive(company_id) IS NULL
         OR archive_id = public.buyer_visible_archive(company_id))
  );

CREATE OR REPLACE FUNCTION public.b2b_item_purchasable(_seller_company_id uuid, _buyer_company_id uuid, _product_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.relation_is_operational(_seller_company_id, _buyer_company_id)
     AND EXISTS (SELECT 1 FROM public.products p
                  WHERE p.id = _product_id AND p.company_id = _seller_company_id
                    AND p.publish_status = 'pubblicato' AND p.b2b_visible
                    AND (public.buyer_visible_archive(_seller_company_id, _buyer_company_id) IS NULL
                         OR p.archive_id = public.buyer_visible_archive(_seller_company_id, _buyer_company_id)));
$function$;

CREATE OR REPLACE FUNCTION public.buyer_catalog_prices(_seller_company_id uuid, _product_ids uuid[])
 RETURNS TABLE(product_id uuid, list_number smallint, net_price numeric, gross_price numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          AND (cr.archive_id IS NULL OR l.archive_id = cr.archive_id)
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
   AND (public.buyer_visible_archive(_seller_company_id) IS NULL
        OR p.archive_id = public.buyer_visible_archive(_seller_company_id))
  WHERE pp.company_id = _seller_company_id
    AND pp.product_id = ANY(_product_ids);
$function$;

CREATE OR REPLACE FUNCTION public.buyer_unpublished_favorites(_buyer_company_id uuid)
 RETURNS TABLE(row_kind text, motivo text, seller_company_id uuid, seller_name text, favorite_id uuid, product_id uuid, code text, description text, also_paused boolean, favorites_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _buyer_company_id IS NULL OR NOT public.is_company_member(_buyer_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;

  RETURN QUERY
  WITH rel AS (
    SELECT r.seller_company_id AS seller_id,
           COALESCE(bool_or(r.status = 'attivo' AND r.seller_enabled = true AND r.buyer_enabled = true), false) AS operativo,
           COALESCE(bool_or(r.status = 'sospeso'
                    OR (r.status = 'attivo' AND (r.seller_enabled IS DISTINCT FROM true OR r.buyer_enabled IS DISTINCT FROM true))), false) AS pausa,
           COALESCE(bool_or(r.status IN ('in_attesa','rifiutato')), false) AS non_attivo
    FROM public.supplier_customer_relations r
    WHERE r.buyer_company_id = _buyer_company_id
    GROUP BY r.seller_company_id
  ),
  base AS (
    SELECT f.id AS fav_id, p.id AS prod_id, f.seller_company_id AS sel_id, c.legal_name AS sel_name,
           p.code AS p_code, p.description AS p_desc,
           COALESCE(p.publish_status = 'pubblicato' AND p.b2b_visible = true, false) AS visibile,
           COALESCE(rel.operativo, false) AS operativo,
           COALESCE(rel.pausa, false) AND NOT COALESCE(rel.operativo, false) AS pausa,
           (rel.seller_id IS NULL OR COALESCE(rel.non_attivo, false))
             AND NOT COALESCE(rel.operativo, false) AND NOT COALESCE(rel.pausa, false) AS non_attivo
    FROM public.buyer_product_favorites f
    JOIN public.products p ON p.id = f.product_id AND p.company_id = f.seller_company_id
    JOIN public.companies c ON c.id = f.seller_company_id
    LEFT JOIN rel ON rel.seller_id = f.seller_company_id
    WHERE f.buyer_company_id = _buyer_company_id
      AND (public.buyer_visible_archive(f.seller_company_id, _buyer_company_id) IS NULL
           OR p.archive_id = public.buyer_visible_archive(f.seller_company_id, _buyer_company_id))
  ),
  classed AS (
    SELECT b.*,
           CASE
             WHEN NOT b.operativo AND NOT b.pausa AND NOT b.non_attivo THEN 'rapporto_cessato'
             WHEN b.non_attivo                                         THEN 'rapporto_non_attivo'
             WHEN NOT b.visibile                                       THEN 'non_pubblicato'
             WHEN b.pausa                                              THEN 'fornitore_in_pausa'
             ELSE NULL
           END AS mot
    FROM base b
  )
  SELECT 'articolo', k.mot, k.sel_id, k.sel_name, k.fav_id, k.prod_id, k.p_code, k.p_desc,
         (k.mot = 'non_pubblicato' AND k.pausa), NULL::integer
  FROM classed k WHERE k.mot IN ('non_pubblicato','fornitore_in_pausa')
  UNION ALL
  SELECT 'fornitore', k.mot, k.sel_id, k.sel_name, NULL, NULL, NULL, NULL, NULL, count(*)::integer
  FROM classed k WHERE k.mot IN ('rapporto_cessato','rapporto_non_attivo')
  GROUP BY k.mot, k.sel_id, k.sel_name
  ORDER BY 1, 2, 4, 7;
END;
$function$;
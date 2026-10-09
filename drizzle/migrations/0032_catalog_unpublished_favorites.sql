CREATE OR REPLACE FUNCTION public.buyer_unpublished_favorites(_buyer_company_id uuid)
RETURNS TABLE (
  row_kind text, motivo text, seller_company_id uuid, seller_name text,
  favorite_id uuid, product_id uuid, code text, description text,
  also_paused boolean, favorites_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.buyer_unpublished_favorites(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buyer_unpublished_favorites(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_seller_favorites(
  _buyer_company_id uuid, _seller_company_id uuid, _expected_count integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_count integer; v_deleted integer;
  v_operativo boolean := false; v_pausa boolean := false;
  v_rel record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _buyer_company_id IS NULL OR _seller_company_id IS NULL OR _expected_count IS NULL OR _expected_count < 0 THEN
    RAISE EXCEPTION 'Parametri non validi';
  END IF;
  IF NOT public.is_company_admin(_buyer_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('favorites:'||_buyer_company_id||':'||_seller_company_id, 0));

  FOR v_rel IN
    SELECT status, seller_enabled, buyer_enabled
    FROM public.supplier_customer_relations
    WHERE buyer_company_id = _buyer_company_id AND seller_company_id = _seller_company_id
    FOR SHARE
  LOOP
    v_operativo := v_operativo OR COALESCE(v_rel.status = 'attivo' AND v_rel.seller_enabled = true AND v_rel.buyer_enabled = true, false);
    v_pausa := v_pausa OR COALESCE(v_rel.status = 'sospeso'
               OR (v_rel.status = 'attivo' AND (v_rel.seller_enabled IS DISTINCT FROM true OR v_rel.buyer_enabled IS DISTINCT FROM true)), false);
  END LOOP;
  IF v_operativo OR v_pausa THEN
    RAISE EXCEPTION 'Il rapporto con questo fornitore è ancora attivo o in pausa: rimuovi i preferiti uno alla volta';
  END IF;

  SELECT count(*) INTO v_count FROM (
    SELECT 1 FROM public.buyer_product_favorites
    WHERE buyer_company_id = _buyer_company_id AND seller_company_id = _seller_company_id
    FOR UPDATE) s;

  IF v_count <> _expected_count THEN
    RETURN jsonb_build_object('status','count_changed','current_count',v_count,'deleted',0);
  END IF;
  IF v_count = 0 THEN
    RETURN jsonb_build_object('status','nothing_to_delete','current_count',0,'deleted',0);
  END IF;

  DELETE FROM public.buyer_product_favorites
  WHERE buyer_company_id = _buyer_company_id AND seller_company_id = _seller_company_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> v_count THEN
    RAISE EXCEPTION 'Numero di preferiti cambiato durante la rimozione: riprova';
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_buyer_company_id, auth.uid(), 'buyer_favorites.remove_seller', 'company', _seller_company_id,
          jsonb_build_object('seller_company_id', _seller_company_id, 'deleted', v_deleted));

  RETURN jsonb_build_object('status','deleted','current_count',0,'deleted',v_deleted);
END;
$function$;

REVOKE ALL ON FUNCTION public.remove_seller_favorites(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_seller_favorites(uuid, uuid, integer) TO authenticated;
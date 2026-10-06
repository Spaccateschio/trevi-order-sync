CREATE OR REPLACE FUNCTION public.sync_danea_product_supplier_links(_company_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_linked integer := 0;
  v_pending integer := 0;
  v_row record;
  v_supplier uuid;
BEGIN
  FOR v_row IN
    SELECT c.product_id, c.supplier_code, c.supplier_name, c.supplier_product_code, p.archive_id
    FROM public.product_supplier_costs c
    JOIN public.products p ON p.id = c.product_id
    WHERE c.company_id = _company_id
      AND (NULLIF(btrim(COALESCE(c.supplier_code, '')), '') IS NOT NULL
        OR NULLIF(btrim(COALESCE(c.supplier_name, '')), '') IS NOT NULL)
  LOOP
    v_supplier := NULL;
    IF NULLIF(btrim(COALESCE(v_row.supplier_code, '')), '') IS NOT NULL THEN
      SELECT id INTO v_supplier FROM public.supplier_records
      WHERE buyer_company_id = _company_id AND archive_id = v_row.archive_id
        AND btrim(COALESCE(internal_reference, '')) = btrim(v_row.supplier_code)
        AND status <> 'revocato'
      LIMIT 1;
    END IF;

    IF v_supplier IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.product_supplier_links
                     WHERE product_id = v_row.product_id AND supplier_record_id = v_supplier) THEN
        INSERT INTO public.product_supplier_links (company_id, product_id, supplier_record_id, supplier_product_code, origin)
        VALUES (_company_id, v_row.product_id, v_supplier, NULLIF(btrim(COALESCE(v_row.supplier_product_code, '')), ''), 'danea')
        ON CONFLICT DO NOTHING;
      END IF;

      INSERT INTO public.product_danea_supplier_matches (company_id, product_id, danea_supplier_code, danea_supplier_name, status, supplier_record_id, decided_at)
      VALUES (_company_id, v_row.product_id, v_row.supplier_code, v_row.supplier_name, 'associato', v_supplier, now())
      ON CONFLICT (product_id, COALESCE(danea_supplier_code, ''), COALESCE(danea_supplier_name, ''))
      DO UPDATE SET status = 'associato', supplier_record_id = v_supplier, decided_at = now()
      WHERE public.product_danea_supplier_matches.status <> 'ignorato';
      v_linked := v_linked + 1;
    ELSE
      INSERT INTO public.product_danea_supplier_matches (company_id, product_id, danea_supplier_code, danea_supplier_name)
      VALUES (_company_id, v_row.product_id, v_row.supplier_code, v_row.supplier_name)
      ON CONFLICT (product_id, COALESCE(danea_supplier_code, ''), COALESCE(danea_supplier_name, '')) DO NOTHING;
      v_pending := v_pending + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('linked', v_linked, 'pending', v_pending);
END;
$function$;
-- Scarico ordini Danea: Danea filtra da sé per numero (firstnum/lastnum) e ricorda
-- l'ultimo ordine importato. Variante che, su richiesta esplicita, restituisce anche
-- gli ordini già scaricati DALLA STESSA POSTAZIONE (riscarico dopo finestra chiusa
-- senza importare). Non scrive nulla.
CREATE OR REPLACE FUNCTION public.danea_orders_export_candidates(_station_id uuid, _include_exported boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.danea_stations; v jsonb;
BEGIN
  s := public._danea_order_station(_station_id);
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'sent_at'), '[]'::jsonb) INTO v FROM (
    SELECT jsonb_build_object(
      'order_id', po.id,
      'number', po.number,
      'already_exported', po.danea_exported_at IS NOT NULL,
      'sent_at', po.sent_at,
      'order_date', (po.sent_at AT TIME ZONE 'Europe/Rome')::date,
      'delivery_date', po.delivery_date,
      'delivery_time_from', po.delivery_time_from,
      'delivery_time_to', po.delivery_time_to,
      'delivery_address_text', po.delivery_address_text,
      'notes', po.notes,
      'buyer_name', bc.legal_name,
      'customer', CASE WHEN cr.id IS NULL THEN NULL ELSE jsonb_build_object(
        'code', NULLIF(trim(cr.internal_reference), ''),
        'name', cr.legal_name, 'address', cr.address_line, 'postcode', cr.postal_code,
        'city', cr.city, 'province', cr.province, 'country', cr.country,
        'fiscal_code', cr.tax_code, 'vat_code', cr.vat_number, 'email', cr.email,
        'phone', cr.phone, 'sdi_code', cr.sdi_code, 'pec', cr.pec,
        'archive_ok', cr.archive_id IS NOT DISTINCT FROM s.archive_id) END,
      'lines', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'item_id', i.id,
          'seller_code', NULLIF(trim(sp.code), ''),
          'description', COALESCE(sp.description, i.product_name),
          'quantity', COALESCE(i.purchase_quantity, i.ordered_quantity),
          'unit', COALESCE(i.purchase_unit_code, i.unit_code),
          'price', i.unit_cost,
          'price_unit', i.price_unit_code,
          'vat_code', sp.vat_code,
          'vat_perc', sp.vat_perc,
          'notes', i.notes) ORDER BY i.created_at, i.id)
        FROM public.purchase_order_items i
        LEFT JOIN public.product_supplier_links l ON l.id = i.product_supplier_link_id
        LEFT JOIN public.products sp ON sp.id = l.b2b_item_id AND sp.company_id = s.company_id
        WHERE i.order_id = po.id), '[]'::jsonb)
    ) AS x
    FROM public.purchase_orders po
    JOIN public.supplier_customer_relations r ON r.id = po.relation_id
    LEFT JOIN public.customer_records cr ON cr.id = r.customer_record_id AND cr.seller_company_id = s.company_id
    LEFT JOIN public.companies bc ON bc.id = po.company_id
    WHERE r.seller_company_id = s.company_id
      AND po.relation_id IS NOT NULL
      AND po.status NOT IN ('bozza','annullato')
      AND po.sent_at IS NOT NULL
      AND (po.danea_exported_at IS NULL
           OR (COALESCE(_include_exported, false) AND po.danea_exported_station_id = s.id))
  ) q;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.danea_orders_export_candidates(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.danea_orders_export_candidates(uuid, boolean) TO service_role;
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS danea_number integer,
  ADD COLUMN IF NOT EXISTS danea_number_seller_id uuid REFERENCES public.companies(id);

COMMENT ON COLUMN public.purchase_orders.danea_number IS 'Numero progressivo per fornitore inviato a Danea come <Number>; assegnato una sola volta, mai rinumerato.';

-- Ordini già scaricati (o rimessi in scarico) conservano il numero già usato verso Danea.
UPDATE public.purchase_orders po
   SET danea_number = NULLIF(substring(po.number from '(\d+)\s*$'), '')::integer,
       danea_number_seller_id = r.seller_company_id
  FROM public.supplier_customer_relations r
 WHERE r.id = po.relation_id
   AND po.danea_number IS NULL
   AND substring(po.number from '(\d+)\s*$') IS NOT NULL
   AND (po.danea_exported_at IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.purchase_order_changes c WHERE c.order_id = po.id AND c.field = 'danea_requeued'));

CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_danea_number_per_seller
  ON public.purchase_orders (danea_number_seller_id, danea_number)
  WHERE danea_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.danea_reserve_order_numbers(_station_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE s public.danea_stations; v_next integer; v_count integer := 0; o record;
BEGIN
  s := public._danea_order_station(_station_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('danea_order_number:' || s.company_id::text, 0));
  SELECT COALESCE(max(danea_number), 0) INTO v_next
    FROM public.purchase_orders WHERE danea_number_seller_id = s.company_id;
  FOR o IN
    SELECT po.id FROM public.purchase_orders po
      JOIN public.supplier_customer_relations r ON r.id = po.relation_id
     WHERE r.seller_company_id = s.company_id
       AND po.status NOT IN ('bozza','annullato')
       AND po.sent_at IS NOT NULL
       AND po.danea_exported_at IS NULL
       AND po.danea_number IS NULL
     ORDER BY po.sent_at, po.id
     FOR UPDATE OF po
  LOOP
    v_next := v_next + 1;
    UPDATE public.purchase_orders SET danea_number = v_next, danea_number_seller_id = s.company_id WHERE id = o.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.danea_reserve_order_numbers(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.danea_reserve_order_numbers(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.danea_orders_export_candidates(_station_id uuid, _include_exported boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s public.danea_stations; v jsonb;
BEGIN
  s := public._danea_order_station(_station_id);
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'sent_at'), '[]'::jsonb) INTO v FROM (
    SELECT jsonb_build_object(
      'order_id', po.id,
      'number', po.number,
      'danea_number', CASE WHEN po.danea_number_seller_id = s.company_id THEN po.danea_number END,
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
END $function$;
CREATE OR REPLACE FUNCTION public.delivery_comparison(_delivery_id uuid)
 RETURNS TABLE(delivery_item_id uuid, order_item_id uuid, product_id uuid, code text, description text, line_type text, ordered numeric, previously_declared numeric, declared numeric, difference numeric, unit_code text, declared_weight numeric, declared_producer text, declared_producer_lot text, declared_expiry date, line_notes text, missing_reason text, status text, accepted_quantity numeric, outcome text, dispute_id uuid, dispute_reason text, dispute_status text, dispute_notes text,
   ordered_purchase_quantity numeric, previously_declared_purchase numeric, declared_purchase_quantity numeric, accepted_purchase_quantity numeric, purchase_unit_code text, comparison_basis text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  WITH base AS (
    SELECT di.*, d.order_id AS d_order_id, d.id AS d_id,
           oi.id AS oi_id, oi.ordered_quantity AS oi_ordered, oi.purchase_quantity AS oi_purchase,
           oi.purchase_unit_code AS oi_purchase_code, oi.unit_code AS oi_unit_code,
           p.code AS p_code, p.description AS p_description,
           CASE
             WHEN di.line_type <> 'ordinata' OR oi.id IS NULL THEN 'magazzino'
             WHEN oi.ordered_quantity IS NULL THEN
               CASE WHEN oi.purchase_quantity IS NULL OR di.declared_purchase_quantity IS NULL
                    THEN 'da_verificare' ELSE 'acquisto' END
             WHEN oi.purchase_quantity IS NOT NULL AND di.declared_purchase_quantity IS NOT NULL
                  AND lower(coalesce(oi.purchase_unit_code, '')) <> lower(coalesce(oi.unit_code, ''))
               THEN 'acquisto'
             ELSE 'magazzino'
           END AS basis
      FROM public.purchase_delivery_items di
      JOIN public.purchase_deliveries d ON d.id = di.delivery_id
      JOIN public.products p ON p.id = di.product_id
      LEFT JOIN public.purchase_order_items oi ON oi.id = di.order_item_id
     WHERE di.delivery_id = _delivery_id
       AND public.can_declare_on_order(d.order_id)
  )
  SELECT b.id, b.order_item_id, b.product_id, b.p_code, b.p_description,
         b.line_type::text,
         CASE WHEN b.oi_id IS NULL THEN 0 ELSE b.oi_ordered END,
         CASE WHEN b.oi_id IS NOT NULL AND b.oi_ordered IS NULL THEN NULL ELSE
         COALESCE((SELECT sum(x.declared_quantity) FROM public.purchase_delivery_items x
                    JOIN public.purchase_deliveries xd ON xd.id = x.delivery_id
                   WHERE x.order_item_id = b.order_item_id AND b.order_item_id IS NOT NULL
                     AND xd.order_id = b.d_order_id AND xd.status <> 'bozza' AND xd.id <> b.d_id), 0) END,
         b.declared_quantity,
         b.declared_quantity - CASE WHEN b.oi_id IS NULL THEN 0 ELSE b.oi_ordered END,
         b.unit_code, b.declared_weight, b.declared_producer,
         b.declared_producer_lot, b.declared_expiry, b.line_notes, b.missing_reason,
         b.status::text, b.accepted_quantity,
         CASE
           WHEN b.line_type = 'aggiunta_fornitore' THEN 'aggiunta_fornitore'
           WHEN b.line_type = 'sostituzione' THEN 'sostituzione'
           WHEN b.basis = 'da_verificare' THEN 'da_verificare'
           WHEN b.basis = 'acquisto' THEN
             CASE
               WHEN b.declared_purchase_quantity = 0 THEN 'non_consegnata'
               WHEN b.declared_purchase_quantity < b.oi_purchase THEN 'inferiore'
               WHEN b.declared_purchase_quantity > b.oi_purchase THEN 'superiore'
               ELSE 'corretta'
             END
           WHEN b.declared_quantity = 0 THEN 'non_consegnata'
           WHEN b.declared_quantity < COALESCE(b.oi_ordered, 0) THEN 'inferiore'
           WHEN b.declared_quantity > COALESCE(b.oi_ordered, 0) THEN 'superiore'
           ELSE 'corretta'
         END,
         dd.id, dd.reason::text, dd.status::text, dd.notes,
         b.oi_purchase,
         CASE WHEN b.oi_purchase IS NULL THEN NULL ELSE
         COALESCE((SELECT sum(x.declared_purchase_quantity) FROM public.purchase_delivery_items x
                    JOIN public.purchase_deliveries xd ON xd.id = x.delivery_id
                   WHERE x.order_item_id = b.order_item_id
                     AND xd.order_id = b.d_order_id AND xd.status <> 'bozza' AND xd.id <> b.d_id), 0) END,
         b.declared_purchase_quantity, b.accepted_purchase_quantity,
         COALESCE(b.purchase_unit_code, b.oi_purchase_code),
         b.basis
    FROM base b
    LEFT JOIN LATERAL (
      SELECT x.* FROM public.purchase_delivery_disputes x
       WHERE x.delivery_item_id = b.id ORDER BY x.opened_at DESC LIMIT 1
    ) dd ON true
   ORDER BY b.p_code;
$function$;
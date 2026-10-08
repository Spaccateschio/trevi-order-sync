CREATE OR REPLACE FUNCTION public.shopping_list_item_state(_item_id uuid)
 RETURNS TABLE(assigned numeric, remaining numeric, status text, untranslatable integer, under_minimum integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH item AS (
    SELECT i.id, i.decided_quantity,
           (i.decided_unit_id IS NOT NULL OR i.decided_unit_code IS NOT NULL) AS other_unit,
           CASE WHEN i.decided_unit_id IS NOT NULL OR i.decided_unit_code IS NOT NULL THEN i.decided_unit_id ELSE i.unit_id END AS ru_id,
           upper(btrim(COALESCE(CASE WHEN i.decided_unit_id IS NOT NULL OR i.decided_unit_code IS NOT NULL
                 THEN COALESCE(i.decided_unit_code, (SELECT u.code FROM public.units_of_measure u WHERE u.id = i.decided_unit_id))
                 ELSE i.unit_code END, ''))) AS ru_code,
           i.manual_purchase_quantity AS dq, i.manual_purchase_unit_id AS du_id,
           upper(btrim(COALESCE(i.manual_purchase_unit_code, ''))) AS du_code
      FROM public.shopping_list_items i WHERE i.id = _item_id
  ), asg AS (
    SELECT CASE WHEN NOT item.other_unit AND a.assigned_quantity IS NOT NULL THEN a.assigned_quantity
                ELSE a.purchase_quantity END AS amount,
           ((NOT item.other_unit AND a.assigned_quantity IS NOT NULL)
            OR (a.purchase_quantity > 0 AND (
                  (item.ru_id IS NOT NULL AND a.purchase_unit_id = item.ru_id)
                  OR (a.purchase_unit_id IS NULL AND item.ru_code <> '' AND upper(btrim(COALESCE(a.purchase_unit_code,''))) = item.ru_code)))) AS comparable,
           a.assigned_quantity, l.min_quantity, a.min_warning_accepted
      FROM public.shopping_list_item_suppliers a
      JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
      CROSS JOIN item
     WHERE a.item_id = _item_id
  ), agg AS (
    SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE NOT comparable) AS n_bad,
           COALESCE(sum(amount) FILTER (WHERE comparable), 0) AS s,
           COALESCE(sum(assigned_quantity), 0) AS assigned_eq,
           COUNT(*) FILTER (WHERE assigned_quantity IS NULL)::int AS untranslatable,
           COUNT(*) FILTER (WHERE min_quantity IS NOT NULL AND assigned_quantity IS NOT NULL
                              AND assigned_quantity < min_quantity AND NOT min_warning_accepted)::int AS under_minimum
      FROM asg
  ), d AS (
    SELECT item.*,
           (item.dq IS NULL OR (item.du_id IS NOT NULL AND item.du_id = item.ru_id)
             OR (item.du_id IS NULL AND item.du_code <> '' AND item.du_code = item.ru_code)) AS d_ok
      FROM item
  ), t AS (
    SELECT d.*, agg.*, agg.s + COALESCE(d.dq, 0) AS total,
           (agg.n_bad = 0 AND d.d_ok AND d.decided_quantity IS NOT NULL AND (d.ru_id IS NOT NULL OR d.ru_code <> '')) AS all_ok,
           (agg.n + CASE WHEN d.dq IS NOT NULL THEN 1 ELSE 0 END) AS quotes
      FROM d CROSS JOIN agg
  )
  SELECT t.assigned_eq + CASE WHEN NOT t.other_unit AND t.d_ok THEN COALESCE(t.dq, 0) ELSE 0 END,
         CASE WHEN t.all_ok THEN t.decided_quantity - t.total END,
         CASE
           WHEN t.decided_quantity IS NOT NULL AND t.ru_id IS NULL AND t.ru_code = '' THEN 'da_verificare'
           WHEN t.quotes = 0 THEN 'da_assegnare'
           WHEN NOT t.all_ok THEN 'da_verificare'
           WHEN t.total > t.decided_quantity THEN 'da_verificare'
           WHEN t.total < t.decided_quantity THEN 'parziale'
           ELSE 'assegnata'
         END,
         t.untranslatable, t.under_minimum
    FROM t;
$function$;
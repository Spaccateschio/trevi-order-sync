CREATE OR REPLACE FUNCTION public.inventory_location_stock(_product_id uuid, _location_id uuid)
 RETURNS TABLE(has_count boolean, quantity numeric, counted_at timestamp with time zone, counted_by uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH authorized AS (
    SELECT p.company_id
    FROM public.products p
    WHERE p.id = _product_id
      AND public.is_company_member(p.company_id)
      AND (
        _location_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.inventory_locations l
          WHERE l.id = _location_id
            AND l.company_id = p.company_id
        )
      )
  ), valid AS (
    SELECT c.id, c.session_id, c.counted_quantity, c.counted_at, c.counted_by
    FROM public.inventory_counts c
    JOIN public.inventory_sessions s ON s.id = c.session_id
    JOIN public.products p ON p.id = c.product_id
    LEFT JOIN public.units_of_measure su ON su.id = p.stock_unit_id
    WHERE c.product_id = _product_id
      AND c.location_id = _location_id
      AND EXISTS (SELECT 1 FROM authorized)
      AND s.status = 'completata'
      AND p.stock_unit_id IS NOT NULL
      AND su.code IS NOT NULL
      AND NULLIF(btrim(COALESCE(c.unit_code, '')), '') IS NOT NULL
      AND lower(btrim(c.unit_code)) = lower(btrim(su.code))
      AND (p.stock_base_at IS NULL OR c.counted_at >= p.stock_base_at)
  ), last_count AS (
    SELECT v.session_id, v.counted_quantity, v.counted_at, v.counted_by
    FROM valid v ORDER BY v.counted_at DESC, v.id DESC LIMIT 1
  )
  SELECT
    EXISTS (SELECT 1 FROM last_count),
    CASE WHEN EXISTS (SELECT 1 FROM last_count)
      THEN (SELECT sum(v.counted_quantity) FROM valid v WHERE v.session_id = (SELECT session_id FROM last_count))
           + COALESCE((
               SELECT sum(a.quantity) FROM public.inventory_adjustments a
               WHERE a.product_id = _product_id AND a.location_id = _location_id
                 AND a.created_at >= (SELECT counted_at FROM last_count)
             ), 0)
           + COALESCE((
               SELECT sum(m.quantity) FROM public.inventory_movements m
               WHERE m.product_id = _product_id AND m.location_id = _location_id
                 AND m.created_at >= (SELECT counted_at FROM last_count)
             ), 0)
      ELSE NULL
    END,
    (SELECT counted_at FROM last_count),
    (SELECT counted_by FROM last_count)
  WHERE EXISTS (SELECT 1 FROM authorized);
$function$;
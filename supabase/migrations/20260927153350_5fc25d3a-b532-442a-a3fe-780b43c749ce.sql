CREATE OR REPLACE FUNCTION public.inventory_location_stock(_product_id uuid, _location_id uuid)
 RETURNS TABLE(has_count boolean, quantity numeric, counted_at timestamp with time zone, counted_by uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH last_count AS (
    SELECT c.counted_quantity, c.counted_at, c.counted_by
    FROM public.inventory_counts c
    JOIN public.inventory_sessions s ON s.id = c.session_id
    JOIN public.products p ON p.id = c.product_id
    WHERE c.product_id = _product_id
      AND c.location_id = _location_id
      AND s.status = 'completata'
      AND (coalesce(trim(c.unit_code), '') = ''
           OR coalesce(trim(p.danea_um), '') = ''
           OR lower(trim(c.unit_code)) = lower(trim(p.danea_um)))
    ORDER BY c.counted_at DESC, c.id DESC
    LIMIT 1
  )
  SELECT
    EXISTS (SELECT 1 FROM last_count),
    CASE WHEN EXISTS (SELECT 1 FROM last_count)
      THEN (SELECT counted_quantity FROM last_count)
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
      ELSE COALESCE((
             SELECT sum(m.quantity) FROM public.inventory_movements m
             WHERE m.product_id = _product_id AND m.location_id = _location_id
           ), 0)
    END,
    (SELECT counted_at FROM last_count),
    (SELECT counted_by FROM last_count);
$function$;

REVOKE EXECUTE ON FUNCTION public.inventory_location_stock(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_location_stock(uuid, uuid) TO service_role;
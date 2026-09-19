ALTER TABLE public.inventory_counts ALTER COLUMN counted_at SET DEFAULT clock_timestamp();
ALTER TABLE public.inventory_counts ALTER COLUMN created_at SET DEFAULT clock_timestamp();
ALTER TABLE public.inventory_adjustments ALTER COLUMN created_at SET DEFAULT clock_timestamp();

CREATE OR REPLACE FUNCTION public.record_inventory_count(
  _company_id uuid,
  _session_id uuid,
  _product_id uuid,
  _location_id uuid,
  _counted_quantity numeric,
  _unit_id uuid DEFAULT NULL,
  _unit_code text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_previous numeric;
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  IF _counted_quantity IS NULL OR _counted_quantity < 0 THEN
    RAISE EXCEPTION 'Quantità contata non valida';
  END IF;

  SELECT quantity INTO v_previous FROM public.inventory_location_stock(_product_id, _location_id);

  INSERT INTO public.inventory_counts (
    company_id, session_id, product_id, location_id, counted_quantity, unit_id, unit_code,
    previous_quantity, counted_at, counted_by, notes
  )
  VALUES (_company_id, _session_id, _product_id, _location_id, _counted_quantity, _unit_id, _unit_code,
          COALESCE(v_previous, 0), clock_timestamp(), _actor_user_id, _notes)
  ON CONFLICT (session_id, product_id, location_id) DO UPDATE SET
    counted_quantity = EXCLUDED.counted_quantity,
    unit_id = EXCLUDED.unit_id,
    unit_code = EXCLUDED.unit_code,
    counted_at = clock_timestamp(),
    counted_by = EXCLUDED.counted_by,
    notes = EXCLUDED.notes
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_inventory_count(uuid, uuid, uuid, uuid, numeric, uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_inventory_count(uuid, uuid, uuid, uuid, numeric, uuid, text, text, uuid) TO authenticated;
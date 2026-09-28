DROP FUNCTION IF EXISTS public.record_inventory_adjustment(uuid, uuid, uuid, numeric, text, text, uuid);

CREATE OR REPLACE FUNCTION public.record_inventory_adjustment(
  _company_id uuid, _product_id uuid, _location_id uuid, _quantity numeric, _reason text,
  _notes text DEFAULT NULL, _actor_user_id uuid DEFAULT NULL, _reference_count_id uuid DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_cycle jsonb;
  v_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;
  IF _quantity IS NULL OR _quantity = 0 THEN
    RAISE EXCEPTION 'La rettifica deve avere una quantità diversa da zero';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) = 0 THEN
    RAISE EXCEPTION 'Il motivo della rettifica è obbligatorio';
  END IF;

  IF _reference_count_id IS NOT NULL THEN
    v_cycle := public.inventory_purchase_cycle_status(_company_id);
    IF coalesce(v_cycle->>'color', '') <> 'rosso' THEN
      RAISE EXCEPTION 'Correggi conteggio è disponibile solo con ciclo acquisti in corso';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.inventory_counts c
      JOIN public.inventory_sessions s ON s.id = c.session_id
      JOIN public.products p ON p.id = c.product_id
      WHERE c.id = _reference_count_id
        AND c.company_id = _company_id
        AND c.product_id = _product_id
        AND c.location_id = _location_id
        AND s.status = 'completata'
        AND s.id::text = v_cycle->>'session_id'
        AND (c.unit_code IS NULL OR p.danea_um IS NULL
             OR lower(btrim(c.unit_code)) = lower(btrim(p.danea_um)))
    ) INTO v_ok;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Conteggio di riferimento non valido per questa correzione';
    END IF;
  END IF;

  INSERT INTO public.inventory_adjustments (company_id, product_id, location_id, quantity, reason, notes, created_by, reference_count_id)
  VALUES (_company_id, _product_id, _location_id, _quantity, btrim(_reason), _notes, _actor_user_id, _reference_count_id)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, _actor_user_id, 'inventory_adjustment', 'product', _product_id,
          jsonb_build_object('location_id', _location_id, 'quantity', _quantity, 'reason', btrim(_reason),
                             'reference_count_id', _reference_count_id));
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_inventory_adjustment(uuid, uuid, uuid, numeric, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_inventory_adjustment(uuid, uuid, uuid, numeric, text, text, uuid, uuid) TO authenticated, service_role;
ALTER TABLE public.shopping_list_items
  ADD COLUMN IF NOT EXISTS decided_unit_id uuid REFERENCES public.units_of_measure(id),
  ADD COLUMN IF NOT EXISTS decided_unit_code text;

DROP FUNCTION IF EXISTS public.set_shopping_list_item_quantity(uuid, uuid, numeric, text, text, uuid);

CREATE OR REPLACE FUNCTION public.set_shopping_list_item_quantity(
  _company_id uuid, _item_id uuid, _decided_quantity numeric,
  _reason text DEFAULT NULL, _notes text DEFAULT NULL, _actor_user_id uuid DEFAULT NULL,
  _decided_unit_id uuid DEFAULT NULL, _decided_unit_code text DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item record;
  v_code text := NULLIF(upper(btrim(regexp_replace(COALESCE(_decided_unit_code, ''), '\s+', ' ', 'g'))), '');
  v_unit_code text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_member(_company_id) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _decided_quantity IS NOT NULL AND _decided_quantity <= 0 THEN RAISE EXCEPTION 'Quantità non valida'; END IF;

  SELECT id, product_id, unit_id, quantity_locked_at INTO v_item
    FROM public.shopping_list_items WHERE id = _item_id AND company_id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Riga non trovata'; END IF;
  IF v_item.quantity_locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Quantità confermata: sbloccala per modificarla';
  END IF;

  -- U.M. del prodotto (o nessuna scelta) = comportamento precedente: entrambe NULL
  IF _decided_unit_id IS NOT NULL AND _decided_unit_id IS NOT DISTINCT FROM v_item.unit_id THEN
    _decided_unit_id := NULL; v_code := NULL;
  END IF;

  IF _decided_unit_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.product_supplier_link_units u
        JOIN public.product_supplier_links l ON l.id = u.link_id
       WHERE l.company_id = _company_id AND l.product_id = v_item.product_id AND l.is_active
         AND u.unit_id = _decided_unit_id
    ) AND NOT EXISTS (
      SELECT 1 FROM public.product_supplier_links l
       WHERE l.company_id = _company_id AND l.product_id = v_item.product_id AND l.is_active
         AND l.purchase_unit_id = _decided_unit_id
    ) THEN
      RAISE EXCEPTION 'U.M. non configurata sui fornitori di questo prodotto';
    END IF;
    SELECT code INTO v_unit_code FROM public.units_of_measure WHERE id = _decided_unit_id;
    v_code := COALESCE(v_unit_code, v_code);
  ELSIF v_code IS NOT NULL THEN
    -- U.M. manuale: deve esistere già in una ripartizione di un fornitore collegato
    IF NOT EXISTS (
      SELECT 1 FROM public.shopping_list_item_suppliers a
        JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
       WHERE l.company_id = _company_id AND l.product_id = v_item.product_id AND l.is_active
         AND a.purchase_unit_id IS NULL
         AND upper(btrim(regexp_replace(COALESCE(a.purchase_unit_code, ''), '\s+', ' ', 'g'))) = v_code
    ) THEN
      RAISE EXCEPTION 'U.M. manuale non configurata sui fornitori di questo prodotto';
    END IF;
  END IF;

  UPDATE public.shopping_list_items
     SET decided_quantity = _decided_quantity,
         decided_unit_id = _decided_unit_id,
         decided_unit_code = v_code,
         change_reason = COALESCE(NULLIF(btrim(_reason), ''), change_reason),
         notes = COALESCE(_notes, notes),
         decided_by = _actor_user_id,
         decided_at = now()
   WHERE id = _item_id AND company_id = _company_id;
  RETURN _item_id;
END; $function$;

REVOKE ALL ON FUNCTION public.set_shopping_list_item_quantity(uuid, uuid, numeric, text, text, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_shopping_list_item_quantity(uuid, uuid, numeric, text, text, uuid, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.shopping_list_item_state(_item_id uuid)
 RETURNS TABLE(assigned numeric, remaining numeric, status text, untranslatable integer, under_minimum integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH item AS (
    SELECT i.id, i.decided_quantity, i.purchase_mode,
           (i.decided_unit_id IS NOT NULL OR i.decided_unit_code IS NOT NULL) AS other_unit
      FROM public.shopping_list_items i WHERE i.id = _item_id
  ), asg AS (
    SELECT a.assigned_quantity, a.purchase_quantity, a.purchase_unit_id, l.min_quantity, a.min_warning_accepted,
           ((a.purchase_quantity > 0 AND (a.purchase_unit_id IS NOT NULL OR btrim(COALESCE(a.purchase_unit_code, '')) <> ''))
             OR (a.purchase_quantity IS NULL AND a.assigned_quantity > 0)) AS valid
      FROM public.shopping_list_item_suppliers a
      JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
     WHERE a.item_id = _item_id
  ), agg AS (
    SELECT COALESCE(sum(assigned_quantity), 0) AS assigned,
           COUNT(*) FILTER (WHERE valid) AS valid_n,
           COUNT(*) FILTER (WHERE assigned_quantity IS NULL)::int AS untranslatable,
           COUNT(*) FILTER (
             WHERE min_quantity IS NOT NULL AND assigned_quantity IS NOT NULL
               AND assigned_quantity < min_quantity AND NOT min_warning_accepted)::int AS under_minimum
      FROM asg
  )
  SELECT agg.assigned,
         CASE WHEN item.other_unit THEN NULL ELSE item.decided_quantity - agg.assigned END,
         CASE
           WHEN item.purchase_mode = 'manuale' THEN 'manuale'
           WHEN agg.valid_n = 0 THEN 'da_assegnare'
           WHEN NOT item.other_unit AND item.decided_quantity IS NOT NULL AND agg.untranslatable = 0
                AND agg.assigned < item.decided_quantity THEN 'parziale'
           ELSE 'assegnata'
         END,
         agg.untranslatable,
         agg.under_minimum
    FROM item CROSS JOIN agg;
$function$;
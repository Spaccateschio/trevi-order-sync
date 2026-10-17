ALTER TABLE public.purchase_delivery_items
  ADD COLUMN declared_unit_price numeric,
  ADD COLUMN declared_tare_weight numeric,
  ADD COLUMN declared_gross_weight numeric,
  ADD COLUMN declared_net_weight numeric,
  ADD COLUMN declared_alt_description text;

COMMENT ON COLUMN public.purchase_delivery_items.declared_unit_price IS 'Prezzo unitario dichiarato dal fornitore esterno alla consegna';
COMMENT ON COLUMN public.purchase_delivery_items.declared_tare_weight IS 'Tara dichiarata dal fornitore esterno (kg)';
COMMENT ON COLUMN public.purchase_delivery_items.declared_gross_weight IS 'Peso lordo dichiarato dal fornitore esterno (kg)';
COMMENT ON COLUMN public.purchase_delivery_items.declared_net_weight IS 'Peso netto dichiarato dal fornitore esterno (kg)';
COMMENT ON COLUMN public.purchase_delivery_items.declared_alt_description IS 'Descrizione alternativa del prodotto indicata dal fornitore esterno';

CREATE OR REPLACE FUNCTION public.external_set_delivery_item(_token_hash text, _delivery_item_id uuid, _declared_quantity numeric DEFAULT NULL::numeric, _declared_producer text DEFAULT NULL::text, _declared_producer_lot text DEFAULT NULL::text, _declared_expiry date DEFAULT NULL::date, _line_notes text DEFAULT NULL::text, _missing_reason text DEFAULT NULL::text, _declared_purchase_quantity numeric DEFAULT NULL::numeric, _declared_unit_price numeric DEFAULT NULL::numeric, _declared_tare_weight numeric DEFAULT NULL::numeric, _declared_gross_weight numeric DEFAULT NULL::numeric, _declared_net_weight numeric DEFAULT NULL::numeric, _declared_alt_description text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_order uuid; v_item_order uuid; v_result uuid;
BEGIN
  v_order := public.resolve_order_share_token(_token_hash);
  SELECT d.order_id INTO v_item_order FROM public.purchase_delivery_items i
    JOIN public.purchase_deliveries d ON d.id = i.delivery_id WHERE i.id = _delivery_item_id;
  IF v_item_order IS NULL OR v_item_order <> v_order THEN RAISE EXCEPTION 'Riga non valida per questo codice'; END IF;
  v_result := public._delivery_set_item_core(_delivery_item_id, _declared_quantity, NULL, _declared_producer,
    _declared_producer_lot, _declared_expiry, _line_notes, _missing_reason, NULL, NULL, _declared_purchase_quantity);
  UPDATE public.purchase_delivery_items SET
    declared_unit_price = COALESCE(_declared_unit_price, declared_unit_price),
    declared_tare_weight = COALESCE(_declared_tare_weight, declared_tare_weight),
    declared_gross_weight = COALESCE(_declared_gross_weight, declared_gross_weight),
    declared_net_weight = COALESCE(_declared_net_weight, declared_net_weight),
    declared_alt_description = COALESCE(_declared_alt_description, declared_alt_description)
  WHERE id = _delivery_item_id;
  RETURN v_result;
END; $function$;
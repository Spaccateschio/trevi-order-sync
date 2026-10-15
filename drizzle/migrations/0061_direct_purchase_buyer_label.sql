ALTER TABLE public.direct_purchases ADD COLUMN buyer_label TEXT;
COMMENT ON COLUMN public.direct_purchases.buyer_label IS 'Chi esegue l''acquisto diretto: collaboratore o fornitore nuovo scritto a mano (nessuna anagrafica).';

CREATE OR REPLACE FUNCTION public.update_direct_purchase_draft(_id uuid, _header jsonb, _lines jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_doc public.direct_purchases%ROWTYPE; l jsonb; v_it public.direct_purchase_items%ROWTYPE;
  v_q numeric; v_u uuid; v_p numeric; v_pu uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  SELECT * INTO v_doc FROM public.direct_purchases WHERE id = _id FOR UPDATE;
  IF v_doc.id IS NULL OR NOT public.is_company_member(v_doc.company_id) THEN RAISE EXCEPTION 'Documento non trovato'; END IF;
  IF NOT public._direct_purchase_actor_ok(v_doc.company_id) THEN RAISE EXCEPTION 'Operazione riservata ad amministratore o operatore'; END IF;
  IF v_doc.status <> 'bozza' THEN RAISE EXCEPTION 'Il documento non è più in bozza: non è modificabile'; END IF;
  -- Validazione completa prima di qualsiasi scrittura.
  IF (_header->>'total_paid') IS NOT NULL AND (_header->>'total_paid')::numeric < 0 THEN RAISE EXCEPTION 'Totale pagato non valido'; END IF;
  IF length(btrim(COALESCE(_header->>'buyer_label', ''))) > 200 THEN RAISE EXCEPTION 'Nome di chi acquista troppo lungo (massimo 200 caratteri)'; END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(COALESCE(_lines, '[]'::jsonb)) LOOP
    SELECT * INTO v_it FROM public.direct_purchase_items WHERE id = (l->>'line_id')::uuid AND direct_purchase_id = _id;
    IF v_it.id IS NULL THEN RAISE EXCEPTION 'Riga non appartenente al documento'; END IF;
    v_q := (l->>'quantity')::numeric; v_u := (l->>'unit_id')::uuid; v_p := (l->>'unit_price')::numeric; v_pu := (l->>'price_unit_id')::uuid;
    IF v_q IS NOT NULL AND v_q <= 0 THEN RAISE EXCEPTION 'Quantità non valida per %: deve essere maggiore di zero', v_it.product_name; END IF;
    IF v_u IS NOT NULL AND NOT public._company_unit_active(v_doc.company_id, v_u) THEN RAISE EXCEPTION 'U.M. non presente tra quelle attive dell''azienda (%)', v_it.product_name; END IF;
    IF v_p IS NOT NULL AND v_p < 0 THEN RAISE EXCEPTION 'Prezzo non valido per %', v_it.product_name; END IF;
    IF v_p IS NOT NULL AND v_pu IS NULL THEN RAISE EXCEPTION 'Prezzo senza U.M. per %', v_it.product_name; END IF;
    IF v_pu IS NOT NULL AND NOT public._company_unit_active(v_doc.company_id, v_pu) THEN RAISE EXCEPTION 'U.M. del prezzo non presente tra quelle attive dell''azienda (%)', v_it.product_name; END IF;
  END LOOP;
  UPDATE public.direct_purchases SET
    purchased_where = NULLIF(btrim(COALESCE(_header->>'purchased_where', '')), ''),
    purchase_date = (_header->>'purchase_date')::date,
    total_paid = (_header->>'total_paid')::numeric,
    notes = NULLIF(btrim(COALESCE(_header->>'notes', '')), ''),
    buyer_label = NULLIF(btrim(COALESCE(_header->>'buyer_label', '')), ''),
    updated_at = now()
   WHERE id = _id;
  FOR l IN SELECT * FROM jsonb_array_elements(COALESCE(_lines, '[]'::jsonb)) LOOP
    UPDATE public.direct_purchase_items SET
      quantity = (l->>'quantity')::numeric, unit_id = (l->>'unit_id')::uuid,
      unit_price = (l->>'unit_price')::numeric, price_unit_id = (l->>'price_unit_id')::uuid,
      notes = NULLIF(btrim(COALESCE(l->>'notes', '')), ''), updated_at = now()
     WHERE id = (l->>'line_id')::uuid AND direct_purchase_id = _id;
  END LOOP;
  RETURN jsonb_build_object('ok', true);
END $function$;
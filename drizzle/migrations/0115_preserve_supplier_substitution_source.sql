DO $migration$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.receive_purchase_order(uuid,jsonb,uuid,timestamptz,uuid,timestamptz,text)'::regprocedure) INTO d;
  IF strpos(d,'  -- Explicitly finalize substitute rows and retain their original-order supplier context.')=0 THEN RAISE EXCEPTION 'Versione della conferma non riconosciuta'; END IF;
  d := replace(d, '  -- Explicitly finalize substitute rows and retain their original-order supplier context.', $r$
  FOR v_di IN SELECT * FROM public.purchase_delivery_items WHERE delivery_id=v_id AND line_type='sostituzione' AND replaces_order_item_id IS NOT NULL LOOP
    IF NOT EXISTS(SELECT 1 FROM public.purchase_order_items WHERE id=v_di.replaces_order_item_id AND order_id=_order_id) THEN RAISE EXCEPTION 'La sostituzione non appartiene a questo ordine'; END IF;
    UPDATE public.goods_receipt_items SET order_item_id=v_di.replaces_order_item_id WHERE receipt_id=v_receipt AND delivery_item_id=v_di.id;
  END LOOP;
  -- Explicitly finalize substitute rows and retain their original-order supplier context.
  $r$);
  d := replace(d, 'IF v_replacements <> ''{}''::jsonb OR EXISTS', 'IF v_replacements <> ''{}''::jsonb OR EXISTS(SELECT 1 FROM public.purchase_delivery_items WHERE delivery_id=v_id AND line_type=''sostituzione'') OR EXISTS');
  EXECUTE d;
END;
$migration$;
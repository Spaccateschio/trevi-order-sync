DO $migration$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.receive_purchase_order(uuid,jsonb,uuid,timestamptz,uuid,timestamptz,text)'::regprocedure) INTO d;
  IF strpos(d,'v_replacements jsonb')=0 THEN RAISE EXCEPTION 'Versione della conferma non riconosciuta'; END IF;
  d := replace(d, 'WHERE ri.order_item_id = v_oi.id AND r.status = ''confermato''', 'WHERE ri.order_item_id = v_oi.id AND ri.product_id = v_oi.product_id AND r.status = ''confermato''');
  d := replace(d, 'WHERE ri.order_item_id=oi.id AND r.status=''confermato''', 'WHERE ri.order_item_id=oi.id AND ri.product_id=oi.product_id AND r.status=''confermato''');
  d := replace(d, $r$
      PERFORM public.set_goods_receipt_item(v_ri.id,(v_line->>'substitute_quantity')::numeric,v_line->>'producer',v_line->>'lot',(v_line->>'expiry')::date,NULL,'Sostituzione al ricevimento',auth.uid(),NULL,NULL,NULL,true,true);
      UPDATE public.goods_receipt_items SET unit_cost=NULL,expiry_date=(v_line->>'expiry')::date WHERE id=v_ri.id;
  $r$, $r$
      SELECT id INTO v_price_id FROM public.units_of_measure WHERE company_id=v_o.company_id AND status='attivo' AND lower(code)=lower(v_line->>'price_unit_code') ORDER BY created_at LIMIT 1;
      PERFORM public.set_goods_receipt_item(v_ri.id,(v_line->>'substitute_quantity')::numeric,v_line->>'producer',v_line->>'lot',(v_line->>'expiry')::date,(v_line->>'unit_cost')::numeric,'Sostituzione al ricevimento',auth.uid(),v_price_id,v_line->>'price_unit_code',(v_line->>'price_quantity')::numeric,v_line->>'price_unit_code' IS NULL,v_line->>'price_quantity' IS NULL);
      UPDATE public.goods_receipt_items SET unit_cost=(v_line->>'unit_cost')::numeric,expiry_date=(v_line->>'expiry')::date WHERE id=v_ri.id;
  $r$);
  d := replace(d, 'IF v_replacements <> ''{}''::jsonb THEN', 'IF v_replacements <> ''{}''::jsonb OR EXISTS (SELECT 1 FROM jsonb_array_elements(_lines) x WHERE x->>''outcome'' IN (''parziale'',''mancante'') OR (x->>''quantity'')::numeric < (x->>''arrived_quantity'')::numeric) THEN');
  EXECUTE d;
END;
$migration$;
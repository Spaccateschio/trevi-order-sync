-- DEFERRED: NOT APPLIED. Coordinated release and isolated tests required.
-- No backfill. Only future send transitions; all other commands remain unchanged.
DO $deferred$
DECLARE
 original text;
 replacement text;
 send_marker text := 'IF _action = ''send'' THEN';
 classify_marker text := 'v_b2b := v_o.relation_id IS NOT NULL;';
 update_marker text := 'UPDATE public.purchase_orders SET status = ''inviato'', sent_at = now(), send_channel = v_channel WHERE id = _order_id;';
BEGIN
 SELECT pg_get_functiondef('public.manage_purchase_order(uuid,text,uuid,text,uuid,text)'::regprocedure) INTO original;
 IF md5(original) <> '0c9a7f2698a674844d181de50ca0d22c' THEN
  RAISE EXCEPTION 'Unexpected manage_purchase_order definition; review before release';
 END IF;
 IF (length(original) - length(replace(original, send_marker, ''))) / length(send_marker) <> 1
 OR (length(original) - length(replace(original, classify_marker, ''))) / length(classify_marker) <> 1
 OR (length(original) - length(replace(original, update_marker, ''))) / length(update_marker) <> 1 THEN
  RAISE EXCEPTION 'Expected exactly one send, classification and update match';
 END IF;
 -- Same conservative classifier as confirm_non_b2b_order_share / undo.
 -- B2B-marked but relation-less orders are rejected, not silently sent on platform.
 replacement := replace(original, classify_marker, $classification$v_b2b := v_o.relation_id IS NOT NULL OR EXISTS (
      SELECT 1 FROM public.purchase_order_items i
      JOIN public.product_supplier_links l ON l.id = i.product_supplier_link_id
      WHERE i.order_id = v_o.id
        AND (l.supplier_company_id IS NOT NULL OR l.b2b_item_id IS NOT NULL)
    );
    IF NOT v_b2b THEN
      RAISE EXCEPTION 'Use confirm_non_b2b_order_share for non B2B orders';
    END IF;
    IF v_o.relation_id IS NULL THEN
      RAISE EXCEPTION 'B2B order links require a coherent relation; review the order';
    END IF;$classification$);
 -- At this point only B2B orders with a relation reach the original send update.
 replacement := replace(replacement, update_marker,
   'UPDATE public.purchase_orders SET status = ''inviato'', send_status = ''inviato'', sent_at = now(), send_channel = v_channel WHERE id = _order_id;');
 EXECUTE replacement;
END $deferred$;

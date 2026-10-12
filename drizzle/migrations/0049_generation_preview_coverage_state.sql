-- Sola lettura: l'anteprima «Genera ordini» espone lo stato della conferma e i dati per la matita.
-- Nessuna tabella, nessuna scrittura; la funzione resta STABLE e con gli stessi controlli d'accesso.
DO $mig$
DECLARE v_def text; v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO STRICT v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'shopping_list_generation_preview';
  v_new := replace(v_def,
    'SELECT a.supplier_record_id, a.id AS assignment_id, r.id AS item_id, r.code, r.description,',
    'SELECT a.supplier_record_id, a.id AS assignment_id, r.id AS item_id, r.code, r.description,
           a.product_supplier_link_id AS link_id, a.purchase_unit_id, a.purchase_quantity AS saved_quantity,
           r.decided_quantity AS item_quantity,
           (SELECT count(*) FROM public.shopping_list_item_suppliers z WHERE z.item_id = r.id) AS assign_count,
           (SELECT max(z.updated_at) FROM public.shopping_list_item_suppliers z WHERE z.item_id = r.id) AS assign_at,
           EXISTS (SELECT 1 FROM public.purchase_order_items oi2 WHERE oi2.source_assignment_id = a.id) AS in_order,');
  IF v_new = v_def THEN RAISE EXCEPTION 'Lettura righe non trovata'; END IF;
  v_def := v_new;
  v_new := replace(v_def,
    '''needs_coverage'', pr.no_conversion AND NOT pr.coverage_ok)',
    '''needs_coverage'', pr.no_conversion AND NOT pr.coverage_ok,
              ''coverage_confirmed'', pr.no_conversion AND pr.coverage_ok,
              ''link_id'', pr.link_id, ''purchase_unit_id'', pr.purchase_unit_id, ''saved_quantity'', pr.saved_quantity,
              ''item_quantity'', pr.item_quantity, ''assign_count'', pr.assign_count, ''assign_at'', pr.assign_at,
              ''in_order'', pr.in_order)');
  IF v_new = v_def THEN RAISE EXCEPTION 'Oggetto riga non trovato'; END IF;
  EXECUTE v_new;
END $mig$;
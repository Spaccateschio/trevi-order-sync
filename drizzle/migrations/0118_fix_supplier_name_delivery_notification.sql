CREATE OR REPLACE FUNCTION public._notify_delivery_declared()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _num text; _sup text;
BEGIN
  IF NEW.status = 'dichiarata' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.origin IN ('fornitore_link_esterno','fornitore_b2b') THEN
    SELECT po.number::text, sr.legal_name INTO _num, _sup
      FROM purchase_orders po LEFT JOIN supplier_records sr ON sr.id = po.supplier_record_id
     WHERE po.id = NEW.order_id;
    INSERT INTO notifications(company_id, type, title, body, link, entity_id)
    VALUES (NEW.company_id, 'consegna_fornitore_confermata',
      'Il fornitore ha confermato l''ordine' || COALESCE(' n. ' || _num, ''),
      COALESCE(_sup, COALESCE(NEW.declared_by_name, 'Fornitore')) || ' ha inserito i dati di consegna. Controllali e accettali.',
      '/acquisti/ordini', NEW.order_id);
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.notify_purchase_order_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _seller uuid; _buyer_name text;
BEGIN
  IF NEW.relation_id IS NULL THEN RETURN NEW; END IF;
  SELECT r.seller_company_id INTO _seller FROM public.supplier_customer_relations r WHERE r.id = NEW.relation_id;
  IF _seller IS NULL THEN RETURN NEW; END IF;
  SELECT c.legal_name INTO _buyer_name FROM public.companies c WHERE c.id = NEW.company_id;
  IF NEW.status = 'inviato' AND (TG_OP = 'INSERT' OR OLD.status = 'bozza') THEN
    INSERT INTO public.notifications(company_id, type, title, body, link, entity_id)
    VALUES (_seller, 'ordine_ricevuto', 'Nuovo ordine ' || coalesce(NEW.number, ''), 'Da ' || coalesce(_buyer_name, 'cliente'), '/vendite/ordini-clienti', NEW.id);
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'annullato' AND OLD.status <> 'annullato' AND OLD.status <> 'bozza' THEN
    INSERT INTO public.notifications(company_id, type, title, body, link, entity_id)
    VALUES (_seller, 'ordine_annullato', 'Ordine ' || coalesce(NEW.number, '') || ' annullato', 'Annullato da ' || coalesce(_buyer_name, 'cliente'), '/vendite/ordini-clienti', NEW.id);
  END IF;
  RETURN NEW;
END $$;
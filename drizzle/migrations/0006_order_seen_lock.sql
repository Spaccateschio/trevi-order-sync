ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS seen_by_supplier_at timestamptz, ADD COLUMN IF NOT EXISTS seen_by_supplier_by uuid;

CREATE OR REPLACE FUNCTION public.mark_order_seen_by_supplier(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _seller uuid;
BEGIN
  SELECT r.seller_company_id INTO _seller FROM public.purchase_orders o
    JOIN public.supplier_customer_relations r ON r.id = o.relation_id WHERE o.id = _order_id;
  IF _seller IS NULL OR NOT public.is_company_member(_seller) THEN RAISE EXCEPTION 'Non autorizzato'; END IF;
  UPDATE public.purchase_orders SET seen_by_supplier_at = now(), seen_by_supplier_by = auth.uid()
   WHERE id = _order_id AND seen_by_supplier_at IS NULL AND status <> 'bozza';
END $$;
GRANT EXECUTE ON FUNCTION public.mark_order_seen_by_supplier(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_order_seen_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _seller uuid;
BEGIN
  IF OLD.seen_by_supplier_at IS NULL OR OLD.relation_id IS NULL OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT seller_company_id INTO _seller FROM public.supplier_customer_relations WHERE id = OLD.relation_id;
  IF public.is_company_member(_seller) THEN RETURN NEW; END IF;
  IF NEW.status = 'annullato' AND OLD.status <> 'annullato' THEN
    RAISE EXCEPTION 'Il fornitore ha già preso in carico l''ordine: per annullarlo chiama il fornitore';
  END IF;
  IF NEW.delivery_date IS DISTINCT FROM OLD.delivery_date OR NEW.delivery_time_from IS DISTINCT FROM OLD.delivery_time_from
     OR NEW.delivery_time_to IS DISTINCT FROM OLD.delivery_time_to OR NEW.delivery_address_text IS DISTINCT FROM OLD.delivery_address_text
     OR NEW.notes IS DISTINCT FROM OLD.notes THEN
    RAISE EXCEPTION 'Il fornitore ha già preso in carico l''ordine: per modificarlo chiama il fornitore';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_order_seen_lock ON public.purchase_orders;
CREATE TRIGGER trg_guard_order_seen_lock BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.guard_order_seen_lock();

CREATE OR REPLACE FUNCTION public.customer_update_order(_order_id uuid, _delivery_date date, _time_from time, _time_to time, _address text, _notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.purchase_orders; _seller uuid; _buyer text;
BEGIN
  SELECT * INTO o FROM public.purchase_orders WHERE id = _order_id;
  IF o.id IS NULL OR NOT public.is_company_member(o.company_id) THEN RAISE EXCEPTION 'Non autorizzato'; END IF;
  IF o.status <> 'inviato' THEN RAISE EXCEPTION 'Ordine non modificabile'; END IF;
  IF o.seen_by_supplier_at IS NOT NULL THEN RAISE EXCEPTION 'Il fornitore ha già preso in carico l''ordine: per modificarlo chiama il fornitore'; END IF;
  UPDATE public.purchase_orders SET delivery_date = _delivery_date, delivery_time_from = _time_from, delivery_time_to = _time_to,
    delivery_address_text = NULLIF(trim(_address), ''), notes = NULLIF(trim(_notes), ''), updated_at = now() WHERE id = _order_id;
  IF o.relation_id IS NOT NULL THEN
    SELECT seller_company_id INTO _seller FROM public.supplier_customer_relations WHERE id = o.relation_id;
    SELECT legal_name INTO _buyer FROM public.companies WHERE id = o.company_id;
    IF _seller IS NOT NULL THEN
      INSERT INTO public.notifications(company_id, type, title, body, link, entity_id)
      VALUES (_seller, 'ordine_modificato', 'Ordine ' || coalesce(o.number,'') || ' modificato', 'Modificato da ' || coalesce(_buyer,'cliente'), '/vendite/ordini-clienti', o.id);
    END IF;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.customer_update_order(uuid, date, time, time, text, text) TO authenticated;
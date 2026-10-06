CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_company_created_idx ON public.notifications(company_id, created_at DESC);
GRANT SELECT ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read company notifications" ON public.notifications FOR SELECT TO authenticated USING (public.is_company_member(company_id));

CREATE TABLE public.notification_reads (
  notification_id uuid NOT NULL REFERENCES public.notifications(id),
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);
GRANT SELECT ON public.notification_reads TO authenticated;
GRANT ALL ON public.notification_reads TO service_role;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notification reads" ON public.notification_reads FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.mark_notifications_read(_ids uuid[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;
  INSERT INTO public.notification_reads(notification_id, user_id)
  SELECT x.id, auth.uid() FROM public.notifications x
  WHERE public.is_company_member(x.company_id) AND (_ids IS NULL OR x.id = ANY(_ids))
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.mark_notifications_read(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) TO authenticated;

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
    VALUES (_seller, 'ordine_ricevuto', 'Nuovo ordine ' || coalesce(NEW.number, ''), 'Da ' || coalesce(_buyer_name, 'cliente'), '/vendite', NEW.id);
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'annullato' AND OLD.status <> 'annullato' AND OLD.status <> 'bozza' THEN
    INSERT INTO public.notifications(company_id, type, title, body, link, entity_id)
    VALUES (_seller, 'ordine_annullato', 'Ordine ' || coalesce(NEW.number, '') || ' annullato', 'Annullato da ' || coalesce(_buyer_name, 'cliente'), '/vendite', NEW.id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_purchase_order_event() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER purchase_orders_notify AFTER INSERT OR UPDATE OF status ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.notify_purchase_order_event();

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
CREATE OR REPLACE FUNCTION public.supplier_cancel_order(_order_id uuid, _reason text)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.purchase_orders; _seller uuid;
BEGIN
  SELECT * INTO o FROM public.purchase_orders WHERE id = _order_id FOR UPDATE;
  SELECT seller_company_id INTO _seller FROM public.supplier_customer_relations WHERE id = o.relation_id;
  IF o.id IS NULL OR _seller IS NULL OR NOT public.is_company_member(_seller) THEN RAISE EXCEPTION 'Non autorizzato'; END IF;
  IF o.status NOT IN ('inviato') THEN RAISE EXCEPTION 'Ordine non annullabile in questo stato'; END IF;
  IF EXISTS (SELECT 1 FROM public.goods_receipts g WHERE g.order_id = o.id AND g.status = 'confermato') THEN
    RAISE EXCEPTION 'Esiste già un carico merce confermato'; END IF;
  UPDATE public.purchase_orders SET status = 'annullato', cancelled_at = now(), cancelled_by = auth.uid(),
    cancel_reason = NULLIF(trim(_reason),''), updated_at = now() WHERE id = o.id;
  INSERT INTO public.purchase_order_changes(order_id,buyer_company_id,seller_company_id,field,label,old_value,new_value,changed_by)
  VALUES (o.id,o.company_id,_seller,'cancelled_by_supplier','Annullato dal fornitore',o.status::text,coalesce(NULLIF(trim(_reason),''),'annullato'),auth.uid());
  INSERT INTO public.notifications(company_id,type,title,body,link,entity_id)
  VALUES (o.company_id,'ordine_annullato_fornitore','Ordine ' || coalesce(o.number,'') || ' annullato dal fornitore',
    coalesce(NULLIF(trim(_reason),''),'Il fornitore ha annullato l''ordine'),'/acquisti/ordini',o.id);
  RETURN o.danea_exported_at;
END $$;
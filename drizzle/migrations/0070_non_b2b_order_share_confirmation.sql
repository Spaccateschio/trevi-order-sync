CREATE OR REPLACE FUNCTION public.confirm_non_b2b_order_share(_order_id uuid, _channel text, _recipient text, _confirmation_key uuid, _mode text DEFAULT 'first') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.purchase_orders; e public.audit_events; ch text:=lower(btrim(_channel)); recipient text:=nullif(btrim(_recipient),''); closed boolean:=false; event_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticazione richiesta'; END IF;
 SELECT * INTO o FROM public.purchase_orders WHERE id=_order_id;
 IF o.id IS NULL OR NOT public.is_company_member(o.company_id) OR NOT (public.is_company_admin(o.company_id) OR public.has_company_role(o.company_id,'operatore')) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
 IF o.shopping_list_id IS NOT NULL THEN PERFORM 1 FROM public.shopping_lists WHERE id=o.shopping_list_id FOR UPDATE; END IF;
 SELECT * INTO o FROM public.purchase_orders WHERE id=_order_id FOR UPDATE;
 IF o.relation_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.purchase_order_items i JOIN public.product_supplier_links l ON l.id=i.product_supplier_link_id WHERE i.order_id=o.id AND (l.supplier_company_id IS NOT NULL OR l.b2b_item_id IS NOT NULL)) THEN RAISE EXCEPTION 'Solo ordini non B2B'; END IF;
 IF _confirmation_key IS NULL OR _mode IS NULL OR _mode NOT IN ('first','resend') OR ch IS NULL OR ch NOT IN ('whatsapp','email','sms','telefono','di_persona','altro','copia_testo') THEN RAISE EXCEPTION 'Conferma non valida'; END IF;
 IF length(coalesce(recipient,''))>320 OR (ch IN ('email','whatsapp','sms') AND recipient IS NULL) THEN RAISE EXCEPTION 'Destinatario necessario'; END IF;
 IF ch='email' AND recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Email non valida'; END IF;
 IF ch IN ('whatsapp','sms') AND recipient !~ '^\+?[0-9 ()-]{6,30}$' THEN RAISE EXCEPTION 'Telefono non valido'; END IF;
 SELECT * INTO e FROM public.audit_events WHERE entity_id=o.id AND action='purchase_order.share_confirmed' AND detail->>'key'=_confirmation_key::text LIMIT 1;
 IF e.id IS NOT NULL THEN
  IF e.actor_user_id IS DISTINCT FROM auth.uid() OR e.detail->>'mode' IS DISTINCT FROM _mode OR e.detail->>'channel' IS DISTINCT FROM ch OR e.detail->>'recipient' IS DISTINCT FROM recipient THEN RAISE EXCEPTION 'Chiave già utilizzata per altra conferma'; END IF;
  RETURN jsonb_build_object('event_id',e.id,'duplicate',true,'list_closed',coalesce((e.detail->>'list_closed')::boolean,false));
 END IF;
 IF _mode='first' THEN
  IF o.status<>'bozza' OR o.send_status='inviato' THEN RAISE EXCEPTION 'Ordine già confermato: usa Rimanda ordine'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.purchase_order_items WHERE order_id=o.id) THEN RAISE EXCEPTION 'Ordine senza righe'; END IF;
  IF o.shopping_list_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.shopping_lists WHERE id=o.shopping_list_id AND status='aperta') THEN RAISE EXCEPTION 'Lista non aperta'; END IF;
 ELSE
  IF o.status NOT IN ('inviato','parzialmente_consegnato','consegnato','chiuso') OR o.sent_at IS NULL THEN RAISE EXCEPTION 'Ordine non ancora inviato'; END IF;
 END IF;
 IF _mode='first' THEN
  UPDATE public.purchase_orders SET status='inviato',send_status='inviato',sent_at=now(),send_channel=ch WHERE id=o.id;
  IF o.shopping_list_id IS NOT NULL THEN closed:=public._shopping_list_try_complete(o.shopping_list_id,auth.uid()); END IF;
 END IF;
 INSERT INTO public.audit_events(company_id,actor_user_id,action,entity_type,entity_id,detail) VALUES(o.company_id,auth.uid(),'purchase_order.share_confirmed','purchase_order',o.id,jsonb_build_object('key',_confirmation_key,'mode',_mode,'channel',ch,'recipient',recipient,'list_closed',closed)) RETURNING id INTO event_id;
 RETURN jsonb_build_object('event_id',event_id,'duplicate',false,'list_closed',closed);
END $$;
CREATE OR REPLACE FUNCTION public.undo_non_b2b_order_send_confirmation(_order_id uuid,_reason text,_confirmation_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.purchase_orders; e public.audit_events; reason text:=nullif(btrim(_reason),''); before_data jsonb; event_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticazione richiesta'; END IF;
 SELECT * INTO o FROM public.purchase_orders WHERE id=_order_id;
 IF o.id IS NULL OR NOT public.is_company_member(o.company_id) OR NOT public.is_company_admin(o.company_id) THEN RAISE EXCEPTION 'Solo amministratore dell’azienda proprietaria'; END IF;
 IF reason IS NULL OR length(reason)>2000 OR _confirmation_key IS NULL THEN RAISE EXCEPTION 'Motivo obbligatorio'; END IF;
 IF o.shopping_list_id IS NOT NULL THEN PERFORM 1 FROM public.shopping_lists WHERE id=o.shopping_list_id FOR UPDATE; END IF;
 SELECT * INTO o FROM public.purchase_orders WHERE id=_order_id FOR UPDATE;
 IF o.relation_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.purchase_order_items i JOIN public.product_supplier_links l ON l.id=i.product_supplier_link_id WHERE i.order_id=o.id AND (l.supplier_company_id IS NOT NULL OR l.b2b_item_id IS NOT NULL)) THEN RAISE EXCEPTION 'Solo ordini non B2B'; END IF;
 SELECT * INTO e FROM public.audit_events WHERE entity_id=o.id AND action='purchase_order.send_confirmation_undone' AND detail->>'key'=_confirmation_key::text LIMIT 1;
 IF e.id IS NOT NULL THEN
  IF e.actor_user_id IS DISTINCT FROM auth.uid() OR e.detail->>'reason' IS DISTINCT FROM reason THEN RAISE EXCEPTION 'Chiave già utilizzata'; END IF;
  RETURN jsonb_build_object('event_id',e.id,'duplicate',true);
 END IF;
 IF o.status<>'inviato' OR o.sent_at IS NULL THEN RAISE EXCEPTION 'Conferma non annullabile'; END IF;
 IF o.seen_by_supplier_at IS NOT NULL OR o.danea_exported_at IS NOT NULL OR o.closed_at IS NOT NULL OR o.cancelled_at IS NOT NULL
 OR EXISTS(SELECT 1 FROM public.purchase_deliveries WHERE order_id=o.id)
 OR EXISTS(SELECT 1 FROM public.goods_receipts WHERE order_id=o.id)
 OR EXISTS(SELECT 1 FROM public.danea_order_exports WHERE o.id=ANY(order_ids))
 OR EXISTS(SELECT 1 FROM public.purchase_order_change_requests WHERE order_id=o.id)
 OR EXISTS(SELECT 1 FROM public.purchase_order_changes WHERE order_id=o.id AND changed_at>=o.sent_at)
 OR EXISTS(SELECT 1 FROM public.purchase_order_share_links WHERE order_id=o.id AND (last_access_at IS NOT NULL OR access_count>0))
 OR (o.shopping_list_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.shopping_lists WHERE id=o.shopping_list_id AND status='aperta')) THEN RAISE EXCEPTION 'Attività successive incompatibili: conferma non annullabile'; END IF;
 before_data:=jsonb_build_object('status',o.status,'send_status',o.send_status,'sent_at',o.sent_at,'send_channel',o.send_channel,'updated_at',o.updated_at);
 UPDATE public.purchase_orders SET status='bozza',send_status='da_inviare',sent_at=NULL,send_channel=NULL WHERE id=o.id;
 INSERT INTO public.audit_events(company_id,actor_user_id,action,entity_type,entity_id,detail) VALUES(o.company_id,auth.uid(),'purchase_order.send_confirmation_undone','purchase_order',o.id,jsonb_build_object('key',_confirmation_key,'reason',reason,'before',before_data,'after',jsonb_build_object('status','bozza','send_status','da_inviare','sent_at',NULL,'send_channel',NULL))) RETURNING id INTO event_id;
 RETURN jsonb_build_object('event_id',event_id,'duplicate',false);
END $$;
CREATE OR REPLACE FUNCTION public.order_share_history(_order_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.purchase_orders; result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticazione richiesta'; END IF;
 SELECT * INTO o FROM public.purchase_orders WHERE id=_order_id;
 IF o.id IS NULL OR NOT public.is_company_member(o.company_id) OR NOT (public.is_company_admin(o.company_id) OR public.has_company_role(o.company_id,'operatore')) THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'at',a.created_at,'actor',coalesce(nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),'Utente'),'action',a.action,'detail',a.detail) ORDER BY a.created_at DESC,a.id),'[]'::jsonb) INTO result FROM public.audit_events a LEFT JOIN public.profiles p ON p.user_id=a.actor_user_id WHERE a.entity_id=o.id AND a.company_id=o.company_id AND a.action IN ('purchase_order.send','purchase_order.share_confirmed','purchase_order.send_confirmation_undone');
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.confirm_non_b2b_order_share(uuid,text,text,uuid,text), public.undo_non_b2b_order_send_confirmation(uuid,text,uuid), public.order_share_history(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_non_b2b_order_share(uuid,text,text,uuid,text), public.undo_non_b2b_order_send_confirmation(uuid,text,uuid), public.order_share_history(uuid) TO authenticated;
CREATE POLICY audit_share_events_rpc_only ON public.audit_events AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (action NOT IN ('purchase_order.share_confirmed','purchase_order.send_confirmation_undone'));
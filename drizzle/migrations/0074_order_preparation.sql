CREATE OR REPLACE FUNCTION public.preparation_actor_allowed(_company_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT auth.uid() IS NOT NULL AND (public.has_company_role(_company_id, 'amministratore') OR public.has_company_role(_company_id, 'operatore')); $$;
REVOKE ALL ON FUNCTION public.preparation_actor_allowed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preparation_actor_allowed(uuid) TO authenticated, service_role;

CREATE TABLE public.order_preparations (
 order_id uuid PRIMARY KEY REFERENCES public.purchase_orders(id), company_id uuid NOT NULL REFERENCES public.companies(id), assigned_member_id uuid REFERENCES public.company_members(id), ready_at timestamptz, ready_by uuid, version integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.order_preparations TO authenticated;
GRANT ALL ON public.order_preparations TO service_role;
ALTER TABLE public.order_preparations ENABLE ROW LEVEL SECURITY;
CREATE POLICY preparation_read ON public.order_preparations FOR SELECT TO authenticated USING (public.preparation_actor_allowed(company_id));

CREATE TABLE public.order_preparation_lines (
 item_id uuid PRIMARY KEY REFERENCES public.purchase_order_items(id), order_id uuid NOT NULL REFERENCES public.order_preparations(order_id), company_id uuid NOT NULL REFERENCES public.companies(id), requested_quantity numeric, unit_id uuid, unit_code text, prepared_quantity numeric, effective_weight_kg numeric, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','confirmed','missing')), source_signature text NOT NULL, version integer NOT NULL DEFAULT 0, confirmed_by uuid, confirmed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), CHECK(prepared_quantity IS NULL OR (prepared_quantity > 0 AND prepared_quantity < 'Infinity'::numeric)), CHECK(effective_weight_kg IS NULL OR (effective_weight_kg > 0 AND effective_weight_kg < 'Infinity'::numeric)), CHECK(state <> 'confirmed' OR prepared_quantity IS NOT NULL), CHECK(state <> 'missing' OR (prepared_quantity IS NULL AND effective_weight_kg IS NULL))
);
GRANT SELECT ON public.order_preparation_lines TO authenticated;
GRANT ALL ON public.order_preparation_lines TO service_role;
ALTER TABLE public.order_preparation_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY preparation_lines_read ON public.order_preparation_lines FOR SELECT TO authenticated USING (public.preparation_actor_allowed(company_id));

CREATE TABLE public.order_preparation_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.order_preparations(order_id), company_id uuid NOT NULL REFERENCES public.companies(id), item_id uuid REFERENCES public.purchase_order_items(id), action text NOT NULL, actor_user_id uuid NOT NULL, assigned_member_id uuid REFERENCES public.company_members(id), before_data jsonb, after_data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.order_preparation_events TO authenticated;
GRANT ALL ON public.order_preparation_events TO service_role;
ALTER TABLE public.order_preparation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY preparation_events_read ON public.order_preparation_events FOR SELECT TO authenticated USING (public.preparation_actor_allowed(company_id));
CREATE INDEX preparation_events_order ON public.order_preparation_events(order_id, created_at);
CREATE INDEX preparation_lines_order ON public.order_preparation_lines(order_id);

CREATE OR REPLACE FUNCTION public.preparation_order_signature(_order_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT md5(jsonb_build_object('order', to_jsonb(o), 'items', coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM public.purchase_order_items i WHERE i.order_id=o.id),'[]'::jsonb))::text) FROM public.purchase_orders o WHERE o.id=_order_id;
$$;
REVOKE ALL ON FUNCTION public.preparation_order_signature(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preparation_order_signature(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.preparation_bundle(_member_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c uuid; result jsonb;
BEGIN
 SELECT company_id INTO c FROM public.company_members WHERE id=_member_id AND user_id=auth.uid() AND status='attivo';
 IF c IS NULL OR NOT public.preparation_actor_allowed(c) THEN RAISE EXCEPTION 'PREP_FORBIDDEN'; END IF;
 SELECT jsonb_build_object('companyId',c,'members', coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'name',coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Operatore')) ORDER BY m.id) FROM public.company_members m LEFT JOIN public.profiles p ON p.user_id=m.user_id WHERE m.company_id=c AND m.status='attivo' AND EXISTS (SELECT 1 FROM public.company_member_roles mr WHERE mr.member_id=m.id AND mr.company_id=c AND mr.role IN ('amministratore','operatore'))),'[]'::jsonb), 'orders',coalesce((
 SELECT jsonb_agg(jsonb_build_object('id',o.id,'number',o.number,'customer',coalesce(b.legal_name,'Cliente'),'deliveryDate',o.delivery_date,'timeFrom',o.delivery_time_from,'timeTo',o.delivery_time_to,'address',o.delivery_address_text,'notes',coalesce(o.supplier_notes,o.notes),'exportedAt',o.danea_exported_at,'status',o.status,'sourceSignature',public.preparation_order_signature(o.id),'version',coalesce(op.version,0),'assignedMemberId',op.assigned_member_id,'readyAt',op.ready_at,
 'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'name',i.product_name,'code',i.product_code,'requested',i.purchase_quantity,'unitId',i.purchase_unit_id,'unit',i.purchase_unit_code,'notes',i.notes,'sellerProductId',l.b2b_item_id,'prepared',pl.prepared_quantity,'weight',pl.effective_weight_kg,'state',coalesce(pl.state,'pending'),'version',coalesce(pl.version,0),'confirmedBy',pl.confirmed_by,'confirmedAt',pl.confirmed_at,'sourceChanged',pl.item_id IS NOT NULL AND pl.source_signature <> md5(to_jsonb(i)::text)) ORDER BY i.created_at,i.id) FROM public.purchase_order_items i LEFT JOIN public.product_supplier_links l ON l.id=i.product_supplier_link_id LEFT JOIN public.order_preparation_lines pl ON pl.item_id=i.id WHERE i.order_id=o.id),'[]'::jsonb),
 'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'itemId',e.item_id,'action',e.action,'actorUserId',e.actor_user_id,'actor',coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Operatore'),'assignedMemberId',e.assigned_member_id,'before',e.before_data,'after',e.after_data,'at',e.created_at) ORDER BY e.created_at DESC,e.id) FROM public.order_preparation_events e LEFT JOIN public.profiles p ON p.user_id=e.actor_user_id WHERE e.order_id=o.id),'[]'::jsonb)) ORDER BY o.delivery_date NULLS LAST,o.sent_at DESC)
 FROM public.purchase_orders o JOIN public.supplier_customer_relations r ON r.id=o.relation_id LEFT JOIN public.companies b ON b.id=o.company_id LEFT JOIN public.order_preparations op ON op.order_id=o.id
 WHERE r.seller_company_id=c AND r.status='attivo' AND r.seller_enabled AND r.buyer_enabled AND o.sent_at IS NOT NULL AND o.status IN ('inviato','parzialmente_consegnato')
 ),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.preparation_bundle(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preparation_bundle(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.manage_order_preparation(_order_id uuid, _action text, _source_signature text, _version integer, _item_id uuid DEFAULT NULL, _line_version integer DEFAULT NULL, _assigned_member_id uuid DEFAULT NULL, _quantity numeric DEFAULT NULL, _weight_kg numeric DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c uuid; o public.purchase_orders; p public.order_preparations; i public.purchase_order_items; ln public.order_preparation_lines; old_data jsonb; new_data jsonb; s text;
BEGIN
 c := public.order_supplier_company(_order_id);
 IF c IS NULL OR NOT public.preparation_actor_allowed(c) THEN RAISE EXCEPTION 'PREP_FORBIDDEN'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('danea_orders:'||c::text));
 SELECT * INTO o FROM public.purchase_orders WHERE id=_order_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.supplier_customer_relations r WHERE r.id=o.relation_id AND r.seller_company_id=c AND r.status='attivo' AND r.seller_enabled AND r.buyer_enabled) THEN RAISE EXCEPTION 'PREP_FORBIDDEN'; END IF;
 IF o.danea_exported_at IS NOT NULL OR o.sent_at IS NULL OR o.status NOT IN ('inviato','parzialmente_consegnato') THEN RAISE EXCEPTION 'PREP_LOCKED'; END IF;
 PERFORM 1 FROM public.purchase_order_items WHERE order_id=o.id ORDER BY id FOR UPDATE;
 s := public.preparation_order_signature(o.id);
 IF s IS DISTINCT FROM _source_signature THEN RAISE EXCEPTION 'PREP_SOURCE_CHANGED'; END IF;
 SELECT * INTO p FROM public.order_preparations WHERE order_id=o.id FOR UPDATE;
 IF p.ready_at IS NOT NULL THEN RAISE EXCEPTION 'PREP_READY'; END IF;
 IF _action NOT IN ('assign','confirm','missing','unlock','ready') THEN RAISE EXCEPTION 'PREP_INVALID_ACTION'; END IF;
 IF _action IN ('assign','ready') AND coalesce(p.version,0) IS DISTINCT FROM _version THEN RAISE EXCEPTION 'PREP_CONFLICT'; END IF;
 IF _action='assign' AND _assigned_member_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.company_members m JOIN public.company_member_roles mr ON mr.member_id=m.id AND mr.company_id=m.company_id WHERE m.id=_assigned_member_id AND m.company_id=c AND m.status='attivo' AND mr.role IN ('amministratore','operatore')) THEN RAISE EXCEPTION 'PREP_INVALID_MEMBER'; END IF;
 IF _action IN ('confirm','missing','unlock') THEN
  SELECT * INTO i FROM public.purchase_order_items WHERE id=_item_id AND order_id=o.id;
  IF i.id IS NULL THEN RAISE EXCEPTION 'PREP_INVALID_LINE'; END IF;
  SELECT * INTO ln FROM public.order_preparation_lines WHERE item_id=i.id FOR UPDATE;
  IF coalesce(ln.version,0) IS DISTINCT FROM _line_version THEN RAISE EXCEPTION 'PREP_CONFLICT'; END IF;
  IF _action IN ('confirm','missing') AND ln.state IN ('confirmed','missing') THEN RAISE EXCEPTION 'PREP_LINE_LOCKED'; END IF;
  IF _action='unlock' AND (ln.item_id IS NULL OR ln.state='pending') THEN RAISE EXCEPTION 'PREP_LINE_LOCKED'; END IF;
  IF _action='confirm' AND (i.purchase_quantity IS NULL OR i.purchase_unit_code IS NULL OR i.purchase_unit_id IS NULL OR _quantity IS NULL OR _quantity <= 0 OR _quantity >= 'Infinity'::numeric OR (_weight_kg IS NOT NULL AND (_weight_kg <= 0 OR _weight_kg >= 'Infinity'::numeric))) THEN RAISE EXCEPTION 'PREP_INVALID_QUANTITY'; END IF;
 END IF;
 IF _action='ready' THEN
  IF p.assigned_member_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.company_members m JOIN public.company_member_roles mr ON mr.member_id=m.id AND mr.company_id=m.company_id WHERE m.id=p.assigned_member_id AND m.company_id=c AND m.status='attivo' AND mr.role IN ('amministratore','operatore')) THEN RAISE EXCEPTION 'PREP_INVALID_MEMBER'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.purchase_order_items WHERE order_id=o.id) OR EXISTS(SELECT 1 FROM public.purchase_order_items x LEFT JOIN public.order_preparation_lines pl ON pl.item_id=x.id WHERE x.order_id=o.id AND (pl.item_id IS NULL OR pl.state='pending' OR pl.source_signature<>md5(to_jsonb(x)::text))) THEN RAISE EXCEPTION 'PREP_INCOMPLETE'; END IF;
 END IF;
 -- All rejections above precede the first write; failures below raise and roll back.
 INSERT INTO public.order_preparations(order_id,company_id) VALUES(o.id,c) ON CONFLICT(order_id) DO NOTHING;
 SELECT * INTO p FROM public.order_preparations WHERE order_id=o.id FOR UPDATE;
 old_data := to_jsonb(p);
 IF _action='assign' THEN
  UPDATE public.order_preparations SET assigned_member_id=_assigned_member_id,version=version+1,updated_at=now() WHERE order_id=o.id RETURNING to_jsonb(order_preparations.*) INTO new_data;
 ELSIF _action='ready' THEN
  UPDATE public.order_preparations SET ready_at=now(),ready_by=auth.uid(),version=version+1,updated_at=now() WHERE order_id=o.id RETURNING to_jsonb(order_preparations.*) INTO new_data;
 ELSE
  old_data := CASE WHEN ln.item_id IS NULL THEN NULL ELSE to_jsonb(ln) END;
  INSERT INTO public.order_preparation_lines(item_id,order_id,company_id,requested_quantity,unit_id,unit_code,prepared_quantity,effective_weight_kg,state,source_signature,version,confirmed_by,confirmed_at)
  VALUES(i.id,o.id,c,i.purchase_quantity,i.purchase_unit_id,i.purchase_unit_code,CASE WHEN _action='confirm' THEN _quantity ELSE NULL END,CASE WHEN _action='confirm' THEN _weight_kg ELSE NULL END,CASE _action WHEN 'confirm' THEN 'confirmed' WHEN 'missing' THEN 'missing' ELSE 'pending' END,md5(to_jsonb(i)::text),coalesce(ln.version,0)+1,CASE WHEN _action<>'unlock' THEN auth.uid() END,CASE WHEN _action<>'unlock' THEN now() END)
  ON CONFLICT(item_id) DO UPDATE SET requested_quantity=EXCLUDED.requested_quantity,unit_id=EXCLUDED.unit_id,unit_code=EXCLUDED.unit_code,prepared_quantity=EXCLUDED.prepared_quantity,effective_weight_kg=EXCLUDED.effective_weight_kg,state=EXCLUDED.state,source_signature=EXCLUDED.source_signature,version=EXCLUDED.version,confirmed_by=EXCLUDED.confirmed_by,confirmed_at=EXCLUDED.confirmed_at,updated_at=now()
  RETURNING to_jsonb(order_preparation_lines.*) INTO new_data;
  UPDATE public.order_preparations SET version=version+1,updated_at=now() WHERE order_id=o.id;
 END IF;
 INSERT INTO public.order_preparation_events(order_id,company_id,item_id,action,actor_user_id,assigned_member_id,before_data,after_data) VALUES(o.id,c,CASE WHEN _action IN ('confirm','missing','unlock') THEN i.id END,_action,auth.uid(),CASE WHEN _action='assign' THEN _assigned_member_id ELSE p.assigned_member_id END,old_data,new_data);
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.manage_order_preparation(uuid,text,text,integer,uuid,integer,uuid,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_order_preparation(uuid,text,text,integer,uuid,integer,uuid,numeric,numeric) TO authenticated, service_role;
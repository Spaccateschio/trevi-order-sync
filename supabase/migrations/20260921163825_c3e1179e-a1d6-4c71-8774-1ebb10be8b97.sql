-- 1. decide_proposed_update: re-validate ownership and allowed fields
CREATE OR REPLACE FUNCTION public.decide_proposed_update(_proposal_id uuid, _accept boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _p public.customer_record_proposed_updates;
  _allowed text[] := ARRAY[
    'legal_name','vat_number','tax_code','email','phone','address_line','postal_code',
    'city','province','delivery_address_line','delivery_postal_code','delivery_city',
    'delivery_province','delivery_notes','notes','contact_name'
  ];
BEGIN
  SELECT * INTO _p FROM public.customer_record_proposed_updates WHERE id = _proposal_id;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'Proposta non trovata'; END IF;
  IF _uid IS NULL OR NOT public.is_company_admin(_p.seller_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda venditrice';
  END IF;
  IF _p.status <> 'in_attesa' THEN RAISE EXCEPTION 'Proposta già gestita'; END IF;

  IF _accept THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.customer_records cr
      WHERE cr.id = _p.customer_record_id
        AND cr.seller_company_id = _p.seller_company_id
    ) THEN
      RAISE EXCEPTION 'La scheda cliente non appartiene a questa azienda';
    END IF;
    IF _p.field_name IS NULL OR NOT (_p.field_name = ANY(_allowed)) THEN
      RAISE EXCEPTION 'Campo non modificabile: %', coalesce(_p.field_name, '(vuoto)');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = 'customer_records'
        AND c.column_name = _p.field_name
    ) THEN
      RAISE EXCEPTION 'Campo inesistente: %', _p.field_name;
    END IF;
    EXECUTE format('UPDATE public.customer_records SET %I = $1 WHERE id = $2 AND seller_company_id = $3', _p.field_name)
    USING _p.proposed_value, _p.customer_record_id, _p.seller_company_id;
  END IF;

  UPDATE public.customer_record_proposed_updates
  SET status = CASE WHEN _accept THEN 'accettato'::public.proposed_update_status
                    ELSE 'rifiutato'::public.proposed_update_status END,
      decided_at = now(), decided_by = _uid
  WHERE id = _proposal_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_p.seller_company_id, _uid,
          CASE WHEN _accept THEN 'customer_record.update_accepted' ELSE 'customer_record.update_rejected' END,
          'customer_record', _p.customer_record_id,
          jsonb_build_object('field', _p.field_name, 'proposed_value', _p.proposed_value));
END;
$function$;

-- 1b. lock the proposal payload: admins may only decide, never redirect a proposal
CREATE OR REPLACE FUNCTION public.guard_proposed_update_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('role', true) IN ('service_role') THEN
    RETURN NEW;
  END IF;
  IF NEW.customer_record_id IS DISTINCT FROM OLD.customer_record_id
     OR NEW.seller_company_id IS DISTINCT FROM OLD.seller_company_id
     OR NEW.field_name IS DISTINCT FROM OLD.field_name
     OR NEW.proposed_value IS DISTINCT FROM OLD.proposed_value
     OR NEW.current_value IS DISTINCT FROM OLD.current_value
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.proposed_by IS DISTINCT FROM OLD.proposed_by THEN
    RAISE EXCEPTION 'La proposta non è modificabile: è possibile solo accettarla o rifiutarla';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_proposed_update_columns ON public.customer_record_proposed_updates;
CREATE TRIGGER guard_proposed_update_columns
BEFORE UPDATE ON public.customer_record_proposed_updates
FOR EACH ROW EXECUTE FUNCTION public.guard_proposed_update_columns();

-- 2. partner-visible addresses limited to business-facing addresses
DROP POLICY IF EXISTS "Indirizzi visibili a proprietari e partner autorizzati" ON public.addresses;
CREATE POLICY "Indirizzi visibili a proprietari e partner autorizzati"
ON public.addresses FOR SELECT TO authenticated
USING (
  ((company_id IS NOT NULL) AND public.is_company_member(company_id))
  OR public.owns_customer_record(customer_record_id)
  OR public.owns_supplier_record(supplier_record_id)
  OR (
    coalesce(visible_to_partners, false)
    AND public.can_read_company_address(company_id, visible_to_partners)
    AND EXISTS (
      SELECT 1 FROM public.address_functions af
      WHERE af.address_id = addresses.id
        AND af.function IN ('sede_legale','sede_operativa','consegna','ritiro')
    )
  )
);

DROP POLICY IF EXISTS "Funzioni indirizzo leggibili con l'indirizzo" ON public.address_functions;
CREATE POLICY "Funzioni indirizzo leggibili con l'indirizzo"
ON public.address_functions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.addresses a
    WHERE a.id = address_functions.address_id
      AND (
        ((a.company_id IS NOT NULL) AND public.is_company_member(a.company_id))
        OR public.owns_customer_record(a.customer_record_id)
        OR public.owns_supplier_record(a.supplier_record_id)
        OR (
          coalesce(a.visible_to_partners, false)
          AND public.can_read_company_address(a.company_id, a.visible_to_partners)
          AND address_functions.function IN ('sede_legale','sede_operativa','consegna','ritiro')
        )
      )
  )
);

-- 3. operational tables: writes only through vetted functions / service role
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inventory_counts','inventory_movements','inventory_adjustments','inventory_sessions',
    'inventory_session_products','stock_lots','stock_lot_reconciliations',
    'goods_receipts','goods_receipt_items','purchase_deliveries','purchase_delivery_items',
    'purchase_delivery_disputes','purchase_delivery_line_events','purchase_orders','purchase_order_items',
    'purchase_order_share_links','shopping_lists','shopping_list_items','shopping_list_item_suppliers',
    'product_images','product_prices','product_supplier_links','product_supplier_link_units',
    'product_supplier_costs','product_danea_supplier_matches','product_stock_settings',
    'danea_sync_issues','danea_sync_runs','danea_archives','danea_price_lists','danea_stations',
    'audit_events','customer_record_proposed_updates','company_invitations'
  ]
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- 4. storage: product images readable only by members of the owning company
DROP POLICY IF EXISTS "Immagini prodotto leggibili dai membri dell'azienda" ON storage.objects;
CREATE POLICY "Immagini prodotto leggibili dai membri dell'azienda"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.is_company_member(((storage.foldername(name))[1])::uuid)
);

-- 5. SECURITY DEFINER functions: least privilege on EXECUTE
DO $$
DECLARE
  r record;
  keep text[] := ARRAY[
    'manage_product_supplier_link','set_relation_side_enabled','is_company_admin','decide_company_relation',
    'resend_customer_invitation','product_supplier_overview','manage_supplier_record','manage_product_supplier_link_unit',
    'manage_customer_record','submit_purchase_delivery','set_purchase_delivery_item','revoke_company_relation',
    'open_purchase_delivery','manage_supplier_record_status','manage_customer_record_status','manage_customer_destination',
    'create_customer_invitation','cancel_customer_invitation','sync_danea_product_supplier_links','start_general_inventory',
    'shopping_list_overview','set_supplier_delivery_schedule','set_shopping_list_item_quantity',
    'set_product_supplier_delivery_schedule','set_product_image','set_product_commercial_availability',
    'set_goods_receipt_item','set_default_price_list','set_customer_price_list','set_company_capabilities',
    'search_companies','revoke_order_share_link','resolve_purchase_delivery_dispute','resolve_lot_reconciliation',
    'resolve_default_price_list','resolve_danea_supplier_match','request_supplier_relation','remove_shopping_list_item',
    'remove_product_image','register_company','record_inventory_count','record_inventory_adjustment',
    'purchase_order_overview','product_stock_overview','product_lot_reconciliation','product_lot_availability',
    'open_lot_reconciliation','open_goods_receipt','next_internal_product_code','manage_unit_of_measure',
    'manage_supplier_destination','manage_shopping_list','manage_purchase_order','manage_product_stock_settings',
    'manage_inventory_session','manage_inventory_location','manage_company_product_favorite','is_company_member',
    'invite_customer_relation','invitation_preview','inventory_session_rows','inventory_session_progress',
    'inventory_requirements','inventory_location_stock_list','inventory_location_stock','external_order_snapshot',
    'ensure_internal_archive','ensure_default_inventory_location','dispute_purchase_delivery_item','delivery_comparison',
    'decide_proposed_update','create_purchase_orders_from_list','create_order_share_link','create_free_invitation',
    'confirm_goods_receipt','company_sells','company_buys','close_general_inventory','buyer_catalog_prices',
    'assign_shopping_list_supplier','apply_product_sale_unit_batch','add_shopping_list_items',
    'add_purchase_delivery_extra_item','accept_purchase_delivery','accept_invitation_with_new_company',
    'accept_invitation_code','accept_customer_invitation','add_catalog_product_to_own_products',
    'manage_internal_product','apply_product_sale_unit_batch','customer_record_match_suggestions',
    'link_customer_record_to_relation','link_supplier_record_to_relation','compute_purchase_need',
    'available_buyers','available_suppliers','goods_receipt_history','delivery_comparison','company_exists_for_vat',
    'can_declare_on_order','can_view_seller_catalogue','next_document_number'
  ];
  expr text;
BEGIN
  SELECT coalesce(string_agg(x, ' '), '') INTO expr FROM (
    SELECT coalesce(qual,'')||' '||coalesce(with_check,'') AS x FROM pg_policies
    UNION ALL
    SELECT definition FROM pg_views WHERE schemaname = 'public'
    UNION ALL
    SELECT pg_get_constraintdef(oid) FROM pg_constraint
    UNION ALL
    SELECT pg_get_expr(adbin, adrelid) FROM pg_attrdef
  ) s;

  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
           (p.prorettype = 'trigger'::regtype) AS is_trig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    -- never public: only the token-gated invitation preview stays anon-callable
    IF r.proname <> 'invitation_preview' THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon', r.proname, r.args);
    END IF;

    IF r.is_trig OR (NOT (r.proname = ANY(keep)) AND position(r.proname || '(' in expr) = 0) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', r.proname, r.args);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

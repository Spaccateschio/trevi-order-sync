-- 1. Anagrafica azienda unica + capacità COMPRO/VENDO
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS can_buy boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_sell boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_address_line text,
  ADD COLUMN IF NOT EXISTS delivery_postal_code text,
  ADD COLUMN IF NOT EXISTS delivery_city text,
  ADD COLUMN IF NOT EXISTS delivery_province text,
  ADD COLUMN IF NOT EXISTS delivery_notes text,
  ADD COLUMN IF NOT EXISTS created_by uuid;

UPDATE public.companies SET can_sell = true WHERE can_sell = false AND can_buy = false;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_capability_required CHECK (can_buy OR can_sell);

-- 2. Rapporti commerciali fra due aziende della stessa anagrafica
DROP POLICY IF EXISTS relations_select ON public.supplier_customer_relations;
DROP POLICY IF EXISTS relations_insert ON public.supplier_customer_relations;
DROP POLICY IF EXISTS relations_update ON public.supplier_customer_relations;
DROP POLICY IF EXISTS relations_select_member ON public.supplier_customer_relations;
DROP POLICY IF EXISTS relations_insert_customer ON public.supplier_customer_relations;
DROP POLICY IF EXISTS relations_update_admin ON public.supplier_customer_relations;
DROP POLICY IF EXISTS companies_select_member_or_customer ON public.companies;
DROP POLICY IF EXISTS customer_companies_select ON public.customer_companies;
DROP POLICY IF EXISTS customer_companies_insert_self ON public.customer_companies;
DROP POLICY IF EXISTS customer_companies_update ON public.customer_companies;
DROP POLICY IF EXISTS customer_company_users_select ON public.customer_company_users;
DROP POLICY IF EXISTS customer_company_users_insert ON public.customer_company_users;
DROP POLICY IF EXISTS customer_company_users_update ON public.customer_company_users;

ALTER TABLE public.supplier_customer_relations
  DROP CONSTRAINT IF EXISTS supplier_customer_relations_customer_company_id_fkey;

ALTER TABLE public.supplier_customer_relations
  RENAME COLUMN company_id TO seller_company_id;
ALTER TABLE public.supplier_customer_relations
  RENAME COLUMN customer_company_id TO buyer_company_id;

ALTER TABLE public.supplier_customer_relations
  ADD CONSTRAINT relations_buyer_fkey FOREIGN KEY (buyer_company_id) REFERENCES public.companies(id),
  ADD CONSTRAINT relations_not_self CHECK (seller_company_id <> buyer_company_id),
  ADD CONSTRAINT relations_unique_pair UNIQUE (seller_company_id, buyer_company_id);

-- 3. Rimozione anagrafica cliente separata (vuota) e funzioni collegate
DROP FUNCTION IF EXISTS public.register_customer_company(text, text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.customer_sees_company(uuid);
DROP FUNCTION IF EXISTS public.is_customer_owner(uuid);
DROP FUNCTION IF EXISTS public.is_customer_user(uuid);
DROP FUNCTION IF EXISTS public.supplier_admin_of_customer(uuid);
DROP FUNCTION IF EXISTS public.supplier_sees_customer(uuid);
DROP TABLE IF EXISTS public.customer_company_users;
DROP TABLE IF EXISTS public.customer_companies;
DROP TYPE IF EXISTS public.customer_user_role;

-- 4. Funzioni di capacità e di visibilità fra aziende in rapporto
CREATE OR REPLACE FUNCTION public.company_buys(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = _company_id AND c.can_buy);
$$;

CREATE OR REPLACE FUNCTION public.company_sells(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = _company_id AND c.can_sell);
$$;

CREATE OR REPLACE FUNCTION public.shares_relation_with(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.supplier_customer_relations rel
    JOIN public.company_members m
      ON (m.company_id = rel.buyer_company_id AND rel.seller_company_id = _company_id)
      OR (m.company_id = rel.seller_company_id AND rel.buyer_company_id = _company_id)
    WHERE m.user_id = auth.uid()
      AND m.status = 'attivo'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_active_relation(_seller_company_id uuid, _buyer_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.supplier_customer_relations rel
    WHERE rel.seller_company_id = _seller_company_id
      AND rel.buyer_company_id = _buyer_company_id
      AND rel.status = 'attivo'
  );
$$;

-- 5. Policy sull'anagrafica unica
CREATE POLICY companies_select_member_or_partner ON public.companies
  FOR SELECT TO authenticated
  USING (public.is_company_member(id) OR public.shares_relation_with(id));

CREATE POLICY relations_select_member ON public.supplier_customer_relations
  FOR SELECT TO authenticated
  USING (public.is_company_member(seller_company_id) OR public.is_company_member(buyer_company_id));

CREATE POLICY relations_insert_admin ON public.supplier_customer_relations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.company_sells(seller_company_id)
    AND public.company_buys(buyer_company_id)
    AND (
      (public.is_company_admin(buyer_company_id) AND origin = 'richiesta_cliente')
      OR (public.is_company_admin(seller_company_id) AND origin = 'invito_fornitore')
    )
  );

CREATE POLICY relations_update_admin ON public.supplier_customer_relations
  FOR UPDATE TO authenticated
  USING (public.is_company_admin(seller_company_id) OR public.is_company_admin(buyer_company_id))
  WITH CHECK (public.is_company_admin(seller_company_id) OR public.is_company_admin(buyer_company_id));

-- 6. Registrazione azienda con profilo di utilizzo
CREATE OR REPLACE FUNCTION public.register_company(
  _legal_name text,
  _can_buy boolean,
  _can_sell boolean,
  _vat_number text DEFAULT NULL,
  _tax_code text DEFAULT NULL,
  _email text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _address_line text DEFAULT NULL,
  _postal_code text DEFAULT NULL,
  _city text DEFAULT NULL,
  _province text DEFAULT NULL,
  _delivery_address_line text DEFAULT NULL,
  _delivery_postal_code text DEFAULT NULL,
  _delivery_city text DEFAULT NULL,
  _delivery_province text DEFAULT NULL,
  _delivery_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _company_id uuid;
  _member_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta';
  END IF;

  IF NOT (_can_buy OR _can_sell) THEN
    RAISE EXCEPTION 'Indica come userai la piattaforma';
  END IF;

  IF coalesce(btrim(_legal_name), '') = '' THEN
    RAISE EXCEPTION 'La ragione sociale è obbligatoria';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.user_id = _uid AND m.status = 'attivo'
  ) THEN
    RAISE EXCEPTION 'Utente già collegato a un''azienda';
  END IF;

  INSERT INTO public.companies (
    legal_name, vat_number, tax_code, email, phone,
    address_line, postal_code, city, province,
    delivery_address_line, delivery_postal_code, delivery_city, delivery_province, delivery_notes,
    can_buy, can_sell, created_by
  ) VALUES (
    btrim(_legal_name), NULLIF(_vat_number, ''), NULLIF(_tax_code, ''), NULLIF(_email, ''), NULLIF(_phone, ''),
    NULLIF(_address_line, ''), NULLIF(_postal_code, ''), NULLIF(_city, ''), NULLIF(_province, ''),
    NULLIF(_delivery_address_line, ''), NULLIF(_delivery_postal_code, ''), NULLIF(_delivery_city, ''),
    NULLIF(_delivery_province, ''), NULLIF(_delivery_notes, ''),
    _can_buy, _can_sell, _uid
  )
  RETURNING id INTO _company_id;

  INSERT INTO public.company_members (company_id, user_id, status)
  VALUES (_company_id, _uid, 'attivo')
  RETURNING id INTO _member_id;

  INSERT INTO public.company_member_roles (member_id, company_id, role)
  VALUES (_member_id, _company_id, 'amministratore'::public.app_role);

  INSERT INTO public.company_settings (company_id, display_name)
  VALUES (_company_id, btrim(_legal_name));

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, _uid, 'company.registered', 'company', _company_id,
          jsonb_build_object('can_buy', _can_buy, 'can_sell', _can_sell));

  RETURN _company_id;
END;
$$;

-- 7. Richiesta di collegamento a un fornitore (ripetibile per più fornitori)
CREATE OR REPLACE FUNCTION public.request_supplier_relation(_seller_company_id uuid, _buyer_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _relation_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta';
  END IF;

  IF NOT public.is_company_admin(_buyer_company_id) THEN
    RAISE EXCEPTION 'Solo un amministratore della tua azienda può richiedere il collegamento';
  END IF;

  IF NOT public.company_buys(_buyer_company_id) THEN
    RAISE EXCEPTION 'La tua azienda non ha il profilo di acquisto attivo';
  END IF;

  IF NOT public.company_sells(_seller_company_id) THEN
    RAISE EXCEPTION 'L''azienda scelta non vende sulla piattaforma';
  END IF;

  IF _seller_company_id = _buyer_company_id THEN
    RAISE EXCEPTION 'Non puoi collegarti alla tua stessa azienda';
  END IF;

  SELECT id INTO _relation_id
  FROM public.supplier_customer_relations
  WHERE seller_company_id = _seller_company_id AND buyer_company_id = _buyer_company_id;

  IF _relation_id IS NOT NULL THEN
    RETURN _relation_id;
  END IF;

  INSERT INTO public.supplier_customer_relations (
    seller_company_id, buyer_company_id, status, origin, requested_by
  ) VALUES (
    _seller_company_id, _buyer_company_id, 'in_attesa', 'richiesta_cliente', _uid
  )
  RETURNING id INTO _relation_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_seller_company_id, _uid, 'relation.requested', 'relation', _relation_id,
          jsonb_build_object('buyer_company_id', _buyer_company_id));

  RETURN _relation_id;
END;
$$;

-- 8. Attivazione successiva della capacità mancante
CREATE OR REPLACE FUNCTION public.set_company_capabilities(_company_id uuid, _can_buy boolean, _can_sell boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;

  IF NOT (_can_buy OR _can_sell) THEN
    RAISE EXCEPTION 'L''azienda deve mantenere almeno un profilo attivo';
  END IF;

  UPDATE public.companies
  SET can_buy = _can_buy, can_sell = _can_sell
  WHERE id = _company_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, _uid, 'company.capabilities_changed', 'company', _company_id,
          jsonb_build_object('can_buy', _can_buy, 'can_sell', _can_sell));
END;
$$;

-- 9. Elenco dei fornitori disponibili (solo dati non sensibili)
CREATE OR REPLACE FUNCTION public.available_suppliers()
RETURNS TABLE (id uuid, legal_name text, city text, province text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.legal_name, c.city, c.province
  FROM public.companies c
  WHERE c.can_sell AND c.status = 'attivo' AND auth.uid() IS NOT NULL
  ORDER BY c.legal_name;
$$;

-- 10. Un collegamento al gestionale è ammesso solo per aziende che vendono
CREATE OR REPLACE FUNCTION public.danea_requires_selling_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.company_sells(NEW.company_id) THEN
    RAISE EXCEPTION 'Il collegamento al gestionale è disponibile solo per le aziende che vendono';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS danea_connections_require_selling ON public.danea_connections;
CREATE TRIGGER danea_connections_require_selling
  BEFORE INSERT ON public.danea_connections
  FOR EACH ROW EXECUTE FUNCTION public.danea_requires_selling_company();

-- 11. Permessi di esecuzione
REVOKE ALL ON FUNCTION public.company_buys(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.company_sells(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.shares_relation_with(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.has_active_relation(uuid, uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.available_suppliers() FROM anon, public;
REVOKE ALL ON FUNCTION public.request_supplier_relation(uuid, uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.set_company_capabilities(uuid, boolean, boolean) FROM anon, public;
REVOKE ALL ON FUNCTION public.danea_requires_selling_company() FROM anon, public;
REVOKE ALL ON FUNCTION public.register_company(text, boolean, boolean, text, text, text, text, text, text, text, text, text, text, text, text, text) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.company_buys(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_sells(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_relation_with(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_relation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.available_suppliers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_supplier_relation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_company_capabilities(uuid, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_company(text, boolean, boolean, text, text, text, text, text, text, text, text, text, text, text, text, text) TO authenticated;
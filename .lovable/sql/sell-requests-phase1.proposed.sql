-- =====================================================================
-- FASE 1 — RICHIESTE «VENDO» CON APPROVAZIONE DEL SUPER ADMIN
-- PROPOSTA, NON APPLICATA. Richiede la Fase 0 (0080) già applicata.
-- Le email (al super admin amato3380@gmail.com e all'azienda) partono dal
-- server dopo queste funzioni: qui solo stato ed esito dell'invio.
-- Nessuna funzione cancella o modifica prodotti, listini, ordini, clienti
-- o collegamenti: spegnere «Vendo» cambia solo companies.can_sell.
-- =====================================================================

DO $$ BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'SELL_REQ_ROLE: %', current_user; END IF;
  IF to_regprocedure('public._company_sell_guard()') IS NULL THEN
    RAISE EXCEPTION 'SELL_REQ_PHASE0_MISSING';
  END IF;
END $$;

-- ---------- Tabella richieste ----------
CREATE TABLE public.company_sell_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  requested_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'in_attesa'
    CHECK (status IN ('in_attesa', 'approvata', 'rifiutata', 'annullata')),
  origin text NOT NULL DEFAULT 'azienda' CHECK (origin IN ('azienda', 'registrazione')),
  decision_reason text,
  decided_by uuid,
  decided_at timestamptz,
  admin_notified_at timestamptz,      -- email al super admin accettata dal servizio
  company_notified_at timestamptz,    -- email di esito all'azienda accettata dal servizio
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX company_sell_requests_one_pending
  ON public.company_sell_requests (company_id) WHERE status = 'in_attesa';
CREATE INDEX company_sell_requests_status_idx ON public.company_sell_requests (status, created_at DESC);

REVOKE ALL ON public.company_sell_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.company_sell_requests TO authenticated;
GRANT ALL ON public.company_sell_requests TO service_role;
ALTER TABLE public.company_sell_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_sell_requests_select ON public.company_sell_requests
  FOR SELECT TO authenticated USING (public.is_company_admin(company_id));
-- Nessuna policy di scrittura: solo le funzioni qui sotto.

-- ---------- Super admin attivo (sola lettura, nessun parametro dal browser) ----------
CREATE OR REPLACE FUNCTION public._is_active_platform_super()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.platform_team_members t
    WHERE t.user_id = auth.uid() AND t.is_super AND t.status = 'attivo');
$$;

-- ---------- L'amministratore chiede «Vendo» ----------
CREATE OR REPLACE FUNCTION public.request_company_sell(_company_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _sells boolean; _id uuid;
BEGIN
  IF _uid IS NULL OR NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;
  SELECT can_sell INTO _sells FROM public.companies WHERE id = _company_id FOR UPDATE;
  IF _sells THEN RAISE EXCEPTION '«Vendo» è già attivo'; END IF;
  IF EXISTS (SELECT 1 FROM public.company_sell_requests WHERE company_id = _company_id AND status = 'in_attesa') THEN
    RAISE EXCEPTION 'Esiste già una richiesta in attesa';
  END IF;

  INSERT INTO public.company_sell_requests (company_id, requested_by)
  VALUES (_company_id, _uid) RETURNING id INTO _id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, _uid, 'company.sell_requested', 'company_sell_request', _id, '{}'::jsonb);
  RETURN _id;
END;
$$;

-- ---------- L'amministratore ritira la richiesta (nessun dato aziendale toccato) ----------
CREATE OR REPLACE FUNCTION public.cancel_company_sell_request(_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _r public.company_sell_requests;
BEGIN
  SELECT * INTO _r FROM public.company_sell_requests WHERE id = _request_id FOR UPDATE;
  IF _r.id IS NULL OR _uid IS NULL OR NOT public.is_company_admin(_r.company_id) THEN
    RAISE EXCEPTION 'Richiesta non trovata';
  END IF;
  IF _r.status <> 'in_attesa' THEN RAISE EXCEPTION 'La richiesta non è più in attesa'; END IF;

  UPDATE public.company_sell_requests
  SET status = 'annullata', decided_by = _uid, decided_at = now(), updated_at = now()
  WHERE id = _request_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_r.company_id, _uid, 'company.sell_request_cancelled', 'company_sell_request', _request_id, '{}'::jsonb);
END;
$$;

-- ---------- Il super admin decide ----------
-- Rilegge la richiesta con blocco, accetta solo «in_attesa», accende «Vendo» una volta.
-- Il contesto app.sell_approval vale solo per questa transazione e viene subito azzerato.
CREATE OR REPLACE FUNCTION public.decide_company_sell_request(_request_id uuid, _approve boolean, _reason text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _r public.company_sell_requests; _sells boolean;
BEGIN
  IF NOT public._is_active_platform_super() THEN
    RAISE EXCEPTION 'Operazione riservata al super amministratore della piattaforma';
  END IF;

  SELECT * INTO _r FROM public.company_sell_requests WHERE id = _request_id FOR UPDATE;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'Richiesta non trovata'; END IF;
  IF _r.status <> 'in_attesa' THEN RAISE EXCEPTION 'La richiesta non è più in attesa'; END IF;

  IF _approve THEN
    SELECT can_sell INTO _sells FROM public.companies WHERE id = _r.company_id FOR UPDATE;
    IF NOT coalesce(_sells, false) THEN
      PERFORM set_config('app.sell_approval', 'approved', true);
      UPDATE public.companies SET can_sell = true WHERE id = _r.company_id;
      PERFORM set_config('app.sell_approval', '', true);
    END IF;
  END IF;
  -- Rifiuto: nessuna scrittura su companies né su altri dati dell'azienda.

  UPDATE public.company_sell_requests
  SET status = CASE WHEN _approve THEN 'approvata' ELSE 'rifiutata' END,
      decision_reason = NULLIF(left(btrim(coalesce(_reason, '')), 500), ''),
      decided_by = _uid, decided_at = now(), updated_at = now()
  WHERE id = _request_id;

  INSERT INTO public.platform_audit_log (actor_user_id, action, target_company_id, detail)
  VALUES (_uid, CASE WHEN _approve THEN 'sell_request.approved' ELSE 'sell_request.rejected' END,
          _r.company_id, jsonb_build_object('request_id', _request_id, 'reason', _reason));
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_r.company_id, _uid,
          CASE WHEN _approve THEN 'company.sell_approved' ELSE 'company.sell_rejected' END,
          'company_sell_request', _request_id, '{}'::jsonb);
END;
$$;

-- ---------- Elenco per il super admin ----------
CREATE OR REPLACE FUNCTION public.platform_sell_requests()
 RETURNS TABLE(id uuid, company_id uuid, company_name text, vat_number text, requested_by_email text,
               status text, origin text, decision_reason text, decided_at timestamptz, created_at timestamptz)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public._is_active_platform_super() THEN
    RAISE EXCEPTION 'Operazione riservata al super amministratore della piattaforma';
  END IF;
  RETURN QUERY
  SELECT r.id, r.company_id, c.legal_name, c.vat_number, u.email::text, r.status, r.origin,
         r.decision_reason, r.decided_at, r.created_at
  FROM public.company_sell_requests r
  JOIN public.companies c ON c.id = r.company_id
  LEFT JOIN auth.users u ON u.id = r.requested_by
  ORDER BY (r.status = 'in_attesa') DESC, r.created_at DESC;
END;
$$;

-- ---------- Esito delle email: solo il server (service_role) ----------
CREATE OR REPLACE FUNCTION public.mark_sell_request_notified(_request_id uuid, _target text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF _target = 'admin' THEN
    UPDATE public.company_sell_requests SET admin_notified_at = now()
    WHERE id = _request_id AND admin_notified_at IS NULL;
  ELSIF _target = 'company' THEN
    UPDATE public.company_sell_requests SET company_notified_at = now()
    WHERE id = _request_id AND company_notified_at IS NULL AND status IN ('approvata', 'rifiutata');
  ELSE
    RAISE EXCEPTION 'SELL_REQ_BAD_TARGET';
  END IF;
END;
$$;

-- ---------- Registrazione: «Vendo» mai attivo alla nascita ----------
-- Identica alla versione attuale (2A) tranne: _can_sell non viene scritto;
-- chi sceglie solo «Vendo» nasce acquirente; la richiesta parte in attesa.
CREATE OR REPLACE FUNCTION public.register_company(_legal_name text, _can_buy boolean, _can_sell boolean, _vat_number text DEFAULT NULL::text, _tax_code text DEFAULT NULL::text, _email text DEFAULT NULL::text, _phone text DEFAULT NULL::text, _address_line text DEFAULT NULL::text, _postal_code text DEFAULT NULL::text, _city text DEFAULT NULL::text, _province text DEFAULT NULL::text, _delivery_address_line text DEFAULT NULL::text, _delivery_postal_code text DEFAULT NULL::text, _delivery_city text DEFAULT NULL::text, _delivery_province text DEFAULT NULL::text, _delivery_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _company_id uuid;
  _member_id uuid;
  _address_id uuid;
  _previous_mode text;
  _previous_company text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Autenticazione richiesta'; END IF;
  IF NOT (_can_buy OR _can_sell) THEN RAISE EXCEPTION 'Indica come userai la piattaforma'; END IF;
  IF coalesce(btrim(_legal_name), '') = '' THEN RAISE EXCEPTION 'La ragione sociale è obbligatoria'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('company_registration:'||_uid::text,0));

  IF EXISTS (SELECT 1 FROM public.company_members m WHERE m.user_id = _uid AND m.status = 'attivo') THEN
    RAISE EXCEPTION 'Utente già collegato a un''azienda';
  END IF;

  IF public.normalize_vat(_vat_number) IS NOT NULL
     AND public.company_exists_for_vat(_vat_number) THEN
    RAISE EXCEPTION 'Esiste già un''azienda registrata con questa partita IVA: chiedi al suo amministratore di aggiungerti, oppure verifica il dato inserito';
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
    true, false, _uid
  ) RETURNING id INTO _company_id;

  PERFORM public._collaboration_lock(_company_id);
  _previous_mode:=coalesce(current_setting('app.collaboration_mode',true),'');
  _previous_company:=coalesce(current_setting('app.collaboration_company',true),'');
  PERFORM set_config('app.collaboration_company',_company_id::text,true);
  PERFORM set_config('app.collaboration_mode','bootstrap',true);

  INSERT INTO public.company_members (company_id, user_id, status)
  VALUES (_company_id, _uid, 'attivo') RETURNING id INTO _member_id;

  INSERT INTO public.company_member_roles (member_id, company_id, role)
  VALUES (_member_id, _company_id, 'amministratore'::public.app_role);

  PERFORM set_config('app.collaboration_mode',_previous_mode,true);
  PERFORM set_config('app.collaboration_company',_previous_company,true);

  INSERT INTO public.company_settings (company_id, display_name)
  VALUES (_company_id, btrim(_legal_name));

  IF coalesce(NULLIF(_address_line, ''), NULLIF(_city, '')) IS NOT NULL THEN
    INSERT INTO public.addresses (company_id, label, address_line, postal_code, city, province, phone, created_by)
    VALUES (_company_id, 'Sede legale', NULLIF(_address_line, ''), NULLIF(_postal_code, ''),
            NULLIF(_city, ''), NULLIF(_province, ''), NULLIF(_phone, ''), _uid)
    RETURNING id INTO _address_id;
    INSERT INTO public.address_functions (address_id, function, is_default)
    VALUES (_address_id, 'sede_legale', true);
  END IF;

  IF coalesce(NULLIF(_delivery_address_line, ''), NULLIF(_delivery_city, '')) IS NOT NULL THEN
    INSERT INTO public.addresses (company_id, label, address_line, postal_code, city, province, notes, created_by)
    VALUES (_company_id, 'Consegna', NULLIF(_delivery_address_line, ''), NULLIF(_delivery_postal_code, ''),
            NULLIF(_delivery_city, ''), NULLIF(_delivery_province, ''), NULLIF(_delivery_notes, ''), _uid)
    RETURNING id INTO _address_id;
    INSERT INTO public.address_functions (address_id, function, is_default)
    VALUES (_address_id, 'consegna', true);
  END IF;

  IF _can_sell THEN
    INSERT INTO public.company_sell_requests (company_id, requested_by, origin)
    VALUES (_company_id, _uid, 'registrazione');
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, _uid, 'company.registered', 'company', _company_id,
          jsonb_build_object('can_buy', true, 'can_sell', false, 'sell_requested', _can_sell));

  RETURN _company_id;
END;
$function$;

-- ---------- Proprietari ed EXECUTE minimi ----------
ALTER TABLE public.company_sell_requests OWNER TO postgres;
ALTER FUNCTION public._is_active_platform_super() OWNER TO postgres;
ALTER FUNCTION public.request_company_sell(uuid) OWNER TO postgres;
ALTER FUNCTION public.cancel_company_sell_request(uuid) OWNER TO postgres;
ALTER FUNCTION public.decide_company_sell_request(uuid, boolean, text) OWNER TO postgres;
ALTER FUNCTION public.platform_sell_requests() OWNER TO postgres;
ALTER FUNCTION public.mark_sell_request_notified(uuid, text) OWNER TO postgres;
ALTER FUNCTION public.register_company(text,boolean,boolean,text,text,text,text,text,text,text,text,text,text,text,text,text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public._is_active_platform_super() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.request_company_sell(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_company_sell(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_company_sell_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_company_sell_request(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.decide_company_sell_request(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_company_sell_request(uuid, boolean, text) TO authenticated;
REVOKE ALL ON FUNCTION public.platform_sell_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_sell_requests() TO authenticated;
REVOKE ALL ON FUNCTION public.mark_sell_request_notified(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_sell_request_notified(uuid, text) TO service_role;

-- ---------- Controllo finale ----------
DO $$
DECLARE _f text;
BEGIN
  FOREACH _f IN ARRAY ARRAY[
    'public._is_active_platform_super()', 'public.request_company_sell(uuid)',
    'public.cancel_company_sell_request(uuid)', 'public.decide_company_sell_request(uuid,boolean,text)',
    'public.platform_sell_requests()', 'public.mark_sell_request_notified(uuid,text)',
    'public.register_company(text,boolean,boolean,text,text,text,text,text,text,text,text,text,text,text,text,text)'] LOOP
    IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = _f::regprocedure) <> 'postgres'
       OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = _f::regprocedure)
       OR has_function_privilege('anon', _f, 'EXECUTE') THEN
      RAISE EXCEPTION 'SELL_REQ_FINAL_FN: %', _f;
    END IF;
  END LOOP;
  IF has_function_privilege('authenticated', 'public.mark_sell_request_notified(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._is_active_platform_super()', 'EXECUTE') THEN
    RAISE EXCEPTION 'SELL_REQ_FINAL_EXEC_SCOPE';
  END IF;
  IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'public.company_sell_requests'::regclass) <> 'postgres'
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.company_sell_requests'::regclass)
     OR has_table_privilege('anon', 'public.company_sell_requests', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
     OR has_table_privilege('authenticated', 'public.company_sell_requests', 'INSERT,UPDATE,DELETE,TRUNCATE') THEN
    RAISE EXCEPTION 'SELL_REQ_FINAL_TABLE';
  END IF;
END $$;

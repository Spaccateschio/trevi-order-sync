-- PROPOSTA 2A: NON APPLICATA. Nessun INSERT di titolari o dati operativi.
-- Eseguire solo dopo approvazione integrale; non collocare nelle migrazioni ora.

CREATE TABLE public.company_ownerships (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE RESTRICT,
  owner_member_id uuid NOT NULL UNIQUE REFERENCES public.company_members(id) ON DELETE RESTRICT,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.company_ownerships TO authenticated;
GRANT ALL ON public.company_ownerships TO service_role;
ALTER TABLE public.company_ownerships ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.company_collaboration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  actor_user_id uuid,
  actor_kind text NOT NULL,
  subject_member_id uuid REFERENCES public.company_members(id) ON DELETE RESTRICT,
  action text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.company_collaboration_events TO authenticated;
GRANT ALL ON public.company_collaboration_events TO service_role;
ALTER TABLE public.company_collaboration_events ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.is_company_owner(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_ownerships o
    JOIN public.company_members m ON m.id=o.owner_member_id AND m.company_id=o.company_id
    JOIN public.company_member_roles r ON r.member_id=m.id AND r.company_id=m.company_id
    WHERE o.company_id=_company_id AND m.user_id=auth.uid()
      AND m.status='attivo' AND r.role='amministratore'::public.app_role
  );
$$;
REVOKE ALL ON FUNCTION public.is_company_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_company_owner(uuid) TO authenticated, service_role;

CREATE POLICY company_ownerships_read_member ON public.company_ownerships
FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY company_collaboration_events_read_admin ON public.company_collaboration_events
FOR SELECT TO authenticated USING (public.is_company_admin(company_id));

-- Chiudere le scritture dirette senza eliminare policy o FK preesistenti.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON public.company_members, public.company_member_roles FROM PUBLIC, anon, authenticated;
-- Le policy di scrittura restano documentate, ma diventano inoperative per il browser.
-- Anche la scrittura privilegiata diretta deve passare dai guard: service_role non
-- soddisfa il controllo current_user del trigger, pur avendo i grant amministrativi.

CREATE FUNCTION public._collaboration_lock(_company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _company_id IS NULL THEN RAISE EXCEPTION 'COLLAB_COMPANY_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('company_collaboration:'||_company_id::text,0));
END;
$$;
REVOKE ALL ON FUNCTION public._collaboration_lock(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Guard volutamente SECURITY INVOKER: deve distinguere il ruolo SQL del
-- chiamante da quello della funzione privilegiata. SECURITY DEFINER qui renderebbe
-- current_user sempre il proprietario e consentirebbe di falsificare il flag.
CREATE FUNCTION public._collaboration_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  _company uuid;
  _mode text := current_setting('app.collaboration_mode',true);
  _member public.company_members;
  _admin boolean;
BEGIN
  IF current_user <> pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.company_members'::regclass))
     OR coalesce(_mode,'') NOT IN ('manage','bootstrap','initialize') THEN
    RAISE EXCEPTION 'COLLAB_RPC_REQUIRED';
  END IF;
  IF TG_OP='DELETE' THEN _company:=OLD.company_id; ELSE _company:=NEW.company_id; END IF;
  IF _company::text IS DISTINCT FROM current_setting('app.collaboration_company',true) THEN
    RAISE EXCEPTION 'COLLAB_CONTEXT_MISMATCH';
  END IF;
  -- Tutti i writer ammessi prendono questo lock prima di qualunque DML di riga.
  -- Riacquisizione reentrante: non cambia l'ordine già stabilito dal writer.
  PERFORM public._collaboration_lock(_company);
  IF TG_TABLE_NAME='company_ownerships' THEN
    IF _mode<>'initialize' OR TG_OP<>'INSERT' THEN RAISE EXCEPTION 'COLLAB_OWNER_IMMUTABLE'; END IF;
    SELECT * INTO _member FROM public.company_members WHERE id=NEW.owner_member_id;
    IF _member.id IS NULL OR _member.company_id<>NEW.company_id OR _member.status<>'attivo'
       OR NOT EXISTS(SELECT 1 FROM public.company_member_roles WHERE member_id=_member.id
         AND company_id=_company AND role='amministratore') THEN
      RAISE EXCEPTION 'COLLAB_INVALID_OWNER';
    END IF;
    IF NEW.assigned_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'COLLAB_INVALID_ASSIGNMENT_ACTOR'; END IF;
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'COLLAB_AUTH_REQUIRED'; END IF;
  IF TG_TABLE_NAME='company_members' THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'COLLAB_MEMBERSHIP_DELETE_FORBIDDEN'; END IF;
    IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.company_id<>OLD.company_id OR NEW.user_id<>OLD.user_id) THEN
      RAISE EXCEPTION 'COLLAB_MEMBERSHIP_IDENTITY_IMMUTABLE';
    END IF;
    IF TG_OP='INSERT' THEN
      IF _mode<>'bootstrap' OR NEW.user_id<>auth.uid() OR NEW.status<>'attivo'
         OR NOT EXISTS(SELECT 1 FROM public.companies WHERE id=_company AND created_by=auth.uid())
         OR EXISTS(SELECT 1 FROM public.company_members WHERE company_id=_company) THEN
        RAISE EXCEPTION 'COLLAB_MEMBERSHIP_INSERT_FORBIDDEN';
      END IF;
      RETURN NEW;
    END IF;
    IF NOT public.is_company_admin(_company) THEN RAISE EXCEPTION 'COLLAB_ADMIN_REQUIRED'; END IF;
    _admin:=EXISTS(SELECT 1 FROM public.company_member_roles WHERE member_id=OLD.id AND role='amministratore');
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF EXISTS(SELECT 1 FROM public.company_ownerships WHERE owner_member_id=OLD.id) THEN
        RAISE EXCEPTION 'COLLAB_OWNER_PROTECTED';
      END IF;
      IF _admin AND NOT public.is_company_owner(_company) THEN RAISE EXCEPTION 'COLLAB_OWNER_REQUIRED'; END IF;
      IF _admin AND OLD.status='attivo' AND NEW.status<>'attivo' AND NOT EXISTS(
        SELECT 1 FROM public.company_members m JOIN public.company_member_roles r ON r.member_id=m.id
        WHERE m.company_id=_company AND m.status='attivo' AND m.id<>OLD.id
          AND r.company_id=_company AND r.role='amministratore') THEN
        RAISE EXCEPTION 'COLLAB_LAST_ADMIN';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  -- Ruoli: UPDATE non ammesso; sostituzione controllata via DELETE/INSERT.
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'COLLAB_ROLE_UPDATE_FORBIDDEN'; END IF;
  IF TG_OP='DELETE' THEN
    SELECT * INTO _member FROM public.company_members WHERE id=OLD.member_id;
    _admin:=OLD.role='amministratore';
  ELSE
    SELECT * INTO _member FROM public.company_members WHERE id=NEW.member_id;
    _admin:=NEW.role='amministratore';
  END IF;
  IF _member.id IS NULL OR _member.company_id<>_company THEN RAISE EXCEPTION 'COLLAB_ROLE_COMPANY_MISMATCH'; END IF;
  IF _mode='bootstrap' THEN
    IF TG_OP<>'INSERT' OR NOT _admin OR _member.user_id<>auth.uid()
       OR EXISTS(SELECT 1 FROM public.company_member_roles WHERE company_id=_company)
       OR EXISTS(SELECT 1 FROM public.company_ownerships WHERE company_id=_company) THEN
      RAISE EXCEPTION 'COLLAB_INVALID_BOOTSTRAP';
    END IF;
    RETURN NEW;
  END IF;
  IF _mode<>'manage' OR NOT public.is_company_admin(_company) THEN RAISE EXCEPTION 'COLLAB_ADMIN_REQUIRED'; END IF;
  IF _admin AND NOT public.is_company_owner(_company) THEN RAISE EXCEPTION 'COLLAB_OWNER_REQUIRED'; END IF;
  IF TG_OP='DELETE' AND _admin THEN
    IF EXISTS(SELECT 1 FROM public.company_ownerships WHERE owner_member_id=_member.id) THEN
      RAISE EXCEPTION 'COLLAB_OWNER_PROTECTED';
    END IF;
    IF _member.status='attivo' AND NOT EXISTS(
      SELECT 1 FROM public.company_members m JOIN public.company_member_roles r ON r.member_id=m.id
      WHERE m.company_id=_company AND m.status='attivo' AND m.id<>_member.id
        AND r.company_id=_company AND r.role='amministratore') THEN
      RAISE EXCEPTION 'COLLAB_LAST_ADMIN';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._collaboration_guard() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public._collaboration_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE _before jsonb; _after jsonb; _company uuid; _member uuid; _actor uuid;
BEGIN
  IF TG_OP<>'INSERT' THEN _before:=to_jsonb(OLD); END IF;
  IF TG_OP<>'DELETE' THEN _after:=to_jsonb(NEW); END IF;
  IF TG_OP='UPDATE' AND (_before-'updated_at')=(_after-'updated_at') THEN RETURN NEW; END IF;
  _company:=coalesce((_after->>'company_id')::uuid,(_before->>'company_id')::uuid);
  IF TG_TABLE_NAME='company_members' THEN
    _member:=coalesce((_after->>'id')::uuid,(_before->>'id')::uuid);
  ELSIF TG_TABLE_NAME='company_member_roles' THEN
    _member:=coalesce((_after->>'member_id')::uuid,(_before->>'member_id')::uuid);
  ELSE
    _member:=( _after->>'owner_member_id')::uuid;
  END IF;
  IF TG_TABLE_NAME='company_ownerships' THEN _actor:=(_after->>'assigned_by')::uuid;
  ELSE _actor:=auth.uid(); END IF;
  IF _actor IS NULL AND TG_TABLE_NAME<>'company_ownerships' THEN RAISE EXCEPTION 'COLLAB_AUDIT_ACTOR_REQUIRED'; END IF;
  INSERT INTO public.company_collaboration_events(company_id,actor_user_id,actor_kind,subject_member_id,action,before_state,after_state)
  VALUES(_company,_actor,CASE WHEN _actor IS NULL THEN 'privileged_initialization' ELSE 'authenticated_user' END,
    _member,TG_TABLE_NAME||'.'||lower(TG_OP),_before,_after);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._collaboration_audit() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public._collaboration_history_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'COLLAB_HISTORY_IMMUTABLE'; END IF;
  IF current_user <> pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.company_members'::regclass))
     OR coalesce(current_setting('app.collaboration_mode',true),'') NOT IN ('manage','bootstrap','initialize')
     OR NEW.company_id::text IS DISTINCT FROM current_setting('app.collaboration_company',true)
     OR pg_trigger_depth()<2 THEN RAISE EXCEPTION 'COLLAB_TRUSTED_EVENT_REQUIRED'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._collaboration_history_guard() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER collaboration_members_guard BEFORE INSERT OR UPDATE OR DELETE ON public.company_members
FOR EACH ROW EXECUTE FUNCTION public._collaboration_guard();
CREATE TRIGGER collaboration_roles_guard BEFORE INSERT OR UPDATE OR DELETE ON public.company_member_roles
FOR EACH ROW EXECUTE FUNCTION public._collaboration_guard();
CREATE TRIGGER collaboration_owner_guard BEFORE INSERT OR UPDATE OR DELETE ON public.company_ownerships
FOR EACH ROW EXECUTE FUNCTION public._collaboration_guard();
CREATE TRIGGER collaboration_members_audit AFTER INSERT OR UPDATE OR DELETE ON public.company_members
FOR EACH ROW EXECUTE FUNCTION public._collaboration_audit();
CREATE TRIGGER collaboration_roles_audit AFTER INSERT OR UPDATE OR DELETE ON public.company_member_roles
FOR EACH ROW EXECUTE FUNCTION public._collaboration_audit();
CREATE TRIGGER collaboration_owner_audit AFTER INSERT OR UPDATE OR DELETE ON public.company_ownerships
FOR EACH ROW EXECUTE FUNCTION public._collaboration_audit();
CREATE TRIGGER collaboration_history_guard BEFORE INSERT OR UPDATE OR DELETE ON public.company_collaboration_events
FOR EACH ROW EXECUTE FUNCTION public._collaboration_history_guard();

CREATE FUNCTION public._collaboration_no_truncate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN RAISE EXCEPTION 'COLLAB_TRUNCATE_FORBIDDEN'; END; $$;
REVOKE ALL ON FUNCTION public._collaboration_no_truncate() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER collaboration_members_no_truncate BEFORE TRUNCATE ON public.company_members
FOR EACH STATEMENT EXECUTE FUNCTION public._collaboration_no_truncate();
CREATE TRIGGER collaboration_roles_no_truncate BEFORE TRUNCATE ON public.company_member_roles
FOR EACH STATEMENT EXECUTE FUNCTION public._collaboration_no_truncate();
CREATE TRIGGER collaboration_owner_no_truncate BEFORE TRUNCATE ON public.company_ownerships
FOR EACH STATEMENT EXECUTE FUNCTION public._collaboration_no_truncate();
CREATE TRIGGER collaboration_history_no_truncate BEFORE TRUNCATE ON public.company_collaboration_events
FOR EACH STATEMENT EXECUTE FUNCTION public._collaboration_no_truncate();

CREATE FUNCTION public.manage_company_collaborator(
  _member_id uuid, _action text, _roles public.app_role[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _company uuid; _member public.company_members; _old_roles public.app_role[];
  _desired public.app_role[]; _previous_mode text; _previous_company text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'COLLAB_AUTH_REQUIRED'; END IF;
  SELECT company_id INTO _company FROM public.company_members WHERE id=_member_id;
  IF _company IS NULL OR NOT public.is_company_admin(_company) THEN RAISE EXCEPTION 'COLLAB_NOT_AUTHORIZED'; END IF;
  PERFORM public._collaboration_lock(_company);
  -- Ricontrollare i permessi dopo l'attesa: una revoca concorrente è efficace.
  IF NOT public.is_company_admin(_company) THEN RAISE EXCEPTION 'COLLAB_NOT_AUTHORIZED'; END IF;
  SELECT * INTO _member FROM public.company_members WHERE id=_member_id AND company_id=_company FOR UPDATE;
  IF _member.id IS NULL THEN RAISE EXCEPTION 'COLLAB_NOT_AUTHORIZED'; END IF;
  SELECT coalesce(array_agg(role ORDER BY role),ARRAY[]::public.app_role[]) INTO _old_roles
  FROM public.company_member_roles WHERE member_id=_member_id AND company_id=_company;
  IF _action NOT IN ('set_roles','deactivate','reactivate') OR _action IS NULL THEN RAISE EXCEPTION 'COLLAB_INVALID_ACTION'; END IF;
  IF _action<>'set_roles' AND _roles IS NOT NULL THEN RAISE EXCEPTION 'COLLAB_UNEXPECTED_ROLES'; END IF;
  IF _action='set_roles' THEN
    IF _roles IS NULL OR cardinality(_roles)=0 OR array_position(_roles,NULL) IS NOT NULL
       OR EXISTS(SELECT 1 FROM unnest(_roles) r WHERE r NOT IN ('amministratore','operatore','trasportatore')) THEN
      RAISE EXCEPTION 'COLLAB_INVALID_ROLES';
    END IF;
    SELECT array_agg(DISTINCT r ORDER BY r) INTO _desired FROM unnest(_roles) r;
    IF ('amministratore'::public.app_role=ANY(_old_roles) OR 'amministratore'::public.app_role=ANY(_desired))
       AND NOT public.is_company_owner(_company) THEN RAISE EXCEPTION 'COLLAB_OWNER_REQUIRED'; END IF;
    IF EXISTS(SELECT 1 FROM public.company_ownerships WHERE owner_member_id=_member_id)
       AND NOT ('amministratore'::public.app_role=ANY(_desired)) THEN RAISE EXCEPTION 'COLLAB_OWNER_PROTECTED'; END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM public.company_ownerships WHERE owner_member_id=_member_id) THEN RAISE EXCEPTION 'COLLAB_OWNER_PROTECTED'; END IF;
    IF 'amministratore'::public.app_role=ANY(_old_roles) AND NOT public.is_company_owner(_company) THEN
      RAISE EXCEPTION 'COLLAB_OWNER_REQUIRED';
    END IF;
  END IF;
  _previous_mode:=coalesce(current_setting('app.collaboration_mode',true),'');
  _previous_company:=coalesce(current_setting('app.collaboration_company',true),'');
  PERFORM set_config('app.collaboration_company',_company::text,true);
  PERFORM set_config('app.collaboration_mode','manage',true);
  IF _action='set_roles' THEN
    DELETE FROM public.company_member_roles WHERE member_id=_member_id AND company_id=_company AND NOT role=ANY(_desired);
    INSERT INTO public.company_member_roles(member_id,company_id,role)
    SELECT _member_id,_company,r FROM unnest(_desired) r
    WHERE NOT EXISTS(SELECT 1 FROM public.company_member_roles existing
      WHERE existing.member_id=_member_id AND existing.role=r)
    ON CONFLICT(member_id,role) DO NOTHING;
  ELSE
    UPDATE public.company_members SET status=CASE WHEN _action='deactivate' THEN 'disattivato'::public.entity_status
      ELSE 'attivo'::public.entity_status END WHERE id=_member_id AND status IS DISTINCT FROM
      CASE WHEN _action='deactivate' THEN 'disattivato'::public.entity_status ELSE 'attivo'::public.entity_status END;
  END IF;
  PERFORM set_config('app.collaboration_mode',_previous_mode,true);
  PERFORM set_config('app.collaboration_company',_previous_company,true);
  RETURN jsonb_build_object('member_id',_member_id,'company_id',_company,'action',_action);
END;
$$;
REVOKE ALL ON FUNCTION public.manage_company_collaborator(uuid,text,public.app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_company_collaborator(uuid,text,public.app_role[]) TO authenticated;

CREATE FUNCTION public.get_company_collaborators(_actor_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _company uuid; _result jsonb;
BEGIN
  SELECT company_id INTO _company FROM public.company_members
  WHERE id=_actor_member_id AND user_id=auth.uid() AND status='attivo';
  IF _company IS NULL OR NOT public.is_company_admin(_company) THEN RAISE EXCEPTION 'COLLAB_NOT_AUTHORIZED'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('member_id',m.id,'user_id',m.user_id,'status',m.status,
    'first_name',p.first_name,'last_name',p.last_name,
    'is_owner',EXISTS(SELECT 1 FROM public.company_ownerships o WHERE o.owner_member_id=m.id),
    'roles',(SELECT coalesce(jsonb_agg(r.role ORDER BY r.role),'[]'::jsonb)
      FROM public.company_member_roles r WHERE r.member_id=m.id AND r.company_id=_company)) ORDER BY m.created_at,m.id),'[]'::jsonb)
  INTO _result FROM public.company_members m LEFT JOIN public.profiles p ON p.user_id=m.user_id WHERE m.company_id=_company;
  RETURN jsonb_build_object('company_id',_company,'collaborators',_result);
END;
$$;
REVOKE ALL ON FUNCTION public.get_company_collaborators(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_collaborators(uuid) TO authenticated;

CREATE FUNCTION public.get_company_collaboration_history(_actor_member_id uuid,_before_id uuid DEFAULT NULL,_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _company uuid; _time timestamptz; _result jsonb;
BEGIN
  SELECT company_id INTO _company FROM public.company_members
  WHERE id=_actor_member_id AND user_id=auth.uid() AND status='attivo';
  IF _company IS NULL OR NOT public.is_company_admin(_company) THEN RAISE EXCEPTION 'COLLAB_NOT_AUTHORIZED'; END IF;
  IF _limit IS NULL OR _limit<1 OR _limit>100 THEN RAISE EXCEPTION 'COLLAB_INVALID_LIMIT'; END IF;
  IF _before_id IS NOT NULL THEN
    SELECT created_at INTO _time FROM public.company_collaboration_events WHERE id=_before_id AND company_id=_company;
    IF _time IS NULL THEN RAISE EXCEPTION 'COLLAB_INVALID_CURSOR'; END IF;
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC,e.id DESC),'[]'::jsonb) INTO _result
  FROM (SELECT * FROM public.company_collaboration_events WHERE company_id=_company
    AND (_before_id IS NULL OR (created_at,id)<(_time,_before_id))
    ORDER BY created_at DESC,id DESC LIMIT _limit) e;
  RETURN _result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_company_collaboration_history(uuid,uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_collaboration_history(uuid,uuid,integer) TO authenticated;

-- Inizializzazione privilegiata separata: definita, MAI chiamata da questa proposta.
-- Nessuna auto-nomina authenticated. Il consenso all'applicazione dello schema
-- non autorizza la chiamata né l'assegnazione di alcuna azienda.
CREATE FUNCTION public.initialize_company_owner(_member_id uuid,_expected_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _company uuid; _member public.company_members; _previous_mode text; _previous_company text;
BEGIN
  SELECT company_id INTO _company FROM public.company_members WHERE id=_member_id;
  IF _company IS NULL THEN RAISE EXCEPTION 'COLLAB_INVALID_OWNER'; END IF;
  PERFORM public._collaboration_lock(_company);
  SELECT * INTO _member FROM public.company_members WHERE id=_member_id FOR UPDATE;
  IF _member.user_id IS DISTINCT FROM _expected_user_id OR _member.status<>'attivo'
     OR NOT EXISTS(SELECT 1 FROM public.company_member_roles WHERE member_id=_member_id
       AND company_id=_company AND role='amministratore') THEN RAISE EXCEPTION 'COLLAB_INVALID_OWNER'; END IF;
  IF EXISTS(SELECT 1 FROM public.company_ownerships WHERE company_id=_company) THEN RAISE EXCEPTION 'COLLAB_OWNER_ALREADY_SET'; END IF;
  _previous_mode:=coalesce(current_setting('app.collaboration_mode',true),'');
  _previous_company:=coalesce(current_setting('app.collaboration_company',true),'');
  PERFORM set_config('app.collaboration_company',_company::text,true);
  PERFORM set_config('app.collaboration_mode','initialize',true);
  INSERT INTO public.company_ownerships(company_id,owner_member_id,assigned_by)
  VALUES(_company,_member_id,auth.uid());
  PERFORM set_config('app.collaboration_mode',_previous_mode,true);
  PERFORM set_config('app.collaboration_company',_previous_company,true);
END;
$$;
REVOKE ALL ON FUNCTION public.initialize_company_owner(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_company_owner(uuid,uuid) TO service_role;

-- Segue il CREATE OR REPLACE integrale di register_company: stesso comportamento
-- commerciale, aggiunta del lock e contesto bootstrap soltanto intorno ai due INSERT.
CREATE OR REPLACE FUNCTION public.register_company(
  _legal_name text, _can_buy boolean, _can_sell boolean,
  _vat_number text DEFAULT NULL, _tax_code text DEFAULT NULL, _email text DEFAULT NULL,
  _phone text DEFAULT NULL, _address_line text DEFAULT NULL, _postal_code text DEFAULT NULL,
  _city text DEFAULT NULL, _province text DEFAULT NULL,
  _delivery_address_line text DEFAULT NULL, _delivery_postal_code text DEFAULT NULL,
  _delivery_city text DEFAULT NULL, _delivery_province text DEFAULT NULL,
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
    _can_buy, _can_sell, _uid
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

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, _uid, 'company.registered', 'company', _company_id,
          jsonb_build_object('can_buy', _can_buy, 'can_sell', _can_sell));

  RETURN _company_id;
END;
$$;

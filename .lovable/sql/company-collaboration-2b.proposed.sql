-- PROPOSTA FASE 2B: NON APPLICATA. Inviti reali ai collaboratori.
-- Nessun INSERT di dati, nessun invito, nessun utente. Ruoli invariati.

DO $collaboration_2b_preflight$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'COLLAB_MIGRATION_ROLE_NOT_POSTGRES: %', current_user;
  END IF;
  IF pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.company_members'::regclass)) IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'COLLAB_MEMBERS_OWNER_NOT_POSTGRES';
  END IF;
  IF to_regprocedure('extensions.digest(text,text)') IS NULL
     OR to_regprocedure('extensions.gen_random_bytes(integer)') IS NULL THEN
    RAISE EXCEPTION 'COLLAB_PGCRYPTO_MISSING';
  END IF;
END;
$collaboration_2b_preflight$;

-- 1. Inviti (dati visibili) e segreti (solo impronta del link, mai leggibili).
CREATE TABLE public.collaborator_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  email_normalized text NOT NULL,
  roles public.app_role[] NOT NULL,
  status text NOT NULL DEFAULT 'in_attesa' CHECK (status IN ('in_attesa','accettato','revocato')),
  expires_at timestamptz NOT NULL,
  invited_by uuid NOT NULL,
  invited_by_member_id uuid NOT NULL REFERENCES public.company_members(id) ON DELETE RESTRICT,
  resend_count integer NOT NULL DEFAULT 0,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  accepted_by uuid,
  accepted_member_id uuid REFERENCES public.company_members(id) ON DELETE RESTRICT,
  accepted_at timestamptz,
  revoked_by uuid,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX collaborator_invitations_one_open
  ON public.collaborator_invitations(company_id,email_normalized) WHERE status='in_attesa';
CREATE INDEX collaborator_invitations_company ON public.collaborator_invitations(company_id,created_at);
REVOKE ALL ON public.collaborator_invitations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.collaborator_invitations TO authenticated;
GRANT ALL ON public.collaborator_invitations TO service_role;
ALTER TABLE public.collaborator_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY collaborator_invitations_read_admin ON public.collaborator_invitations
FOR SELECT TO authenticated USING (public.is_company_admin(company_id));

CREATE TABLE public.collaborator_invitation_secrets (
  invitation_id uuid PRIMARY KEY REFERENCES public.collaborator_invitations(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.collaborator_invitation_secrets FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.collaborator_invitation_secrets ENABLE ROW LEVEL SECURITY;
-- Nessuna policy: leggibile e scrivibile solo dalle funzioni 2B.

-- 2. Protezione scritture: solo dentro le funzioni 2B (stesso schema della 2A).
CREATE FUNCTION public._collaborator_invitation_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE _company uuid; _mode text := current_setting('app.collaboration_mode',true);
BEGIN
  IF current_user <> pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.company_members'::regclass))
     OR coalesce(_mode,'') NOT IN ('invite','invite_accept') THEN
    RAISE EXCEPTION 'COLLAB_RPC_REQUIRED';
  END IF;
  IF TG_TABLE_NAME='collaborator_invitations' THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'COLLAB_INVITE_DELETE_FORBIDDEN'; END IF;
    IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.company_id<>OLD.company_id
       OR NEW.email_normalized<>OLD.email_normalized OR NEW.roles<>OLD.roles OR OLD.status<>'in_attesa') THEN
      RAISE EXCEPTION 'COLLAB_INVITE_IMMUTABLE';
    END IF;
    _company:=NEW.company_id;
    IF TG_OP='UPDATE' THEN NEW.updated_at:=now(); END IF;
  ELSE
    SELECT company_id INTO _company FROM public.collaborator_invitations
    WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.invitation_id ELSE NEW.invitation_id END;
  END IF;
  IF _company::text IS DISTINCT FROM current_setting('app.collaboration_company',true) THEN
    RAISE EXCEPTION 'COLLAB_CONTEXT_MISMATCH';
  END IF;
  PERFORM public._collaboration_lock(_company);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._collaborator_invitation_guard() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER collaborator_invitations_guard BEFORE INSERT OR UPDATE OR DELETE ON public.collaborator_invitations
FOR EACH ROW EXECUTE FUNCTION public._collaborator_invitation_guard();
CREATE TRIGGER collaborator_invitation_secrets_guard BEFORE INSERT OR UPDATE OR DELETE ON public.collaborator_invitation_secrets
FOR EACH ROW EXECUTE FUNCTION public._collaborator_invitation_guard();
-- Storico: riuso dell'audit 2A (il segreto non è mai registrato).
CREATE TRIGGER collaborator_invitations_audit AFTER INSERT OR UPDATE OR DELETE ON public.collaborator_invitations
FOR EACH ROW EXECUTE FUNCTION public._collaboration_audit();
CREATE TRIGGER collaborator_invitations_no_truncate BEFORE TRUNCATE ON public.collaborator_invitations
FOR EACH STATEMENT EXECUTE FUNCTION public._collaboration_no_truncate();
CREATE TRIGGER collaborator_invitation_secrets_no_truncate BEFORE TRUNCATE ON public.collaborator_invitation_secrets
FOR EACH STATEMENT EXECUTE FUNCTION public._collaboration_no_truncate();

-- 3. Contesto di accettazione verificato dai guard 2A.
CREATE FUNCTION public._collaborator_invite_context_ok(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.collaborator_invitations i
    JOIN auth.users u ON u.id=auth.uid()
    WHERE i.id::text=current_setting('app.collaboration_invitation',true)
      AND i.company_id=_company_id AND i.status='in_attesa' AND i.expires_at>now()
      AND u.email_confirmed_at IS NOT NULL AND lower(trim(u.email))=i.email_normalized
  );
$$;
REVOKE ALL ON FUNCTION public._collaborator_invite_context_ok(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- 4. Guard 2A: aggiunte SOLO la modalità 'invite_accept' e i due rami relativi;
--    il resto è identico al testo applicato con la 0077.

CREATE OR REPLACE FUNCTION public._collaboration_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  _company uuid;
  _mode text := current_setting('app.collaboration_mode',true);
  _member public.company_members;
  _admin boolean;
BEGIN
  IF current_user <> pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.company_members'::regclass))
     OR coalesce(_mode,'') NOT IN ('manage','bootstrap','initialize','invite_accept') THEN
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
    -- 2B: accettazione invito. Solo INSERT della propria appartenenza,
    -- legata all'invito bloccato dalla funzione di accettazione.
    IF _mode='invite_accept' THEN
      IF TG_OP<>'INSERT' OR NEW.user_id<>auth.uid() OR NEW.status<>'attivo'
         OR NOT public._collaborator_invite_context_ok(_company)
         OR EXISTS(SELECT 1 FROM public.company_members WHERE company_id=_company AND user_id=auth.uid()) THEN
        RAISE EXCEPTION 'COLLAB_INVITE_MEMBERSHIP_FORBIDDEN';
      END IF;
      RETURN NEW;
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
  -- 2B: ruoli dell'invito, solo INSERT, solo sulla propria appartenenza appena creata.
  IF _mode='invite_accept' THEN
    IF TG_OP<>'INSERT' OR _member.user_id<>auth.uid() OR _member.status<>'attivo'
       OR NOT public._collaborator_invite_context_ok(_company)
       OR NOT EXISTS(SELECT 1 FROM public.collaborator_invitations i
         WHERE i.id::text=current_setting('app.collaboration_invitation',true)
           AND NEW.role=ANY(i.roles)) THEN
      RAISE EXCEPTION 'COLLAB_INVITE_ROLE_FORBIDDEN';
    END IF;
    RETURN NEW;
  END IF;
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

CREATE OR REPLACE FUNCTION public._collaboration_history_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'COLLAB_HISTORY_IMMUTABLE'; END IF;
  IF current_user <> pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.company_members'::regclass))
     OR coalesce(current_setting('app.collaboration_mode',true),'') NOT IN ('manage','bootstrap','initialize','invite','invite_accept')
     OR NEW.company_id::text IS DISTINCT FROM current_setting('app.collaboration_company',true)
     OR pg_trigger_depth()<2 THEN RAISE EXCEPTION 'COLLAB_TRUSTED_EVENT_REQUIRED'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._collaboration_history_guard() FROM PUBLIC, anon, authenticated, service_role;

-- 5. Funzioni di gestione.
CREATE FUNCTION public._collaborator_owner_company(_actor_member_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _company uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'COLLAB_AUTH_REQUIRED'; END IF;
  SELECT company_id INTO _company FROM public.company_members
  WHERE id=_actor_member_id AND user_id=auth.uid() AND status='attivo';
  IF _company IS NULL OR NOT public.is_company_owner(_company) THEN RAISE EXCEPTION 'COLLAB_OWNER_REQUIRED'; END IF;
  RETURN _company;
END;
$$;
REVOKE ALL ON FUNCTION public._collaborator_owner_company(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.create_collaborator_invitation(
  _actor_member_id uuid, _first_name text, _last_name text, _email text, _roles public.app_role[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _company uuid; _norm text; _desired public.app_role[]; _token text; _id uuid; _expires timestamptz;
  _prev_mode text; _prev_company text;
BEGIN
  _company:=public._collaborator_owner_company(_actor_member_id);
  PERFORM public._collaboration_lock(_company);
  IF NOT public.is_company_owner(_company) THEN RAISE EXCEPTION 'COLLAB_OWNER_REQUIRED'; END IF;
  _first_name:=trim(coalesce(_first_name,'')); _last_name:=trim(coalesce(_last_name,''));
  _norm:=lower(trim(coalesce(_email,'')));
  IF length(_first_name) NOT BETWEEN 1 AND 80 OR length(_last_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'COLLAB_INVITE_INVALID_NAME';
  END IF;
  IF length(_norm)>254 OR _norm !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'COLLAB_INVITE_INVALID_EMAIL'; END IF;
  IF _roles IS NULL OR cardinality(_roles)=0 OR array_position(_roles,NULL) IS NOT NULL
     OR EXISTS(SELECT 1 FROM unnest(_roles) r WHERE r NOT IN ('amministratore','operatore','trasportatore')) THEN
    RAISE EXCEPTION 'COLLAB_INVALID_ROLES';
  END IF;
  SELECT array_agg(DISTINCT r ORDER BY r) INTO _desired FROM unnest(_roles) r;
  IF EXISTS(SELECT 1 FROM public.company_members m JOIN auth.users u ON u.id=m.user_id
            WHERE m.company_id=_company AND lower(trim(u.email))=_norm) THEN
    RAISE EXCEPTION 'COLLAB_INVITE_ALREADY_MEMBER';
  END IF;
  IF EXISTS(SELECT 1 FROM public.collaborator_invitations
            WHERE company_id=_company AND email_normalized=_norm AND status='in_attesa') THEN
    RAISE EXCEPTION 'COLLAB_INVITE_ALREADY_PENDING';
  END IF;
  _token:=encode(extensions.gen_random_bytes(32),'hex');
  _expires:=now()+interval '72 hours';
  _prev_mode:=coalesce(current_setting('app.collaboration_mode',true),'');
  _prev_company:=coalesce(current_setting('app.collaboration_company',true),'');
  PERFORM set_config('app.collaboration_company',_company::text,true);
  PERFORM set_config('app.collaboration_mode','invite',true);
  INSERT INTO public.collaborator_invitations(company_id,first_name,last_name,email,email_normalized,roles,
    expires_at,invited_by,invited_by_member_id)
  VALUES(_company,_first_name,_last_name,trim(_email),_norm,_desired,_expires,auth.uid(),_actor_member_id)
  RETURNING id INTO _id;
  INSERT INTO public.collaborator_invitation_secrets(invitation_id,token_hash)
  VALUES(_id,encode(extensions.digest(_token,'sha256'),'hex'));
  PERFORM set_config('app.collaboration_mode',_prev_mode,true);
  PERFORM set_config('app.collaboration_company',_prev_company,true);
  RETURN jsonb_build_object('invitation_id',_id,'token',_token,'expires_at',_expires,'send_number',0);
END;
$$;

CREATE FUNCTION public.resend_collaborator_invitation(_actor_member_id uuid, _invitation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _company uuid; _inv public.collaborator_invitations; _token text; _expires timestamptz;
  _prev_mode text; _prev_company text;
BEGIN
  _company:=public._collaborator_owner_company(_actor_member_id);
  PERFORM public._collaboration_lock(_company);
  IF NOT public.is_company_owner(_company) THEN RAISE EXCEPTION 'COLLAB_OWNER_REQUIRED'; END IF;
  SELECT * INTO _inv FROM public.collaborator_invitations
  WHERE id=_invitation_id AND company_id=_company FOR UPDATE;
  IF _inv.id IS NULL THEN RAISE EXCEPTION 'COLLAB_INVITE_NOT_FOUND'; END IF;
  IF _inv.status<>'in_attesa' THEN RAISE EXCEPTION 'COLLAB_INVITE_NOT_PENDING'; END IF;
  IF _inv.last_sent_at>now()-interval '60 seconds' THEN RAISE EXCEPTION 'COLLAB_INVITE_RESEND_TOO_SOON'; END IF;
  IF _inv.resend_count>=10 THEN RAISE EXCEPTION 'COLLAB_INVITE_RESEND_LIMIT'; END IF;
  _token:=encode(extensions.gen_random_bytes(32),'hex');
  _expires:=now()+interval '72 hours';
  _prev_mode:=coalesce(current_setting('app.collaboration_mode',true),'');
  _prev_company:=coalesce(current_setting('app.collaboration_company',true),'');
  PERFORM set_config('app.collaboration_company',_company::text,true);
  PERFORM set_config('app.collaboration_mode','invite',true);
  -- Nuovo link: il precedente smette subito di funzionare.
  UPDATE public.collaborator_invitation_secrets
  SET token_hash=encode(extensions.digest(_token,'sha256'),'hex'), created_at=now()
  WHERE invitation_id=_inv.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'COLLAB_INVITE_SECRET_MISSING'; END IF;
  UPDATE public.collaborator_invitations
  SET expires_at=_expires, resend_count=resend_count+1, last_sent_at=now()
  WHERE id=_inv.id;
  PERFORM set_config('app.collaboration_mode',_prev_mode,true);
  PERFORM set_config('app.collaboration_company',_prev_company,true);
  RETURN jsonb_build_object('invitation_id',_inv.id,'token',_token,'expires_at',_expires,'send_number',_inv.resend_count+1);
END;
$$;

CREATE FUNCTION public.revoke_collaborator_invitation(_actor_member_id uuid, _invitation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _company uuid; _inv public.collaborator_invitations; _prev_mode text; _prev_company text;
BEGIN
  _company:=public._collaborator_owner_company(_actor_member_id);
  PERFORM public._collaboration_lock(_company);
  IF NOT public.is_company_owner(_company) THEN RAISE EXCEPTION 'COLLAB_OWNER_REQUIRED'; END IF;
  SELECT * INTO _inv FROM public.collaborator_invitations
  WHERE id=_invitation_id AND company_id=_company FOR UPDATE;
  IF _inv.id IS NULL THEN RAISE EXCEPTION 'COLLAB_INVITE_NOT_FOUND'; END IF;
  IF _inv.status<>'in_attesa' THEN RAISE EXCEPTION 'COLLAB_INVITE_NOT_PENDING'; END IF;
  _prev_mode:=coalesce(current_setting('app.collaboration_mode',true),'');
  _prev_company:=coalesce(current_setting('app.collaboration_company',true),'');
  PERFORM set_config('app.collaboration_company',_company::text,true);
  PERFORM set_config('app.collaboration_mode','invite',true);
  DELETE FROM public.collaborator_invitation_secrets WHERE invitation_id=_inv.id;
  UPDATE public.collaborator_invitations
  SET status='revocato', revoked_by=auth.uid(), revoked_at=now() WHERE id=_inv.id;
  PERFORM set_config('app.collaboration_mode',_prev_mode,true);
  PERFORM set_config('app.collaboration_company',_prev_company,true);
  RETURN jsonb_build_object('invitation_id',_inv.id,'status','revocato');
END;
$$;

CREATE FUNCTION public.get_collaborator_invitations(_actor_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _company uuid; _result jsonb;
BEGIN
  SELECT company_id INTO _company FROM public.company_members
  WHERE id=_actor_member_id AND user_id=auth.uid() AND status='attivo';
  IF _company IS NULL OR NOT public.is_company_admin(_company) THEN RAISE EXCEPTION 'COLLAB_NOT_AUTHORIZED'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'first_name',i.first_name,'last_name',i.last_name,'email',i.email,'roles',to_jsonb(i.roles),
    'status',CASE WHEN i.status='in_attesa' AND i.expires_at<=now() THEN 'scaduto' ELSE i.status END,
    'expires_at',i.expires_at,'resend_count',i.resend_count,'last_sent_at',i.last_sent_at,
    'created_at',i.created_at,'accepted_at',i.accepted_at,'revoked_at',i.revoked_at)
    ORDER BY i.created_at DESC,i.id),'[]'::jsonb)
  INTO _result FROM public.collaborator_invitations i WHERE i.company_id=_company;
  RETURN jsonb_build_object('company_id',_company,'invitations',_result);
END;
$$;

-- Anteprima del link: nessuna email completa, nessun identificativo interno.
CREATE FUNCTION public.preview_collaborator_invitation(_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _inv public.collaborator_invitations; _company_name text;
BEGIN
  IF _token IS NULL OR _token !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('status','non_valido'); END IF;
  SELECT i.* INTO _inv FROM public.collaborator_invitation_secrets s
  JOIN public.collaborator_invitations i ON i.id=s.invitation_id
  WHERE s.token_hash=encode(extensions.digest(_token,'sha256'),'hex');
  IF _inv.id IS NULL OR _inv.status<>'in_attesa' THEN RETURN jsonb_build_object('status','non_valido'); END IF;
  SELECT legal_name INTO _company_name FROM public.companies WHERE id=_inv.company_id;
  RETURN jsonb_build_object(
    'status',CASE WHEN _inv.expires_at<=now() THEN 'scaduto' ELSE 'in_attesa' END,
    'company_name',_company_name,'first_name',_inv.first_name,'roles',to_jsonb(_inv.roles),
    'email_hint',left(_inv.email_normalized,1)||'***@'||split_part(_inv.email_normalized,'@',2));
END;
$$;

CREATE FUNCTION public.accept_collaborator_invitation(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid(); _email text; _confirmed timestamptz; _inv_id uuid; _inv public.collaborator_invitations;
  _existing public.company_members; _member_id uuid; _prev_mode text; _prev_company text; _prev_inv text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'COLLAB_AUTH_REQUIRED'; END IF;
  IF _token IS NULL OR _token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'COLLAB_INVITE_INVALID'; END IF;
  SELECT lower(trim(email)),email_confirmed_at INTO _email,_confirmed FROM auth.users WHERE id=_uid;
  IF _confirmed IS NULL THEN RAISE EXCEPTION 'COLLAB_INVITE_EMAIL_NOT_VERIFIED'; END IF;
  SELECT invitation_id INTO _inv_id FROM public.collaborator_invitation_secrets
  WHERE token_hash=encode(extensions.digest(_token,'sha256'),'hex');
  IF _inv_id IS NULL THEN RAISE EXCEPTION 'COLLAB_INVITE_INVALID'; END IF;
  SELECT * INTO _inv FROM public.collaborator_invitations WHERE id=_inv_id;
  PERFORM public._collaboration_lock(_inv.company_id);
  -- Riletto dopo il blocco: revoca, reinvio o accettazione concorrenti sono efficaci.
  SELECT * INTO _inv FROM public.collaborator_invitations WHERE id=_inv_id FOR UPDATE;
  IF _inv.status<>'in_attesa' OR NOT EXISTS(
     SELECT 1 FROM public.collaborator_invitation_secrets
     WHERE invitation_id=_inv_id AND token_hash=encode(extensions.digest(_token,'sha256'),'hex')) THEN
    RAISE EXCEPTION 'COLLAB_INVITE_INVALID';
  END IF;
  IF _inv.expires_at<=now() THEN RAISE EXCEPTION 'COLLAB_INVITE_EXPIRED'; END IF;
  IF _email IS DISTINCT FROM _inv.email_normalized THEN RAISE EXCEPTION 'COLLAB_INVITE_EMAIL_MISMATCH'; END IF;
  -- Chi ha invitato deve essere ancora il titolare attivo.
  IF NOT EXISTS(SELECT 1 FROM public.company_ownerships o
     JOIN public.company_members m ON m.id=o.owner_member_id AND m.company_id=o.company_id
     JOIN public.company_member_roles r ON r.member_id=m.id AND r.company_id=m.company_id
     WHERE o.company_id=_inv.company_id AND m.id=_inv.invited_by_member_id AND m.user_id=_inv.invited_by
       AND m.status='attivo' AND r.role='amministratore') THEN
    RAISE EXCEPTION 'COLLAB_INVITE_INVITER_NOT_OWNER';
  END IF;
  SELECT * INTO _existing FROM public.company_members WHERE company_id=_inv.company_id AND user_id=_uid;
  IF _existing.id IS NOT NULL THEN
    IF _existing.status='attivo' THEN RAISE EXCEPTION 'COLLAB_INVITE_ALREADY_MEMBER'; END IF;
    RAISE EXCEPTION 'COLLAB_INVITE_MEMBER_DEACTIVATED';
  END IF;
  _prev_mode:=coalesce(current_setting('app.collaboration_mode',true),'');
  _prev_company:=coalesce(current_setting('app.collaboration_company',true),'');
  _prev_inv:=coalesce(current_setting('app.collaboration_invitation',true),'');
  PERFORM set_config('app.collaboration_company',_inv.company_id::text,true);
  PERFORM set_config('app.collaboration_invitation',_inv.id::text,true);
  PERFORM set_config('app.collaboration_mode','invite_accept',true);
  INSERT INTO public.company_members(company_id,user_id,status,invited_by)
  VALUES(_inv.company_id,_uid,'attivo',_inv.invited_by) RETURNING id INTO _member_id;
  INSERT INTO public.company_member_roles(member_id,company_id,role)
  SELECT _member_id,_inv.company_id,r FROM unnest(_inv.roles) r;
  DELETE FROM public.collaborator_invitation_secrets WHERE invitation_id=_inv.id;
  UPDATE public.collaborator_invitations
  SET status='accettato', accepted_by=_uid, accepted_member_id=_member_id, accepted_at=now()
  WHERE id=_inv.id;
  PERFORM set_config('app.collaboration_mode',_prev_mode,true);
  PERFORM set_config('app.collaboration_invitation',_prev_inv,true);
  PERFORM set_config('app.collaboration_company',_prev_company,true);
  RETURN jsonb_build_object('company_id',_inv.company_id,'member_id',_member_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_collaborator_invitation(uuid,text,text,text,public.app_role[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resend_collaborator_invitation(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_collaborator_invitation(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_collaborator_invitations(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_collaborator_invitation(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.preview_collaborator_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_collaborator_invitation(uuid,text,text,text,public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resend_collaborator_invitation(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_collaborator_invitation(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_collaborator_invitations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_collaborator_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_collaborator_invitation(text) TO anon, authenticated;

-- 6. Proprietari e verifica finale (stesso schema della 0077).
ALTER TABLE public.collaborator_invitations OWNER TO postgres;
ALTER TABLE public.collaborator_invitation_secrets OWNER TO postgres;
ALTER FUNCTION public._collaborator_invitation_guard() OWNER TO postgres;
ALTER FUNCTION public._collaborator_invite_context_ok(uuid) OWNER TO postgres;
ALTER FUNCTION public._collaboration_guard() OWNER TO postgres;
ALTER FUNCTION public._collaboration_history_guard() OWNER TO postgres;
ALTER FUNCTION public._collaborator_owner_company(uuid) OWNER TO postgres;
ALTER FUNCTION public.create_collaborator_invitation(uuid,text,text,text,public.app_role[]) OWNER TO postgres;
ALTER FUNCTION public.resend_collaborator_invitation(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.revoke_collaborator_invitation(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.get_collaborator_invitations(uuid) OWNER TO postgres;
ALTER FUNCTION public.preview_collaborator_invitation(text) OWNER TO postgres;
ALTER FUNCTION public.accept_collaborator_invitation(text) OWNER TO postgres;

DO $collaboration_2b_verify$
DECLARE _bad text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text,', ') INTO _bad FROM pg_proc p
  WHERE p.pronamespace='public'::regnamespace AND p.proname IN (
    '_collaborator_invitation_guard','_collaborator_invite_context_ok','_collaboration_guard',
    '_collaboration_history_guard','_collaborator_owner_company','create_collaborator_invitation',
    'resend_collaborator_invitation','revoke_collaborator_invitation','get_collaborator_invitations',
    'preview_collaborator_invitation','accept_collaborator_invitation')
    AND pg_get_userbyid(p.proowner)<>'postgres';
  IF _bad IS NOT NULL THEN RAISE EXCEPTION 'COLLAB_2B_FUNCTION_OWNER: %',_bad; END IF;
  SELECT string_agg(c.relname,', ') INTO _bad FROM pg_class c
  WHERE c.oid IN ('public.collaborator_invitations'::regclass,'public.collaborator_invitation_secrets'::regclass)
    AND pg_get_userbyid(c.relowner)<>'postgres';
  IF _bad IS NOT NULL THEN RAISE EXCEPTION 'COLLAB_2B_TABLE_OWNER: %',_bad; END IF;
END;
$collaboration_2b_verify$;

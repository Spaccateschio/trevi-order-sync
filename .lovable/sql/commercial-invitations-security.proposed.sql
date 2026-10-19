-- =====================================================================
-- SICUREZZA INVITI COMMERCIALI — MIGRAZIONE UNICA (PROPOSTA, NON APPLICATA)
-- Sostituisce .lovable/sql/commercial-invitation-send-limit.proposed.sql
-- Parti: A limite invii con esito | B tentativi codice breve |
--        C niente pulizia tra aziende | D impronte mai leggibili dal browser
-- Non tocca: inviti collaboratori 2B, migrazioni 0077-0079, appartenenze,
-- ruoli, accept_invitation_row, accept_customer_invitation, invitation_preview.
-- =====================================================================

-- ---------- Controllo iniziale ----------
DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'SEC_INV_ROLE: current_user=% (atteso postgres)', current_user;
  END IF;
  IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'public.company_invitations'::regclass) <> 'postgres' THEN
    RAISE EXCEPTION 'SEC_INV_OWNER: company_invitations non appartiene a postgres';
  END IF;
  IF to_regprocedure('extensions.gen_random_bytes(integer)') IS NULL
     OR to_regprocedure('extensions.digest(text,text)') IS NULL THEN
    RAISE EXCEPTION 'SEC_INV_PGCRYPTO: pgcrypto non disponibile';
  END IF;
END $$;

-- =====================================================================
-- PARTE A — Registro invii email con esito
-- =====================================================================
CREATE TABLE public.company_invitation_email_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES public.company_invitations(id),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  requested_by uuid NOT NULL,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  -- prenotato = in corso; dopo 30 minuti senza esito si legge come «esito sconosciuto»
  outcome text NOT NULL DEFAULT 'prenotato'
    CHECK (outcome IN ('prenotato', 'accettato', 'fallito', 'sconosciuto')),
  outcome_at timestamptz,
  outcome_detail text,
  receipt_hash text UNIQUE            -- impronta della ricevuta, azzerata dopo l'uso
);
CREATE INDEX company_invitation_email_sends_inv_idx
  ON public.company_invitation_email_sends (invitation_id, reserved_at DESC);

REVOKE ALL ON public.company_invitation_email_sends FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, invitation_id, company_id, requested_by, reserved_at, outcome, outcome_at)
  ON public.company_invitation_email_sends TO authenticated;
GRANT ALL ON public.company_invitation_email_sends TO service_role;
ALTER TABLE public.company_invitation_email_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_invitation_email_sends_select ON public.company_invitation_email_sends
  FOR SELECT TO authenticated USING (public.is_company_admin(company_id));
-- Nessuna policy di scrittura: solo le due funzioni qui sotto scrivono.

-- Prenotazione: sessione dell'amministratore (dal server, con context.supabase).
-- Conta nel limite: prenotato, accettato, sconosciuto. Non conta: fallito con certezza.
-- Lo spazio di 60 secondi vale per qualsiasi tentativo, anche fallito.
CREATE OR REPLACE FUNCTION public.reserve_customer_invitation_send(_invitation_id uuid, _token text)
RETURNS TABLE(send_id uuid, receipt text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _inv public.company_invitations;
  _counted int;
  _last timestamptz;
  _receipt text := encode(extensions.gen_random_bytes(32), 'hex');
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'INV_SEND_AUTH_REQUIRED'; END IF;

  -- Blocco della riga: richieste contemporanee sullo stesso invito in fila.
  SELECT * INTO _inv FROM public.company_invitations WHERE id = _invitation_id FOR UPDATE;
  IF _inv.id IS NULL THEN RAISE EXCEPTION 'INV_SEND_NOT_FOUND'; END IF;
  IF NOT public.is_company_admin(_inv.seller_company_id) THEN RAISE EXCEPTION 'INV_SEND_NOT_ADMIN'; END IF;
  IF _inv.status <> 'in_attesa' THEN RAISE EXCEPTION 'INV_SEND_NOT_PENDING'; END IF;
  IF _inv.expires_at <= now() THEN RAISE EXCEPTION 'INV_SEND_EXPIRED'; END IF;
  IF _inv.email_normalized IS NULL THEN RAISE EXCEPTION 'INV_SEND_NO_EMAIL'; END IF;
  IF _inv.token_hash IS DISTINCT FROM encode(sha256(coalesce(_token, '')::bytea), 'hex') THEN
    RAISE EXCEPTION 'INV_SEND_INVALID_TOKEN';
  END IF;

  SELECT max(reserved_at) INTO _last
  FROM public.company_invitation_email_sends WHERE invitation_id = _invitation_id;
  IF _last IS NOT NULL AND _last > now() - interval '60 seconds' THEN
    RAISE EXCEPTION 'INV_SEND_TOO_SOON';
  END IF;

  SELECT count(*) INTO _counted
  FROM public.company_invitation_email_sends
  WHERE invitation_id = _invitation_id
    AND reserved_at > now() - interval '24 hours'
    AND outcome <> 'fallito';
  IF _counted >= 5 THEN RAISE EXCEPTION 'INV_SEND_DAILY_LIMIT'; END IF;

  INSERT INTO public.company_invitation_email_sends (invitation_id, company_id, requested_by, receipt_hash)
  VALUES (_invitation_id, _inv.seller_company_id, _uid,
          encode(extensions.digest(_receipt, 'sha256'), 'hex'))
  RETURNING id INTO _id;

  RETURN QUERY SELECT _id, _receipt;
END;
$$;

-- Esito: solo il server (service_role) con la ricevuta, una volta sola, entro 30 minuti.
-- Il browser non può dichiarare «fallito» per liberare il limite.
CREATE OR REPLACE FUNCTION public.record_customer_invitation_send(
  _send_id uuid, _receipt text, _outcome text, _detail text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.company_invitation_email_sends;
BEGIN
  IF _outcome NOT IN ('accettato', 'fallito', 'sconosciuto') THEN
    RAISE EXCEPTION 'INV_SEND_BAD_OUTCOME';
  END IF;
  SELECT * INTO _row FROM public.company_invitation_email_sends WHERE id = _send_id FOR UPDATE;
  IF _row.id IS NULL OR _row.receipt_hash IS NULL
     OR _row.receipt_hash <> encode(extensions.digest(coalesce(_receipt, ''), 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'INV_SEND_BAD_RECEIPT';
  END IF;
  IF _row.outcome <> 'prenotato' THEN RAISE EXCEPTION 'INV_SEND_ALREADY_RECORDED'; END IF;
  IF _row.reserved_at < now() - interval '30 minutes' THEN RAISE EXCEPTION 'INV_SEND_RECEIPT_EXPIRED'; END IF;

  UPDATE public.company_invitation_email_sends
  SET outcome = _outcome, outcome_at = now(), outcome_detail = left(_detail, 200), receipt_hash = NULL
  WHERE id = _send_id;
END;
$$;

-- =====================================================================
-- PARTE B — Codice breve: generazione sicura e limite ai tentativi
-- Formato invariato (8 caratteri, stesso alfabeto): codici già consegnati validi.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- 32 simboli
  _bytes bytea;
  _code text;
  _i int;
BEGIN
  LOOP
    _bytes := extensions.gen_random_bytes(8);
    _code := '';
    FOR _i IN 0..7 LOOP
      -- 256 è multiplo di 32: nessuna distorsione
      _code := _code || substr(_alphabet, 1 + (get_byte(_bytes, _i) % 32), 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.company_invitations WHERE invite_code = _code);
  END LOOP;
  RETURN _code;
END;
$$;

CREATE TABLE public.invite_code_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  buyer_company_id uuid,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  succeeded boolean NOT NULL DEFAULT false
);
CREATE INDEX invite_code_attempts_user_idx ON public.invite_code_attempts (user_id, attempted_at DESC);
CREATE INDEX invite_code_attempts_company_idx ON public.invite_code_attempts (buyer_company_id, attempted_at DESC);
REVOKE ALL ON public.invite_code_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.invite_code_attempts TO service_role;
ALTER TABLE public.invite_code_attempts ENABLE ROW LEVEL SECURITY;
-- Nessuna policy: illeggibile e non scrivibile dal browser.

-- Cambiamento di comportamento: un codice inesistente NON solleva più errore
-- (altrimenti il tentativo verrebbe annullato insieme all'errore) ma restituisce NULL.
-- Limiti: 10 tentativi falliti/ora per persona, 30 falliti/giorno per azienda acquirente.
-- Rimossa la pulizia globale degli inviti scaduti di tutte le aziende (Parte C).
CREATE OR REPLACE FUNCTION public.accept_invitation_code(_code text, _buyer_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _norm text := upper(regexp_replace(coalesce(_code, ''), '[^A-Za-z0-9]', '', 'g'));
  _id uuid;
  _rel uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Autenticazione richiesta'; END IF;
  IF _norm = '' THEN RAISE EXCEPTION 'Indica il codice invito'; END IF;

  -- Tentativi della stessa persona in fila: niente sorpasso del limite in parallelo.
  PERFORM pg_advisory_xact_lock(hashtextextended('invite_code_attempt:' || _uid::text, 0));

  IF (SELECT count(*) FROM public.invite_code_attempts
       WHERE user_id = _uid AND NOT succeeded AND attempted_at > now() - interval '1 hour') >= 10
     OR (SELECT count(*) FROM public.invite_code_attempts
          WHERE buyer_company_id = _buyer_company_id AND NOT succeeded
            AND attempted_at > now() - interval '24 hours') >= 30 THEN
    RAISE EXCEPTION 'Troppi tentativi con codici non validi: riprova più tardi';
  END IF;

  SELECT id INTO _id FROM public.company_invitations WHERE invite_code = _norm;
  IF _id IS NULL THEN
    INSERT INTO public.invite_code_attempts (user_id, buyer_company_id) VALUES (_uid, _buyer_company_id);
    RETURN NULL;   -- il browser mostra «Codice invito non valido o già utilizzato»
  END IF;

  _rel := public.accept_invitation_row(_id, _buyer_company_id);
  INSERT INTO public.invite_code_attempts (user_id, buyer_company_id, succeeded)
  VALUES (_uid, _buyer_company_id, true);
  RETURN _rel;
END;
$$;

-- =====================================================================
-- PARTE D — Inviti commerciali: lettura solo amministratori, impronta mai al browser
-- =====================================================================
DROP POLICY company_invitations_select ON public.company_invitations;
CREATE POLICY company_invitations_select ON public.company_invitations
  FOR SELECT TO authenticated USING (public.is_company_admin(seller_company_id));

REVOKE ALL ON public.company_invitations FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, seller_company_id, customer_record_id, email, email_normalized, status,
              expires_at, invited_by, sent_at, resend_count, relation_id, decided_at,
              created_at, updated_at, invite_code, is_free_invite, price_list_number)
  ON public.company_invitations TO authenticated;   -- token_hash escluso
GRANT ALL ON public.company_invitations TO service_role;

-- ---------- Proprietari ed EXECUTE minimi ----------
ALTER TABLE public.company_invitation_email_sends OWNER TO postgres;
ALTER TABLE public.invite_code_attempts OWNER TO postgres;
ALTER FUNCTION public.reserve_customer_invitation_send(uuid, text) OWNER TO postgres;
ALTER FUNCTION public.record_customer_invitation_send(uuid, text, text, text) OWNER TO postgres;
ALTER FUNCTION public.generate_invite_code() OWNER TO postgres;
ALTER FUNCTION public.accept_invitation_code(text, uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.reserve_customer_invitation_send(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_customer_invitation_send(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.record_customer_invitation_send(uuid, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_customer_invitation_send(uuid, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.generate_invite_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO service_role;
REVOKE ALL ON FUNCTION public.accept_invitation_code(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation_code(text, uuid) TO authenticated, service_role;

-- ---------- Controllo finale: annulla tutto se qualcosa non torna ----------
DO $$
DECLARE _f text; _t text;
BEGIN
  FOREACH _f IN ARRAY ARRAY[
    'public.reserve_customer_invitation_send(uuid,text)',
    'public.record_customer_invitation_send(uuid,text,text,text)',
    'public.generate_invite_code()',
    'public.accept_invitation_code(text,uuid)'] LOOP
    IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = _f::regprocedure) <> 'postgres' THEN
      RAISE EXCEPTION 'SEC_INV_FINAL_OWNER: %', _f;
    END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = _f::regprocedure)
       OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = _f::regprocedure
                      AND 'search_path=public' = ANY(proconfig)) THEN
      RAISE EXCEPTION 'SEC_INV_FINAL_DEFINER: %', _f;
    END IF;
    IF has_function_privilege('anon', _f, 'EXECUTE') THEN
      RAISE EXCEPTION 'SEC_INV_FINAL_ANON_EXEC: %', _f;
    END IF;
  END LOOP;

  IF has_function_privilege('authenticated', 'public.record_customer_invitation_send(uuid,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.generate_invite_code()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.reserve_customer_invitation_send(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SEC_INV_FINAL_EXEC_SCOPE';
  END IF;

  FOREACH _t IN ARRAY ARRAY['public.company_invitation_email_sends', 'public.invite_code_attempts'] LOOP
    IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = _t::regclass) <> 'postgres'
       OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = _t::regclass) THEN
      RAISE EXCEPTION 'SEC_INV_FINAL_TABLE: %', _t;
    END IF;
    IF has_table_privilege('anon', _t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
       OR has_table_privilege('authenticated', _t, 'INSERT,UPDATE,DELETE,TRUNCATE') THEN
      RAISE EXCEPTION 'SEC_INV_FINAL_TABLE_PRIV: %', _t;
    END IF;
  END LOOP;

  IF has_table_privilege('authenticated', 'public.invite_code_attempts', 'SELECT') THEN
    RAISE EXCEPTION 'SEC_INV_FINAL_ATTEMPTS_READABLE';
  END IF;
  IF has_column_privilege('authenticated', 'public.company_invitations', 'token_hash', 'SELECT')
     OR has_column_privilege('anon', 'public.company_invitations', 'token_hash', 'SELECT')
     OR has_column_privilege('authenticated', 'public.company_invitation_email_sends', 'receipt_hash', 'SELECT') THEN
    RAISE EXCEPTION 'SEC_INV_FINAL_HASH_READABLE';
  END IF;
  IF has_table_privilege('anon', 'public.company_invitations', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
     OR has_table_privilege('authenticated', 'public.company_invitations', 'INSERT,UPDATE,DELETE,TRUNCATE') THEN
    RAISE EXCEPTION 'SEC_INV_FINAL_INVITATIONS_PRIV';
  END IF;
END $$;

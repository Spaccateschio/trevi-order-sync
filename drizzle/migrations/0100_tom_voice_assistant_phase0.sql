CREATE TABLE public.company_features (
  company_id uuid NOT NULL REFERENCES public.companies(id),
  feature_key text NOT NULL CHECK (feature_key IN ('assistente_vocale')),
  enabled boolean NOT NULL DEFAULT false,
  enabled_at timestamptz,
  enabled_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, feature_key)
);
GRANT SELECT ON public.company_features TO authenticated;
GRANT ALL ON public.company_features TO service_role;
ALTER TABLE public.company_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membri leggono le funzioni della propria azienda" ON public.company_features
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

CREATE TABLE public.tom_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  user_id uuid NOT NULL,
  page text NOT NULL CHECK (page IN ('inventario','lista')),
  inventory_session_id uuid REFERENCES public.inventory_sessions(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  phrase_count integer NOT NULL DEFAULT 0
);
CREATE INDEX tom_sessions_company_day ON public.tom_sessions (company_id, started_at);
GRANT SELECT ON public.tom_sessions TO authenticated;
GRANT ALL ON public.tom_sessions TO service_role;
ALTER TABLE public.tom_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Amministratori leggono le sessioni Tom" ON public.tom_sessions
  FOR SELECT TO authenticated USING (public.is_company_admin(company_id));

CREATE TABLE public.tom_command_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  user_id uuid NOT NULL,
  tom_session_id uuid NOT NULL REFERENCES public.tom_sessions(id) ON DELETE CASCADE,
  page text NOT NULL,
  transcript text,
  command jsonb,
  outcome text NOT NULL CHECK (outcome IN ('applicato','domanda','annullato','corretto','errore','comando')),
  card_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tom_command_log_company_created ON public.tom_command_log (company_id, created_at);
GRANT SELECT ON public.tom_command_log TO authenticated;
GRANT ALL ON public.tom_command_log TO service_role;
ALTER TABLE public.tom_command_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Amministratori leggono il registro Tom" ON public.tom_command_log
  FOR SELECT TO authenticated USING (public.is_company_admin(company_id));

-- Lettura del flag per l'utente autenticato (usata dalle funzioni server con il client dell'utente).
CREATE OR REPLACE FUNCTION public.has_company_feature(_company_id uuid, _feature_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_company_member(_company_id) AND EXISTS (
    SELECT 1 FROM public.company_features f
    WHERE f.company_id = _company_id AND f.feature_key = _feature_key AND f.enabled
  );
$$;
REVOKE ALL ON FUNCTION public.has_company_feature(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_company_feature(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._tom_member_ok(_user_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = _company_id AND m.user_id = _user_id AND m.status = 'attivo')
     AND EXISTS (SELECT 1 FROM public.company_features f WHERE f.company_id = _company_id AND f.feature_key = 'assistente_vocale' AND f.enabled);
$$;
REVOKE ALL ON FUNCTION public._tom_member_ok(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._tom_member_ok(uuid, uuid) TO service_role;

-- Apertura sessione Tom: solo dalle funzioni server (service_role) dopo la verifica dell'utente.
CREATE OR REPLACE FUNCTION public.tom_start_session(_user_id uuid, _company_id uuid, _page text, _inventory_session_id uuid, _max_daily integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _today integer;
BEGIN
  IF NOT public._tom_member_ok(_user_id, _company_id) THEN RAISE EXCEPTION 'TOM_NON_ABILITATO'; END IF;
  IF _inventory_session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.inventory_sessions s WHERE s.id = _inventory_session_id AND s.company_id = _company_id AND s.status = 'in_corso'
  ) THEN RAISE EXCEPTION 'TOM_INVENTARIO_NON_APERTO'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('tom_sessions:' || _company_id::text));
  SELECT count(*) INTO _today FROM public.tom_sessions
   WHERE company_id = _company_id AND started_at >= date_trunc('day', now() AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome';
  IF _today >= _max_daily THEN RAISE EXCEPTION 'TOM_LIMITE_SESSIONI'; END IF;
  INSERT INTO public.tom_sessions (company_id, user_id, page, inventory_session_id)
  VALUES (_company_id, _user_id, _page, _inventory_session_id) RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.tom_start_session(uuid, uuid, text, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tom_start_session(uuid, uuid, text, uuid, integer) TO service_role;

-- Prenota una frase (prima della trascrizione, per i costi): conta e rifiuta oltre il tetto.
CREATE OR REPLACE FUNCTION public.tom_reserve_phrase(_user_id uuid, _tom_session_id uuid, _max_phrases integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.tom_sessions;
BEGIN
  SELECT * INTO _s FROM public.tom_sessions WHERE id = _tom_session_id FOR UPDATE;
  IF NOT FOUND OR _s.user_id <> _user_id THEN RAISE EXCEPTION 'TOM_SESSIONE_NON_VALIDA'; END IF;
  IF NOT public._tom_member_ok(_user_id, _s.company_id) THEN RAISE EXCEPTION 'TOM_NON_ABILITATO'; END IF;
  IF _s.phrase_count >= _max_phrases THEN RAISE EXCEPTION 'TOM_LIMITE_FRASI'; END IF;
  UPDATE public.tom_sessions SET phrase_count = phrase_count + 1 WHERE id = _tom_session_id;
  RETURN _s.company_id;
END $$;
REVOKE ALL ON FUNCTION public.tom_reserve_phrase(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tom_reserve_phrase(uuid, uuid, integer) TO service_role;

-- Registro comandi (niente audio); pulizia oltre 30 giorni a ogni scrittura.
CREATE OR REPLACE FUNCTION public.tom_log_command(_user_id uuid, _tom_session_id uuid, _transcript text, _command jsonb, _outcome text, _card_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.tom_sessions;
BEGIN
  SELECT * INTO _s FROM public.tom_sessions WHERE id = _tom_session_id;
  IF NOT FOUND OR _s.user_id <> _user_id THEN RAISE EXCEPTION 'TOM_SESSIONE_NON_VALIDA'; END IF;
  IF NOT public._tom_member_ok(_user_id, _s.company_id) THEN RAISE EXCEPTION 'TOM_NON_ABILITATO'; END IF;
  DELETE FROM public.tom_command_log WHERE company_id = _s.company_id AND created_at < now() - interval '30 days';
  DELETE FROM public.tom_sessions WHERE company_id = _s.company_id AND started_at < now() - interval '30 days' AND id <> _tom_session_id;
  INSERT INTO public.tom_command_log (company_id, user_id, tom_session_id, page, transcript, command, outcome, card_key)
  VALUES (_s.company_id, _user_id, _tom_session_id, _s.page, left(_transcript, 1000), _command, _outcome, left(_card_key, 200));
END $$;
REVOKE ALL ON FUNCTION public.tom_log_command(uuid, uuid, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tom_log_command(uuid, uuid, text, jsonb, text, text) TO service_role;
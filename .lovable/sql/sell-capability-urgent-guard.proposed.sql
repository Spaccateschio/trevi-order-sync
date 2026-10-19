-- CORREZIONE URGENTE — PROPOSTA, NON APPLICATA.
-- «Vendo» non si attiva più da solo: can_sell da falso a vero rifiutato
-- (sia da set_company_capabilities sia dalla registrazione), salvo super admin attivo.
-- Spegnere Vendo/Compro resta libero per l'amministratore (almeno uno attivo).
-- Compatibile con l'app pubblicata: il pulsante «Vendo» mostrerà il messaggio d'errore.

DO $$ BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'SELL_GUARD_ROLE: %', current_user; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_company_capabilities(_company_id uuid, _can_buy boolean, _can_sell boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _current boolean;
BEGIN
  IF _uid IS NULL OR NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori dell''azienda';
  END IF;

  IF NOT (_can_buy OR _can_sell) THEN
    RAISE EXCEPTION 'L''azienda deve mantenere almeno un profilo attivo';
  END IF;

  SELECT can_sell INTO _current FROM public.companies WHERE id = _company_id FOR UPDATE;
  IF _can_sell AND NOT coalesce(_current, false) THEN
    RAISE EXCEPTION 'L''attivazione di «Vendo» richiede l''approvazione della piattaforma';
  END IF;

  UPDATE public.companies
  SET can_buy = _can_buy, can_sell = _can_sell
  WHERE id = _company_id;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, _uid, 'company.capabilities_changed', 'company', _company_id,
          jsonb_build_object('can_buy', _can_buy, 'can_sell', _can_sell));
END;
$function$;

-- Protezione definitiva su qualsiasi strada (registrazione, chiamate dirette, funzioni future):
-- un'azienda può nascere o diventare venditrice solo con il flag di approvazione
-- impostato da una funzione fidata (in futuro: approve_sell_request del super admin).
CREATE OR REPLACE FUNCTION public._company_sell_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.can_sell
     AND (TG_OP = 'INSERT' OR NOT coalesce(OLD.can_sell, false))
     AND coalesce(current_setting('app.sell_approval', true), '') <> 'approved'
     AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') IS NOT FALSE
     AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'L''attivazione di «Vendo» richiede l''approvazione della piattaforma';
  END IF;
  RETURN NEW;
END;
$function$;
-- Nota: le funzioni SECURITY DEFINER girano come postgres, quindi il controllo
-- si basa su auth.uid() (chiamata da un utente) + flag di approvazione.
-- Versione semplificata e corretta della condizione:
CREATE OR REPLACE FUNCTION public._company_sell_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.can_sell
     AND (TG_OP = 'INSERT' OR NOT coalesce(OLD.can_sell, false))
     AND auth.uid() IS NOT NULL
     AND coalesce(current_setting('app.sell_approval', true), '') <> 'approved' THEN
    RAISE EXCEPTION 'L''attivazione di «Vendo» richiede l''approvazione della piattaforma';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER companies_sell_guard
  BEFORE INSERT OR UPDATE OF can_sell ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public._company_sell_guard();

ALTER FUNCTION public.set_company_capabilities(uuid, boolean, boolean) OWNER TO postgres;
ALTER FUNCTION public._company_sell_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION public._company_sell_guard() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'public._company_sell_guard()'::regprocedure) <> 'postgres'
     OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'public.set_company_capabilities(uuid,boolean,boolean)'::regprocedure) <> 'postgres'
     OR has_function_privilege('anon', 'public.set_company_capabilities(uuid,boolean,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SELL_GUARD_FINAL_CHECK';
  END IF;
END $$;

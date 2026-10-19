-- ROLLBACK — NON APPLICATO. Annulla commercial_invitations_security.sql.
-- Le due tabelle nuove (registro invii, tentativi codice) NON vengono eliminate:
-- restano inutilizzate e consultabili (nessuna perdita di storico).
-- Volutamente NON si restituiscono ad anon/authenticated i permessi superflui
-- di prima (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, SELECT per anon).
DO $$ BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'ROLLBACK_ROLE: %', current_user; END IF;
END $$;

-- Lettura inviti: di nuovo tutti i membri, impronta compresa
DROP POLICY company_invitations_select ON public.company_invitations;
CREATE POLICY company_invitations_select ON public.company_invitations
  FOR SELECT TO authenticated USING (public.is_company_member(seller_company_id));
GRANT SELECT ON public.company_invitations TO authenticated;

-- Generazione codice originale
CREATE OR REPLACE FUNCTION public.generate_invite_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  _code text;
  _i int;
BEGIN
  LOOP
    _code := '';
    FOR _i IN 1..8 LOOP
      _code := _code || substr(_alphabet, 1 + floor(random() * length(_alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.company_invitations WHERE invite_code = _code);
  END LOOP;
  RETURN _code;
END;
$function$;

-- Accettazione con codice originale (errore su codice inesistente)
CREATE OR REPLACE FUNCTION public.accept_invitation_code(_code text, _buyer_company_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _norm text := upper(regexp_replace(coalesce(_code, ''), '[^A-Za-z0-9]', '', 'g'));
  _id uuid;
BEGIN
  IF _norm = '' THEN RAISE EXCEPTION 'Indica il codice invito'; END IF;

  UPDATE public.company_invitations SET status = 'annullato_scaduto', decided_at = now()
  WHERE status = 'in_attesa' AND expires_at < now();

  SELECT id INTO _id FROM public.company_invitations WHERE invite_code = _norm;
  IF _id IS NULL THEN RAISE EXCEPTION 'Codice invito non valido o già utilizzato'; END IF;
  RETURN public.accept_invitation_row(_id, _buyer_company_id);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO authenticated;

-- Le funzioni di prenotazione/esito diventano non eseguibili: il server
-- ricade automaticamente sui controlli precedenti solo se mancano,
-- quindi qui vengono ELIMINATE (sono nuove, nessun dato perso).
DROP FUNCTION public.reserve_customer_invitation_send(uuid, text);
DROP FUNCTION public.record_customer_invitation_send(uuid, text, text, text);

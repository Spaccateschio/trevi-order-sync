-- PROPOSTA — NON APPLICATA. Limite invii email per invito commerciale:
-- max 5 nelle 24 ore, almeno 60 secondi tra due invii, sicuro con richieste contemporanee.

CREATE TABLE public.company_invitation_email_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES public.company_invitations(id),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  requested_by uuid NOT NULL,
  reserved_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX company_invitation_email_sends_inv_idx
  ON public.company_invitation_email_sends (invitation_id, reserved_at DESC);

REVOKE ALL ON public.company_invitation_email_sends FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.company_invitation_email_sends TO authenticated;
GRANT ALL ON public.company_invitation_email_sends TO service_role;
ALTER TABLE public.company_invitation_email_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_invitation_email_sends_select ON public.company_invitation_email_sends
  FOR SELECT TO authenticated USING (public.is_company_admin(company_id));
-- Nessuna policy di scrittura: si scrive solo dalla funzione qui sotto.

CREATE OR REPLACE FUNCTION public.reserve_customer_invitation_send(_invitation_id uuid, _token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _inv public.company_invitations;
  _recent int;
  _last timestamptz;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'INV_SEND_AUTH_REQUIRED'; END IF;

  -- Blocco della riga: due richieste contemporanee sullo stesso invito si mettono in fila.
  SELECT * INTO _inv FROM public.company_invitations WHERE id = _invitation_id FOR UPDATE;
  IF _inv.id IS NULL THEN RAISE EXCEPTION 'INV_SEND_NOT_FOUND'; END IF;
  IF NOT public.is_company_admin(_inv.seller_company_id) THEN RAISE EXCEPTION 'INV_SEND_NOT_ADMIN'; END IF;
  IF _inv.status <> 'in_attesa' THEN RAISE EXCEPTION 'INV_SEND_NOT_PENDING'; END IF;
  IF _inv.expires_at <= now() THEN RAISE EXCEPTION 'INV_SEND_EXPIRED'; END IF;
  IF _inv.token_hash IS DISTINCT FROM encode(sha256(coalesce(_token, '')::bytea), 'hex') THEN
    RAISE EXCEPTION 'INV_SEND_INVALID_TOKEN';
  END IF;

  SELECT count(*), max(reserved_at) INTO _recent, _last
  FROM public.company_invitation_email_sends
  WHERE invitation_id = _invitation_id AND reserved_at > now() - interval '24 hours';
  IF _last IS NOT NULL AND _last > now() - interval '60 seconds' THEN RAISE EXCEPTION 'INV_SEND_TOO_SOON'; END IF;
  IF _recent >= 5 THEN RAISE EXCEPTION 'INV_SEND_DAILY_LIMIT'; END IF;

  INSERT INTO public.company_invitation_email_sends (invitation_id, company_id, requested_by)
  VALUES (_invitation_id, _inv.seller_company_id, _uid);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_customer_invitation_send(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_customer_invitation_send(uuid, text) TO authenticated;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'piattaforma';

CREATE TABLE public.platform_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  perm_aziende TEXT NOT NULL DEFAULT 'nessuno' CHECK (perm_aziende IN ('nessuno','vedi','modifica')),
  perm_utenti TEXT NOT NULL DEFAULT 'nessuno' CHECK (perm_utenti IN ('nessuno','vedi','modifica')),
  perm_registro TEXT NOT NULL DEFAULT 'nessuno' CHECK (perm_registro IN ('nessuno','vedi','modifica')),
  perm_assistenza TEXT NOT NULL DEFAULT 'nessuno' CHECK (perm_assistenza IN ('nessuno','vedi','modifica')),
  perm_impostazioni TEXT NOT NULL DEFAULT 'nessuno' CHECK (perm_impostazioni IN ('nessuno','vedi','modifica')),
  is_super BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'attivo' CHECK (status IN ('attivo','disattivato')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_team_members TO authenticated;
GRANT ALL ON public.platform_team_members TO service_role;

ALTER TABLE public.platform_team_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_team_members
    WHERE user_id = auth.uid() AND status = 'attivo'
  )
$$;

CREATE POLICY "platform team read"
ON public.platform_team_members FOR SELECT TO authenticated
USING (public.is_platform_admin());

CREATE TABLE public.platform_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL,
  section TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.platform_audit_log TO authenticated;
GRANT ALL ON public.platform_audit_log TO service_role;

ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform audit read"
ON public.platform_audit_log FOR SELECT TO authenticated
USING (public.is_platform_admin());

CREATE POLICY "platform audit insert"
ON public.platform_audit_log FOR INSERT TO authenticated
WITH CHECK (actor_user_id = auth.uid() AND public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.platform_permission(_section TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.platform_team_members%ROWTYPE;
BEGIN
  SELECT * INTO _m FROM public.platform_team_members
  WHERE user_id = auth.uid() AND status = 'attivo';
  IF NOT FOUND THEN RETURN 'nessuno'; END IF;
  IF _m.is_super THEN RETURN 'modifica'; END IF;
  CASE _section
    WHEN 'aziende' THEN RETURN _m.perm_aziende;
    WHEN 'utenti' THEN RETURN _m.perm_utenti;
    WHEN 'registro' THEN RETURN _m.perm_registro;
    WHEN 'assistenza' THEN RETURN _m.perm_assistenza;
    WHEN 'impostazioni' THEN RETURN _m.perm_impostazioni;
    ELSE RETURN 'nessuno';
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_platform_team_member(
  _action TEXT,
  _member_id UUID DEFAULT NULL,
  _user_id UUID DEFAULT NULL,
  _perm_aziende TEXT DEFAULT NULL,
  _perm_utenti TEXT DEFAULT NULL,
  _perm_registro TEXT DEFAULT NULL,
  _perm_assistenza TEXT DEFAULT NULL,
  _perm_impostazioni TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller public.platform_team_members%ROWTYPE;
  _id UUID;
BEGIN
  SELECT * INTO _caller FROM public.platform_team_members
  WHERE user_id = auth.uid() AND status = 'attivo';
  IF NOT FOUND OR NOT _caller.is_super THEN
    RAISE EXCEPTION 'Solo il super amministratore può gestire il team interno';
  END IF;

  IF _action = 'aggiungi' THEN
    IF _user_id IS NULL THEN RAISE EXCEPTION 'Utente mancante'; END IF;
    INSERT INTO public.platform_team_members (
      user_id, perm_aziende, perm_utenti, perm_registro, perm_assistenza, perm_impostazioni, created_by
    ) VALUES (
      _user_id,
      COALESCE(_perm_aziende, 'nessuno'), COALESCE(_perm_utenti, 'nessuno'),
      COALESCE(_perm_registro, 'nessuno'), COALESCE(_perm_assistenza, 'nessuno'),
      COALESCE(_perm_impostazioni, 'nessuno'), auth.uid()
    )
    RETURNING id INTO _id;
    INSERT INTO public.platform_audit_log (actor_user_id, section, action, details)
    VALUES (auth.uid(), 'team', 'aggiungi_membro', jsonb_build_object('user_id', _user_id));
    RETURN _id;
  ELSIF _action = 'modifica' THEN
    IF _member_id IS NULL THEN RAISE EXCEPTION 'Membro mancante'; END IF;
    UPDATE public.platform_team_members SET
      perm_aziende = COALESCE(_perm_aziende, perm_aziende),
      perm_utenti = COALESCE(_perm_utenti, perm_utenti),
      perm_registro = COALESCE(_perm_registro, perm_registro),
      perm_assistenza = COALESCE(_perm_assistenza, perm_assistenza),
      perm_impostazioni = COALESCE(_perm_impostazioni, perm_impostazioni),
      updated_at = now()
    WHERE id = _member_id;
    INSERT INTO public.platform_audit_log (actor_user_id, section, action, details)
    VALUES (auth.uid(), 'team', 'modifica_membro', jsonb_build_object('member_id', _member_id));
    RETURN _member_id;
  ELSIF _action = 'disattiva' THEN
    IF _member_id IS NULL THEN RAISE EXCEPTION 'Membro mancante'; END IF;
    UPDATE public.platform_team_members SET status = 'disattivato', updated_at = now()
    WHERE id = _member_id AND user_id <> auth.uid();
    INSERT INTO public.platform_audit_log (actor_user_id, section, action, details)
    VALUES (auth.uid(), 'team', 'disattiva_membro', jsonb_build_object('member_id', _member_id));
    RETURN _member_id;
  ELSE
    RAISE EXCEPTION 'Azione non valida: %', _action;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.manage_platform_team_member(TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_platform_team_member(TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_permission(TEXT) TO authenticated;
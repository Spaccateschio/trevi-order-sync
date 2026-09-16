-- =========================================================
-- TREVI FRUIT — FASE 1: FONDAZIONI
-- =========================================================

CREATE TYPE public.entity_status AS ENUM ('attivo', 'disattivato', 'revocato');
CREATE TYPE public.app_role AS ENUM ('amministratore', 'operatore', 'trasportatore');
CREATE TYPE public.customer_user_role AS ENUM ('owner', 'member');
CREATE TYPE public.relation_status AS ENUM ('in_attesa', 'attivo', 'sospeso', 'revocato', 'rifiutato');
CREATE TYPE public.relation_origin AS ENUM ('invito_fornitore', 'richiesta_cliente');

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------- aziende fornitrici ----------
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  legal_name TEXT NOT NULL,
  vat_number TEXT,
  tax_code TEXT,
  email TEXT,
  phone TEXT,
  address_line TEXT,
  postal_code TEXT,
  city TEXT,
  province TEXT,
  country TEXT NOT NULL DEFAULT 'IT',
  logo_url TEXT,
  brand_primary_color TEXT,
  brand_secondary_color TEXT,
  status public.entity_status NOT NULL DEFAULT 'attivo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX companies_vat_number_key ON public.companies (vat_number) WHERE vat_number IS NOT NULL;

CREATE TABLE public.company_settings (
  company_id UUID NOT NULL PRIMARY KEY REFERENCES public.companies (id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Rome',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- persone ----------
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  status public.entity_status NOT NULL DEFAULT 'attivo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- appartenenza persona <-> azienda fornitrice ----------
CREATE TABLE public.company_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  user_id UUID NOT NULL,
  status public.entity_status NOT NULL DEFAULT 'attivo',
  invited_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);
CREATE INDEX company_members_user_id_idx ON public.company_members (user_id);

CREATE TABLE public.company_member_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES public.company_members (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id, role)
);
CREATE INDEX company_member_roles_company_idx ON public.company_member_roles (company_id);

-- ---------- aziende clienti ----------
CREATE TABLE public.customer_companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  legal_name TEXT NOT NULL,
  vat_number TEXT,
  tax_code TEXT,
  email TEXT,
  phone TEXT,
  address_line TEXT,
  postal_code TEXT,
  city TEXT,
  province TEXT,
  country TEXT NOT NULL DEFAULT 'IT',
  delivery_address_line TEXT,
  delivery_postal_code TEXT,
  delivery_city TEXT,
  delivery_province TEXT,
  delivery_notes TEXT,
  status public.entity_status NOT NULL DEFAULT 'attivo',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX customer_companies_vat_number_key ON public.customer_companies (vat_number) WHERE vat_number IS NOT NULL;

CREATE TABLE public.customer_company_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_company_id UUID NOT NULL REFERENCES public.customer_companies (id) ON DELETE RESTRICT,
  user_id UUID NOT NULL,
  role public.customer_user_role NOT NULL DEFAULT 'member',
  status public.entity_status NOT NULL DEFAULT 'attivo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_company_id, user_id)
);
CREATE INDEX customer_company_users_user_idx ON public.customer_company_users (user_id);

-- ---------- rapporto commerciale (solo struttura e stato) ----------
CREATE TABLE public.supplier_customer_relations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  customer_company_id UUID NOT NULL REFERENCES public.customer_companies (id) ON DELETE RESTRICT,
  status public.relation_status NOT NULL DEFAULT 'in_attesa',
  origin public.relation_origin NOT NULL DEFAULT 'richiesta_cliente',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_by UUID,
  decided_at TIMESTAMPTZ,
  decided_by UUID,
  internal_reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, customer_company_id)
);
CREATE INDEX supplier_customer_relations_customer_idx ON public.supplier_customer_relations (customer_company_id);
CREATE INDEX supplier_customer_relations_company_status_idx ON public.supplier_customer_relations (company_id, status);

-- ---------- audit ----------
CREATE TABLE public.audit_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies (id) ON DELETE RESTRICT,
  actor_user_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_company_created_idx ON public.audit_events (company_id, created_at DESC);

-- =========================================================
-- FUNZIONI DI SICUREZZA (SECURITY DEFINER)
-- =========================================================

CREATE OR REPLACE FUNCTION public.is_company_member(_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = _company_id
      AND m.user_id = auth.uid()
      AND m.status = 'attivo'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_company_role(_company_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members m
    JOIN public.company_member_roles r ON r.member_id = m.id
    WHERE m.company_id = _company_id
      AND m.user_id = auth.uid()
      AND m.status = 'attivo'
      AND r.role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_company_admin(_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_company_role(_company_id, 'amministratore'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.is_customer_user(_customer_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customer_company_users u
    WHERE u.customer_company_id = _customer_company_id
      AND u.user_id = auth.uid()
      AND u.status = 'attivo'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_customer_owner(_customer_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customer_company_users u
    WHERE u.customer_company_id = _customer_company_id
      AND u.user_id = auth.uid()
      AND u.status = 'attivo'
      AND u.role = 'owner'
  );
$$;

-- il fornitore vede l'azienda cliente solo se esiste un rapporto con la sua azienda
CREATE OR REPLACE FUNCTION public.supplier_sees_customer(_customer_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.supplier_customer_relations rel
    JOIN public.company_members m ON m.company_id = rel.company_id
    WHERE rel.customer_company_id = _customer_company_id
      AND m.user_id = auth.uid()
      AND m.status = 'attivo'
  );
$$;

CREATE OR REPLACE FUNCTION public.supplier_admin_of_customer(_customer_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.supplier_customer_relations rel
    WHERE rel.customer_company_id = _customer_company_id
      AND public.is_company_admin(rel.company_id)
  );
$$;

-- il cliente vede l'azienda fornitrice con cui ha un rapporto
CREATE OR REPLACE FUNCTION public.customer_sees_company(_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.supplier_customer_relations rel
    JOIN public.customer_company_users u ON u.customer_company_id = rel.customer_company_id
    WHERE rel.company_id = _company_id
      AND u.user_id = auth.uid()
      AND u.status = 'attivo'
  );
$$;

CREATE OR REPLACE FUNCTION public.shares_company_with(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members mine
    JOIN public.company_members theirs ON theirs.company_id = mine.company_id
    WHERE mine.user_id = auth.uid()
      AND mine.status = 'attivo'
      AND theirs.user_id = _user_id
  );
$$;

-- registrazione autonoma: crea azienda cliente + titolare in modo atomico
CREATE OR REPLACE FUNCTION public.register_customer_company(
  _legal_name TEXT,
  _vat_number TEXT DEFAULT NULL,
  _tax_code TEXT DEFAULT NULL,
  _email TEXT DEFAULT NULL,
  _phone TEXT DEFAULT NULL,
  _address_line TEXT DEFAULT NULL,
  _postal_code TEXT DEFAULT NULL,
  _city TEXT DEFAULT NULL,
  _province TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _customer_id UUID;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta';
  END IF;

  IF EXISTS (SELECT 1 FROM public.customer_company_users u WHERE u.user_id = _uid) THEN
    RAISE EXCEPTION 'Utente già collegato a un''azienda cliente';
  END IF;

  INSERT INTO public.customer_companies (
    legal_name, vat_number, tax_code, email, phone,
    address_line, postal_code, city, province, created_by
  ) VALUES (
    _legal_name, NULLIF(_vat_number, ''), NULLIF(_tax_code, ''), NULLIF(_email, ''), NULLIF(_phone, ''),
    NULLIF(_address_line, ''), NULLIF(_postal_code, ''), NULLIF(_city, ''), NULLIF(_province, ''), _uid
  )
  RETURNING id INTO _customer_id;

  INSERT INTO public.customer_company_users (customer_company_id, user_id, role)
  VALUES (_customer_id, _uid, 'owner');

  INSERT INTO public.audit_events (actor_user_id, action, entity_type, entity_id)
  VALUES (_uid, 'customer_company.registered', 'customer_company', _customer_id);

  RETURN _customer_id;
END;
$$;

-- =========================================================
-- GRANTS
-- =========================================================
GRANT SELECT, INSERT, UPDATE ON public.companies TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.company_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.company_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_member_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customer_companies TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customer_company_users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.supplier_customer_relations TO authenticated;
GRANT SELECT, INSERT ON public.audit_events TO authenticated;

GRANT ALL ON public.companies TO service_role;
GRANT ALL ON public.company_settings TO service_role;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.company_members TO service_role;
GRANT ALL ON public.company_member_roles TO service_role;
GRANT ALL ON public.customer_companies TO service_role;
GRANT ALL ON public.customer_company_users TO service_role;
GRANT ALL ON public.supplier_customer_relations TO service_role;
GRANT ALL ON public.audit_events TO service_role;

-- =========================================================
-- RLS
-- =========================================================
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_member_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_company_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_customer_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- companies
CREATE POLICY "companies_select_member_or_customer" ON public.companies
FOR SELECT TO authenticated
USING (public.is_company_member(id) OR public.customer_sees_company(id));

CREATE POLICY "companies_update_admin" ON public.companies
FOR UPDATE TO authenticated
USING (public.is_company_admin(id))
WITH CHECK (public.is_company_admin(id));

-- company_settings
CREATE POLICY "company_settings_select_member" ON public.company_settings
FOR SELECT TO authenticated
USING (public.is_company_member(company_id));

CREATE POLICY "company_settings_insert_admin" ON public.company_settings
FOR INSERT TO authenticated
WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY "company_settings_update_admin" ON public.company_settings
FOR UPDATE TO authenticated
USING (public.is_company_admin(company_id))
WITH CHECK (public.is_company_admin(company_id));

-- profiles
CREATE POLICY "profiles_select_self_or_colleague" ON public.profiles
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.shares_company_with(user_id));

CREATE POLICY "profiles_insert_self" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "profiles_update_self" ON public.profiles
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- company_members
CREATE POLICY "company_members_select_member" ON public.company_members
FOR SELECT TO authenticated
USING (public.is_company_member(company_id) OR user_id = auth.uid());

CREATE POLICY "company_members_insert_admin" ON public.company_members
FOR INSERT TO authenticated
WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY "company_members_update_admin" ON public.company_members
FOR UPDATE TO authenticated
USING (public.is_company_admin(company_id))
WITH CHECK (public.is_company_admin(company_id));

-- company_member_roles
CREATE POLICY "company_member_roles_select_member" ON public.company_member_roles
FOR SELECT TO authenticated
USING (public.is_company_member(company_id));

CREATE POLICY "company_member_roles_insert_admin" ON public.company_member_roles
FOR INSERT TO authenticated
WITH CHECK (
  public.is_company_admin(company_id)
  AND EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.id = member_id AND m.company_id = company_member_roles.company_id
  )
);

CREATE POLICY "company_member_roles_delete_admin" ON public.company_member_roles
FOR DELETE TO authenticated
USING (public.is_company_admin(company_id));

-- customer_companies
CREATE POLICY "customer_companies_select" ON public.customer_companies
FOR SELECT TO authenticated
USING (public.is_customer_user(id) OR public.supplier_sees_customer(id));

CREATE POLICY "customer_companies_insert_self" ON public.customer_companies
FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "customer_companies_update" ON public.customer_companies
FOR UPDATE TO authenticated
USING (public.is_customer_owner(id) OR public.supplier_admin_of_customer(id))
WITH CHECK (public.is_customer_owner(id) OR public.supplier_admin_of_customer(id));

-- customer_company_users
CREATE POLICY "customer_company_users_select" ON public.customer_company_users
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_customer_user(customer_company_id)
  OR public.supplier_sees_customer(customer_company_id)
);

CREATE POLICY "customer_company_users_insert" ON public.customer_company_users
FOR INSERT TO authenticated
WITH CHECK (
  public.is_customer_owner(customer_company_id)
  OR public.supplier_admin_of_customer(customer_company_id)
);

CREATE POLICY "customer_company_users_update" ON public.customer_company_users
FOR UPDATE TO authenticated
USING (
  public.is_customer_owner(customer_company_id)
  OR public.supplier_admin_of_customer(customer_company_id)
)
WITH CHECK (
  public.is_customer_owner(customer_company_id)
  OR public.supplier_admin_of_customer(customer_company_id)
);

-- supplier_customer_relations
CREATE POLICY "relations_select" ON public.supplier_customer_relations
FOR SELECT TO authenticated
USING (public.is_company_member(company_id) OR public.is_customer_user(customer_company_id));

CREATE POLICY "relations_insert" ON public.supplier_customer_relations
FOR INSERT TO authenticated
WITH CHECK (
  public.is_company_admin(company_id)
  OR (public.is_customer_owner(customer_company_id) AND status = 'in_attesa' AND requested_by = auth.uid())
);

CREATE POLICY "relations_update_supplier_admin" ON public.supplier_customer_relations
FOR UPDATE TO authenticated
USING (public.is_company_admin(company_id))
WITH CHECK (public.is_company_admin(company_id));

-- audit_events (append-only)
CREATE POLICY "audit_select_company_admin" ON public.audit_events
FOR SELECT TO authenticated
USING (company_id IS NOT NULL AND public.is_company_admin(company_id));

CREATE POLICY "audit_insert_actor" ON public.audit_events
FOR INSERT TO authenticated
WITH CHECK (actor_user_id = auth.uid());

-- =========================================================
-- TRIGGER updated_at
-- =========================================================
CREATE TRIGGER companies_set_updated_at BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER company_settings_set_updated_at BEFORE UPDATE ON public.company_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER company_members_set_updated_at BEFORE UPDATE ON public.company_members
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER customer_companies_set_updated_at BEFORE UPDATE ON public.customer_companies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER customer_company_users_set_updated_at BEFORE UPDATE ON public.customer_company_users
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER relations_set_updated_at BEFORE UPDATE ON public.supplier_customer_relations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
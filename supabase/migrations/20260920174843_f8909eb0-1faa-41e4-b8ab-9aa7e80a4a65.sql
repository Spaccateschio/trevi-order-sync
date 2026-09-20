CREATE TABLE public.user_navigation_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sidebar_items jsonb NOT NULL DEFAULT '{"hidden":[],"order":[]}'::jsonb,
  dashboard_items jsonb NOT NULL DEFAULT '{"hidden":[],"order":[]}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_navigation_preferences_user_company_unique UNIQUE (user_id, company_id),
  CONSTRAINT user_navigation_preferences_sidebar_object CHECK (jsonb_typeof(sidebar_items) = 'object'),
  CONSTRAINT user_navigation_preferences_dashboard_object CHECK (jsonb_typeof(dashboard_items) = 'object')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_navigation_preferences TO authenticated;
GRANT ALL ON public.user_navigation_preferences TO service_role;

ALTER TABLE public.user_navigation_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_navigation_preferences_select_own
ON public.user_navigation_preferences
FOR SELECT TO authenticated
USING (auth.uid() = user_id AND public.is_company_member(company_id));

CREATE POLICY user_navigation_preferences_insert_own
ON public.user_navigation_preferences
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.is_company_member(company_id));

CREATE POLICY user_navigation_preferences_update_own
ON public.user_navigation_preferences
FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND public.is_company_member(company_id))
WITH CHECK (auth.uid() = user_id AND public.is_company_member(company_id));

CREATE POLICY user_navigation_preferences_delete_own
ON public.user_navigation_preferences
FOR DELETE TO authenticated
USING (auth.uid() = user_id AND public.is_company_member(company_id));

CREATE TRIGGER user_navigation_preferences_set_updated_at
BEFORE UPDATE ON public.user_navigation_preferences
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
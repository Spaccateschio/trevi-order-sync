CREATE TABLE public.user_grid_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grid_key text NOT NULL,
  device_class text NOT NULL CHECK (device_class IN ('desktop', 'tablet', 'smartphone')),
  columns jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_grid_preferences_user_grid_device_unique UNIQUE (user_id, grid_key, device_class)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_grid_preferences TO authenticated;
GRANT ALL ON public.user_grid_preferences TO service_role;

ALTER TABLE public.user_grid_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own grid preferences"
ON public.user_grid_preferences FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own grid preferences"
ON public.user_grid_preferences FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own grid preferences"
ON public.user_grid_preferences FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own grid preferences"
ON public.user_grid_preferences FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER user_grid_preferences_set_updated_at
BEFORE UPDATE ON public.user_grid_preferences
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
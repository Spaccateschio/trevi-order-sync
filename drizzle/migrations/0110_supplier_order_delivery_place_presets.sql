CREATE TABLE public.company_delivery_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  text text NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_delivery_places_text_length CHECK (char_length(btrim(text)) BETWEEN 1 AND 300)
);

GRANT SELECT, INSERT ON public.company_delivery_places TO authenticated;
GRANT ALL ON public.company_delivery_places TO service_role;

ALTER TABLE public.company_delivery_places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Indicazioni consegna leggibili dai membri"
ON public.company_delivery_places FOR SELECT TO authenticated
USING (public.is_company_member(company_id));

CREATE POLICY "Indicazioni consegna create dai membri"
ON public.company_delivery_places FOR INSERT TO authenticated
WITH CHECK (public.is_company_member(company_id) AND created_by = auth.uid());

CREATE UNIQUE INDEX company_delivery_places_company_text_unique
ON public.company_delivery_places (company_id, lower(regexp_replace(btrim(text), '\s+', ' ', 'g')));

CREATE OR REPLACE FUNCTION public.save_shopping_list_delivery_place(_list_id uuid, _text text)
RETURNS public.company_delivery_places
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $f$
DECLARE
  v_company_id uuid;
  v_text text;
  v_place public.company_delivery_places;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;

  v_text := regexp_replace(btrim(COALESCE(_text, '')), '\s+', ' ', 'g');
  IF char_length(v_text) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'Scrivi un luogo o una frase da 1 a 300 caratteri';
  END IF;

  SELECT company_id INTO v_company_id
  FROM public.shopping_lists
  WHERE id = _list_id;

  IF v_company_id IS NULL OR NOT public.is_company_member(v_company_id) THEN
    RAISE EXCEPTION 'Lista non trovata';
  END IF;

  INSERT INTO public.company_delivery_places (company_id, text)
  VALUES (v_company_id, v_text)
  ON CONFLICT DO NOTHING;

  SELECT * INTO v_place
  FROM public.company_delivery_places
  WHERE company_id = v_company_id
    AND lower(regexp_replace(btrim(text), '\s+', ' ', 'g')) = lower(v_text);

  RETURN v_place;
END;
$f$;

REVOKE ALL ON FUNCTION public.save_shopping_list_delivery_place(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_shopping_list_delivery_place(uuid, text) TO authenticated, service_role;
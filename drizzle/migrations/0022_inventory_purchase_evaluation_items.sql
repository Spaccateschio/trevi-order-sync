ALTER TYPE public.shopping_list_item_origin ADD VALUE IF NOT EXISTS 'inventario';

CREATE TABLE public.inventory_purchase_evaluation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  session_id uuid NOT NULL REFERENCES public.inventory_sessions(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  decided_quantity numeric NULL,
  status text NOT NULL DEFAULT 'da_valutare',
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ipei_unique UNIQUE (company_id, session_id, product_id),
  CONSTRAINT ipei_status_check CHECK (status IN ('da_valutare','da_acquistare','non_acquistare')),
  CONSTRAINT ipei_quantity_check CHECK (
    (status = 'da_acquistare' AND decided_quantity IS NOT NULL AND decided_quantity > 0)
    OR (status = 'non_acquistare' AND (decided_quantity IS NULL OR decided_quantity = 0))
    OR (status = 'da_valutare' AND decided_quantity IS NULL)
  )
);

GRANT SELECT ON public.inventory_purchase_evaluation_items TO authenticated;
GRANT ALL ON public.inventory_purchase_evaluation_items TO service_role;
ALTER TABLE public.inventory_purchase_evaluation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membri leggono valutazioni" ON public.inventory_purchase_evaluation_items
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

CREATE OR REPLACE FUNCTION public.set_inventory_purchase_evaluation(
  _session_id uuid, _product_id uuid, _status text, _quantity numeric DEFAULT NULL
) RETURNS public.inventory_purchase_evaluation_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _company uuid;
  _evaluated timestamptz;
  _row public.inventory_purchase_evaluation_items;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso richiesto'; END IF;
  SELECT company_id, purchase_evaluated_at INTO _company, _evaluated
    FROM public.inventory_sessions WHERE id = _session_id;
  IF _company IS NULL OR NOT public.is_company_member(_company) THEN
    RAISE EXCEPTION 'Inventario non accessibile';
  END IF;
  IF _evaluated IS NOT NULL THEN RAISE EXCEPTION 'Valutazione già terminata'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_counts
                 WHERE session_id = _session_id AND product_id = _product_id AND company_id = _company) THEN
    RAISE EXCEPTION 'Prodotto non contato in questo inventario';
  END IF;
  IF _status NOT IN ('da_valutare','da_acquistare','non_acquistare') THEN
    RAISE EXCEPTION 'Stato non valido';
  END IF;
  IF _status = 'da_acquistare' AND (_quantity IS NULL OR _quantity <= 0) THEN
    RAISE EXCEPTION 'Quantità da acquistare maggiore di zero richiesta';
  END IF;
  IF _status <> 'da_acquistare' THEN _quantity := NULL; END IF;

  INSERT INTO public.inventory_purchase_evaluation_items
    (company_id, session_id, product_id, decided_quantity, status, updated_by)
  VALUES (_company, _session_id, _product_id, _quantity, _status, auth.uid())
  ON CONFLICT (company_id, session_id, product_id) DO UPDATE
    SET decided_quantity = EXCLUDED.decided_quantity, status = EXCLUDED.status,
        updated_by = EXCLUDED.updated_by, updated_at = now()
  RETURNING * INTO _row;
  RETURN _row;
END $$;

REVOKE ALL ON FUNCTION public.set_inventory_purchase_evaluation(uuid, uuid, text, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_inventory_purchase_evaluation(uuid, uuid, text, numeric) TO authenticated;
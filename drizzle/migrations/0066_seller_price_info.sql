-- Fase 1-2 prezzi variabili: orario abituale, testo informativo e ultimo aggiornamento REALE del listino per azienda venditrice.
CREATE TABLE public.seller_price_info (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id),
  usual_update_time time,
  info_text text CHECK (info_text IS NULL OR char_length(info_text) <= 500),
  last_price_update_at timestamptz,
  last_price_update_source text CHECK (last_price_update_source IN ('danea','manuale')),
  last_price_update_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.seller_price_info TO authenticated;
GRANT ALL ON public.seller_price_info TO service_role;
ALTER TABLE public.seller_price_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY seller_price_info_read ON public.seller_price_info FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

-- Impostazioni (solo amministratore): orario facoltativo e testo personalizzabile.
CREATE OR REPLACE FUNCTION public.set_seller_price_info(_company_id uuid, _usual_update_time time, _info_text text)
RETURNS public.seller_price_info LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.seller_price_info; v_text text := NULLIF(trim(COALESCE(_info_text, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_admin(_company_id) THEN
    RAISE EXCEPTION 'Solo gli amministratori dell''azienda possono modificare queste impostazioni';
  END IF;
  IF v_text IS NOT NULL AND char_length(v_text) > 500 THEN
    RAISE EXCEPTION 'Testo troppo lungo (massimo 500 caratteri)';
  END IF;
  INSERT INTO public.seller_price_info AS p (company_id, usual_update_time, info_text, updated_by)
  VALUES (_company_id, _usual_update_time, v_text, auth.uid())
  ON CONFLICT (company_id) DO UPDATE SET
    usual_update_time = EXCLUDED.usual_update_time, info_text = EXCLUDED.info_text,
    updated_by = auth.uid(), updated_at = now()
  RETURNING * INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.set_seller_price_info(uuid, time, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_seller_price_info(uuid, time, text) TO authenticated;

-- Registrazione interna dell'ultimo aggiornamento reale.
CREATE OR REPLACE FUNCTION public._touch_seller_price_update(_company_id uuid, _source text, _run_id uuid, _at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.seller_price_info AS p (company_id, last_price_update_at, last_price_update_source, last_price_update_run_id)
  VALUES (_company_id, _at, _source, _run_id)
  ON CONFLICT (company_id) DO UPDATE SET
    last_price_update_at = EXCLUDED.last_price_update_at,
    last_price_update_source = EXCLUDED.last_price_update_source,
    last_price_update_run_id = EXCLUDED.last_price_update_run_id,
    updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public._touch_seller_price_update(uuid, text, uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- Sostituzione prezzi dall'invio Danea in UNA transazione, con blocco esclusivo del listino:
-- uno scarico ordini contemporaneo vede tutto il listino vecchio o tutto il nuovo.
-- Restituisce true solo se almeno un prezzo è nuovo, diverso o rimosso.
CREATE OR REPLACE FUNCTION public.danea_replace_product_prices(_company_id uuid, _product_ids uuid[], _rows jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_changed boolean;
BEGIN
  IF _product_ids IS NULL OR cardinality(_product_ids) = 0 THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM unnest(_product_ids) pid
             WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = pid AND p.company_id = _company_id)) THEN
    RAISE EXCEPTION 'Prodotti non appartenenti all''azienda';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(_rows, '[]'::jsonb)) r
             WHERE NOT ((r->>'product_id')::uuid = ANY(_product_ids))) THEN
    RAISE EXCEPTION 'Prezzo riferito a un prodotto non incluso nell''invio';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('danea_price_list:' || _company_id::text));

  CREATE TEMP TABLE _new_prices ON COMMIT DROP AS
    SELECT (r->>'product_id')::uuid AS product_id, (r->>'list_number')::smallint AS list_number,
           (r->>'net_price')::numeric AS net_price, (r->>'gross_price')::numeric AS gross_price
    FROM jsonb_array_elements(COALESCE(_rows, '[]'::jsonb)) r;

  SELECT EXISTS (
    (SELECT product_id, list_number, net_price, gross_price FROM _new_prices
     EXCEPT SELECT product_id, list_number, net_price, gross_price FROM public.product_prices
            WHERE company_id = _company_id AND product_id = ANY(_product_ids))
    UNION ALL
    (SELECT product_id, list_number, net_price, gross_price FROM public.product_prices
            WHERE company_id = _company_id AND product_id = ANY(_product_ids)
     EXCEPT SELECT product_id, list_number, net_price, gross_price FROM _new_prices)
  ) INTO v_changed;

  DELETE FROM public.product_prices WHERE company_id = _company_id AND product_id = ANY(_product_ids);
  INSERT INTO public.product_prices (company_id, product_id, list_number, net_price, gross_price)
  SELECT _company_id, product_id, list_number, net_price, gross_price FROM _new_prices;
  DROP TABLE _new_prices;
  RETURN v_changed;
END $$;
REVOKE ALL ON FUNCTION public.danea_replace_product_prices(uuid, uuid[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.danea_replace_product_prices(uuid, uuid[], jsonb) TO service_role;

-- Chiamata solo a invio completato con prezzi cambiati.
CREATE OR REPLACE FUNCTION public.danea_record_price_list_update(_company_id uuid, _run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_at timestamptz;
BEGIN
  SELECT COALESCE(finished_at, now()) INTO v_at FROM public.danea_sync_runs
   WHERE id = _run_id AND company_id = _company_id AND outcome = 'completato';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invio Danea non completato: aggiornamento listino non registrato'; END IF;
  PERFORM public._touch_seller_price_update(_company_id, 'danea', _run_id, v_at);
END $$;
REVOKE ALL ON FUNCTION public.danea_record_price_list_update(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.danea_record_price_list_update(uuid, uuid) TO service_role;

-- Modifica manuale di un prezzo: conta solo se netto o lordo cambiano davvero.
CREATE OR REPLACE FUNCTION public._product_prices_manual_touch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._touch_seller_price_update(NEW.company_id, 'manuale', NULL, now());
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._product_prices_manual_touch() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER product_prices_manual_touch AFTER UPDATE ON public.product_prices
  FOR EACH ROW WHEN (OLD.net_price IS DISTINCT FROM NEW.net_price OR OLD.gross_price IS DISTINCT FROM NEW.gross_price)
  EXECUTE FUNCTION public._product_prices_manual_touch();

-- Lettura per il cliente collegato (o il venditore stesso): solo dati informativi.
CREATE OR REPLACE FUNCTION public.seller_price_info_for(_seller_company_id uuid)
RETURNS TABLE(last_price_update_at timestamptz, usual_update_time time, info_text text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.last_price_update_at, p.usual_update_time, p.info_text
  FROM public.seller_price_info p
  WHERE p.company_id = _seller_company_id
    AND auth.uid() IS NOT NULL
    AND (public.is_company_member(_seller_company_id) OR public.can_view_seller_catalogue(_seller_company_id));
$$;
REVOKE ALL ON FUNCTION public.seller_price_info_for(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seller_price_info_for(uuid) TO authenticated;

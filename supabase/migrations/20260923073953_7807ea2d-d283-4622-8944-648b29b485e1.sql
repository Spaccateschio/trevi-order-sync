CREATE OR REPLACE FUNCTION public.guard_price_observation_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_user IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'Le osservazioni di prezzo non possono essere eliminate';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.series_key IS DISTINCT FROM OLD.series_key
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.net_price IS DISTINCT FROM OLD.net_price
     OR NEW.gross_price IS DISTINCT FROM OLD.gross_price
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.price_basis IS DISTINCT FROM OLD.price_basis
     OR NEW.price_unit_code IS DISTINCT FROM OLD.price_unit_code
     OR NEW.conversion_factor IS DISTINCT FROM OLD.conversion_factor
     OR NEW.conversion_reference_um IS DISTINCT FROM OLD.conversion_reference_um
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.price_list_number IS DISTINCT FROM OLD.price_list_number
     OR NEW.observed_at IS DISTINCT FROM OLD.observed_at THEN
    RAISE EXCEPTION 'Le osservazioni di prezzo sono in sola aggiunta: modificabile solo la data di ultima verifica';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
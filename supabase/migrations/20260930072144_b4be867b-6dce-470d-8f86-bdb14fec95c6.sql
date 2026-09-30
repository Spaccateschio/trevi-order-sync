CREATE OR REPLACE FUNCTION public.assert_assignment_purchase_data()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.purchase_quantity IS NULL OR NEW.purchase_quantity <= 0
     OR (NEW.purchase_unit_id IS NULL AND btrim(COALESCE(NEW.purchase_unit_code, '')) = '') THEN
    RAISE EXCEPTION 'Ripartizione non valida: servono quantità e U.M. d''acquisto';
  END IF;
  RETURN NEW;
END; $function$;
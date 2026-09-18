CREATE OR REPLACE FUNCTION public.manage_customer_record_status(_seller_company_id uuid, _customer_record_id uuid, _action text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Accesso non autorizzato';
  END IF;
  IF NOT public.is_company_admin(_seller_company_id) THEN
    RAISE EXCEPTION 'Solo un amministratore puo modificare l''anagrafica';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.customer_records
    WHERE id = _customer_record_id AND seller_company_id = _seller_company_id
  ) THEN
    RAISE EXCEPTION 'Cliente non trovato';
  END IF;

  IF _action = 'delete' THEN
    UPDATE public.customer_records SET status = 'revocato' WHERE id = _customer_record_id;
  ELSIF _action = 'restore' THEN
    UPDATE public.customer_records SET status = 'attivo' WHERE id = _customer_record_id;
  ELSE
    RAISE EXCEPTION 'Operazione anagrafica non valida';
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_seller_company_id, _uid, 'customer_record.' || _action, 'customer_record', _customer_record_id, '{}'::jsonb);

  RETURN _customer_record_id;
END;
$$;

REVOKE ALL ON FUNCTION public.manage_customer_record_status(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manage_customer_record_status(uuid, uuid, text) TO authenticated;
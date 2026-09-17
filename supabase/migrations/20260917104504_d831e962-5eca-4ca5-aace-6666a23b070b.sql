CREATE TABLE public.customer_destinations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_company_id uuid NOT NULL REFERENCES public.companies(id),
  customer_record_id uuid NOT NULL REFERENCES public.customer_records(id),
  address_id uuid REFERENCES public.addresses(id),
  label text NOT NULL,
  internal_code text,
  danea_reference text,
  contact_name text,
  phone text,
  notes text,
  separate_documents boolean NOT NULL DEFAULT false,
  status entity_status NOT NULL DEFAULT 'attivo',
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_destinations TO authenticated;
GRANT ALL ON public.customer_destinations TO service_role;

ALTER TABLE public.customer_destinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Seller members read destinations"
ON public.customer_destinations FOR SELECT TO authenticated
USING (public.owns_customer_record(customer_record_id));

CREATE POLICY "Seller admins insert destinations"
ON public.customer_destinations FOR INSERT TO authenticated
WITH CHECK (public.owns_customer_record(customer_record_id) AND public.is_company_admin(seller_company_id));

CREATE POLICY "Seller admins update destinations"
ON public.customer_destinations FOR UPDATE TO authenticated
USING (public.owns_customer_record(customer_record_id) AND public.is_company_admin(seller_company_id))
WITH CHECK (public.owns_customer_record(customer_record_id) AND public.is_company_admin(seller_company_id));

CREATE INDEX customer_destinations_record_idx ON public.customer_destinations (customer_record_id);
CREATE UNIQUE INDEX customer_destinations_one_default_idx
  ON public.customer_destinations (customer_record_id) WHERE is_default;

CREATE TRIGGER set_customer_destinations_updated_at
BEFORE UPDATE ON public.customer_destinations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_customer_destination()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _seller uuid;
BEGIN
  SELECT seller_company_id INTO _seller
  FROM public.customer_records WHERE id = NEW.customer_record_id;
  IF _seller IS NULL THEN
    RAISE EXCEPTION 'Cliente inesistente';
  END IF;
  NEW.seller_company_id := _seller;

  IF NEW.address_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.addresses a
      WHERE a.id = NEW.address_id AND a.customer_record_id = NEW.customer_record_id
    ) THEN
      RAISE EXCEPTION 'L''indirizzo non appartiene a questo cliente';
    END IF;
  END IF;

  IF NEW.label IS NULL OR btrim(NEW.label) = '' THEN
    RAISE EXCEPTION 'Il nome della destinazione è obbligatorio';
  END IF;
  NEW.label := btrim(NEW.label);

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_customer_destination_trg
BEFORE INSERT OR UPDATE ON public.customer_destinations
FOR EACH ROW EXECUTE FUNCTION public.validate_customer_destination();

CREATE OR REPLACE FUNCTION public.manage_customer_destination(
  _customer_record_id uuid,
  _action text,
  _destination_id uuid DEFAULT NULL,
  _label text DEFAULT NULL,
  _address_id uuid DEFAULT NULL,
  _internal_code text DEFAULT NULL,
  _danea_reference text DEFAULT NULL,
  _contact_name text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _separate_documents boolean DEFAULT NULL,
  _is_default boolean DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _seller uuid;
  _id uuid;
BEGIN
  SELECT seller_company_id INTO _seller
  FROM public.customer_records WHERE id = _customer_record_id;
  IF _seller IS NULL THEN
    RAISE EXCEPTION 'Cliente inesistente';
  END IF;
  IF NOT public.is_company_admin(_seller) THEN
    RAISE EXCEPTION 'Solo un amministratore può gestire le destinazioni';
  END IF;

  IF _action = 'create' THEN
    INSERT INTO public.customer_destinations (
      seller_company_id, customer_record_id, address_id, label, internal_code,
      danea_reference, contact_name, phone, notes, separate_documents, created_by
    ) VALUES (
      _seller, _customer_record_id, _address_id, _label, nullif(btrim(coalesce(_internal_code,'')),''),
      nullif(btrim(coalesce(_danea_reference,'')),''), nullif(btrim(coalesce(_contact_name,'')),''),
      nullif(btrim(coalesce(_phone,'')),''), nullif(btrim(coalesce(_notes,'')),''),
      coalesce(_separate_documents, false), auth.uid()
    ) RETURNING id INTO _id;

    IF coalesce(_is_default, false) OR NOT EXISTS (
      SELECT 1 FROM public.customer_destinations
      WHERE customer_record_id = _customer_record_id AND is_default AND id <> _id
    ) THEN
      UPDATE public.customer_destinations SET is_default = false
      WHERE customer_record_id = _customer_record_id AND id <> _id AND is_default;
      UPDATE public.customer_destinations SET is_default = true WHERE id = _id;
    END IF;

  ELSIF _action = 'update' THEN
    UPDATE public.customer_destinations SET
      label = coalesce(_label, label),
      address_id = _address_id,
      internal_code = nullif(btrim(coalesce(_internal_code,'')),''),
      danea_reference = nullif(btrim(coalesce(_danea_reference,'')),''),
      contact_name = nullif(btrim(coalesce(_contact_name,'')),''),
      phone = nullif(btrim(coalesce(_phone,'')),''),
      notes = nullif(btrim(coalesce(_notes,'')),''),
      separate_documents = coalesce(_separate_documents, separate_documents)
    WHERE id = _destination_id AND customer_record_id = _customer_record_id
    RETURNING id INTO _id;
    IF _id IS NULL THEN
      RAISE EXCEPTION 'Destinazione inesistente';
    END IF;

  ELSIF _action IN ('activate', 'deactivate') THEN
    UPDATE public.customer_destinations
    SET status = CASE WHEN _action = 'activate' THEN 'attivo'::entity_status ELSE 'disattivato'::entity_status END,
        is_default = CASE WHEN _action = 'deactivate' THEN false ELSE is_default END
    WHERE id = _destination_id AND customer_record_id = _customer_record_id
    RETURNING id INTO _id;
    IF _id IS NULL THEN
      RAISE EXCEPTION 'Destinazione inesistente';
    END IF;

  ELSIF _action = 'set_default' THEN
    UPDATE public.customer_destinations SET is_default = false
    WHERE customer_record_id = _customer_record_id AND is_default;
    UPDATE public.customer_destinations SET is_default = true, status = 'attivo'
    WHERE id = _destination_id AND customer_record_id = _customer_record_id
    RETURNING id INTO _id;
    IF _id IS NULL THEN
      RAISE EXCEPTION 'Destinazione inesistente';
    END IF;

  ELSE
    RAISE EXCEPTION 'Azione non supportata';
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_seller, auth.uid(), 'customer_destination.' || _action, 'customer_destination', _id,
          jsonb_build_object('customer_record_id', _customer_record_id));

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.manage_customer_destination(uuid, text, uuid, text, uuid, text, text, text, text, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_customer_destination(uuid, text, uuid, text, uuid, text, text, text, text, text, boolean, boolean) TO authenticated;
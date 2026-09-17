CREATE TABLE public.product_images (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  archive_id uuid NOT NULL REFERENCES public.danea_archives(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  image_path text NOT NULL UNIQUE,
  thumbnail_path text NOT NULL UNIQUE,
  content_type text NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  byte_size integer NOT NULL,
  thumbnail_width integer NOT NULL,
  thumbnail_height integer NOT NULL,
  thumbnail_byte_size integer NOT NULL,
  checksum_sha256 text NOT NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_images_one_per_product UNIQUE (product_id),
  CONSTRAINT product_images_content_type_webp CHECK (content_type = 'image/webp'),
  CONSTRAINT product_images_dimensions_positive CHECK (width > 0 AND height > 0 AND thumbnail_width > 0 AND thumbnail_height > 0),
  CONSTRAINT product_images_sizes_positive CHECK (byte_size > 0 AND thumbnail_byte_size > 0),
  CONSTRAINT product_images_checksum_format CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$')
);
GRANT SELECT ON public.product_images TO authenticated;
GRANT ALL ON public.product_images TO service_role;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_images_select_member ON public.product_images
FOR SELECT TO authenticated
USING (public.is_company_member(company_id));
CREATE INDEX product_images_company_archive_idx ON public.product_images (company_id, archive_id, product_id);
CREATE TRIGGER product_images_set_updated_at
BEFORE UPDATE ON public.product_images
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_product_image_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _product_company uuid;
  _product_archive uuid;
BEGIN
  SELECT company_id, archive_id INTO _product_company, _product_archive
  FROM public.products
  WHERE id = NEW.product_id;

  IF _product_company IS NULL
     OR _product_company <> NEW.company_id
     OR _product_archive <> NEW.archive_id THEN
    RAISE EXCEPTION 'Immagine, prodotto e archivio devono appartenere alla stessa azienda';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_product_image_scope() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_product_image_scope() TO service_role;
CREATE TRIGGER product_images_validate_scope
BEFORE INSERT OR UPDATE OF company_id, archive_id, product_id ON public.product_images
FOR EACH ROW EXECUTE FUNCTION public.validate_product_image_scope();

CREATE OR REPLACE FUNCTION public.set_product_image(
  _company_id uuid,
  _archive_id uuid,
  _product_id uuid,
  _image_path text,
  _thumbnail_path text,
  _content_type text,
  _width integer,
  _height integer,
  _byte_size integer,
  _thumbnail_width integer,
  _thumbnail_height integer,
  _thumbnail_byte_size integer,
  _checksum_sha256 text,
  _actor_user_id uuid
)
RETURNS TABLE(old_image_path text, old_thumbnail_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old_image_path text;
  _old_thumbnail_path text;
BEGIN
  PERFORM 1 FROM public.products
  WHERE id = _product_id AND company_id = _company_id AND archive_id = _archive_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prodotto non trovato per questa azienda e archivio'; END IF;

  SELECT pi.image_path, pi.thumbnail_path
  INTO _old_image_path, _old_thumbnail_path
  FROM public.product_images pi
  WHERE pi.product_id = _product_id;

  INSERT INTO public.product_images (
    company_id, archive_id, product_id, image_path, thumbnail_path, content_type,
    width, height, byte_size, thumbnail_width, thumbnail_height, thumbnail_byte_size,
    checksum_sha256, uploaded_by
  ) VALUES (
    _company_id, _archive_id, _product_id, _image_path, _thumbnail_path, _content_type,
    _width, _height, _byte_size, _thumbnail_width, _thumbnail_height, _thumbnail_byte_size,
    _checksum_sha256, _actor_user_id
  )
  ON CONFLICT (product_id) DO UPDATE SET
    image_path = EXCLUDED.image_path,
    thumbnail_path = EXCLUDED.thumbnail_path,
    content_type = EXCLUDED.content_type,
    width = EXCLUDED.width,
    height = EXCLUDED.height,
    byte_size = EXCLUDED.byte_size,
    thumbnail_width = EXCLUDED.thumbnail_width,
    thumbnail_height = EXCLUDED.thumbnail_height,
    thumbnail_byte_size = EXCLUDED.thumbnail_byte_size,
    checksum_sha256 = EXCLUDED.checksum_sha256,
    uploaded_by = EXCLUDED.uploaded_by;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (
    _company_id, _actor_user_id,
    CASE WHEN _old_image_path IS NULL THEN 'product_image.uploaded' ELSE 'product_image.replaced' END,
    'product', _product_id,
    jsonb_build_object('image_path', _image_path, 'thumbnail_path', _thumbnail_path, 'old_image_path', _old_image_path, 'old_thumbnail_path', _old_thumbnail_path)
  );

  RETURN QUERY SELECT _old_image_path, _old_thumbnail_path;
END;
$$;
REVOKE ALL ON FUNCTION public.set_product_image(uuid, uuid, uuid, text, text, text, integer, integer, integer, integer, integer, integer, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_product_image(uuid, uuid, uuid, text, text, text, integer, integer, integer, integer, integer, integer, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.remove_product_image(
  _company_id uuid,
  _product_id uuid,
  _actor_user_id uuid
)
RETURNS TABLE(old_image_path text, old_thumbnail_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old_image_path text;
  _old_thumbnail_path text;
BEGIN
  PERFORM 1 FROM public.products
  WHERE id = _product_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prodotto non trovato per questa azienda'; END IF;

  DELETE FROM public.product_images
  WHERE product_id = _product_id AND company_id = _company_id
  RETURNING image_path, thumbnail_path INTO _old_image_path, _old_thumbnail_path;

  IF _old_image_path IS NULL THEN RAISE EXCEPTION 'Immagine prodotto non trovata'; END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, _actor_user_id, 'product_image.removed', 'product', _product_id,
          jsonb_build_object('image_path', _old_image_path, 'thumbnail_path', _old_thumbnail_path));

  RETURN QUERY SELECT _old_image_path, _old_thumbnail_path;
END;
$$;
REVOKE ALL ON FUNCTION public.remove_product_image(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_product_image(uuid, uuid, uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.add_shopping_list_items(_company_id uuid, _list_id uuid, _items jsonb, _replace_existing boolean DEFAULT false, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_archive uuid;
  v_added integer := 0;
  v_skipped integer := 0;
  v_updated integer := 0;
  it jsonb;
  v_product uuid;
  v_unit_id uuid;
  v_unit_code text;
  v_decided numeric;
  v_suggested numeric;
  v_decided_unit_id uuid;
  v_decided_unit_code text;
  v_exists uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso non consentito'; END IF;
  IF _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN RAISE EXCEPTION 'Autore non valido: deve coincidere con l''utente collegato'; END IF;
  _actor_user_id := auth.uid();
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  SELECT archive_id INTO v_archive FROM public.shopping_lists
   WHERE id = _list_id AND company_id = _company_id AND status = 'aperta';
  IF v_archive IS NULL THEN RAISE EXCEPTION 'Lista non trovata o non più aperta'; END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) LOOP
    v_product := (it->>'product_id')::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM public.products
       WHERE id = v_product AND company_id = _company_id AND archive_id = v_archive
    ) THEN
      RAISE EXCEPTION 'Prodotto non valido per questo archivio';
    END IF;

    v_suggested := NULLIF(it->>'suggested_quantity', '')::numeric;
    -- La quantità decisa è facoltativa: vuota resta vuota (mai 0).
    v_decided := COALESCE(NULLIF(it->>'decided_quantity', '')::numeric, v_suggested);
    IF v_decided IS NOT NULL AND v_decided <= 0 THEN
      v_decided := NULL;
    END IF;

    SELECT s.stock_unit_id, COALESCE(u.code, p.danea_um)
      INTO v_unit_id, v_unit_code
      FROM public.products p
      LEFT JOIN public.product_stock_settings s ON s.product_id = p.id
      LEFT JOIN public.units_of_measure u ON u.id = s.stock_unit_id
     WHERE p.id = v_product;

    -- U.M. della quantità decisa scelta all'aggiunta: facoltativa, NULL = U.M. del prodotto.
    v_decided_unit_id := NULLIF(it->>'decided_unit_id', '')::uuid;
    v_decided_unit_code := NULLIF(btrim(COALESCE(it->>'decided_unit_code', '')), '');
    IF v_decided_unit_id IS NOT NULL THEN
      SELECT u.code INTO v_decided_unit_code FROM public.units_of_measure u WHERE u.id = v_decided_unit_id;
      IF v_decided_unit_code IS NULL THEN
        RAISE EXCEPTION 'Unità di misura non valida';
      END IF;
    END IF;
    IF v_decided IS NULL THEN
      v_decided_unit_id := NULL;
      v_decided_unit_code := NULL;
    END IF;

    SELECT id INTO v_exists FROM public.shopping_list_items
     WHERE list_id = _list_id AND product_id = v_product;

    IF v_exists IS NOT NULL THEN
      IF _replace_existing THEN
        UPDATE public.shopping_list_items
           SET suggested_quantity = v_suggested,
               snapshot_available = NULLIF(it->>'available', '')::numeric,
               snapshot_needed = NULLIF(it->>'needed', '')::numeric,
               snapshot_min_stock = NULLIF(it->>'min_stock', '')::numeric,
               snapshot_raw_need = NULLIF(it->>'raw_need', '')::numeric,
               snapshot_order_multiple = NULLIF(it->>'order_multiple', '')::numeric
         WHERE id = v_exists;
        v_updated := v_updated + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
      CONTINUE;
    END IF;

    INSERT INTO public.shopping_list_items (
      company_id, list_id, product_id, unit_id, unit_code,
      suggested_quantity, decided_quantity, decided_unit_id, decided_unit_code, origin,
      snapshot_available, snapshot_needed, snapshot_min_stock, snapshot_raw_need, snapshot_order_multiple,
      created_by, decided_by, decided_at
    )
    VALUES (
      _company_id, _list_id, v_product, v_unit_id, v_unit_code,
      v_suggested, v_decided, v_decided_unit_id, v_decided_unit_code,
      COALESCE(NULLIF(it->>'origin', '')::public.shopping_list_item_origin, 'manuale'),
      NULLIF(it->>'available', '')::numeric,
      NULLIF(it->>'needed', '')::numeric,
      NULLIF(it->>'min_stock', '')::numeric,
      NULLIF(it->>'raw_need', '')::numeric,
      NULLIF(it->>'order_multiple', '')::numeric,
      _actor_user_id, CASE WHEN v_decided IS NOT NULL THEN _actor_user_id END, CASE WHEN v_decided IS NOT NULL THEN now() END
    );
    v_added := v_added + 1;
  END LOOP;

  RETURN jsonb_build_object('added', v_added, 'skipped', v_skipped, 'updated', v_updated);
END;
$function$;
CREATE TYPE public.shopping_list_status AS ENUM ('aperta', 'confermata', 'chiusa', 'annullata');
CREATE TYPE public.shopping_list_item_origin AS ENUM ('manuale', 'fabbisogno');

CREATE TABLE public.shopping_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  archive_id uuid NOT NULL REFERENCES public.danea_archives(id),
  name text NOT NULL,
  status public.shopping_list_status NOT NULL DEFAULT 'aperta',
  notes text,
  created_by uuid,
  confirmed_at timestamptz,
  confirmed_by uuid,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shopping_lists TO authenticated;
GRANT ALL ON public.shopping_lists TO service_role;
ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shopping_lists_select" ON public.shopping_lists FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE UNIQUE INDEX shopping_lists_one_open ON public.shopping_lists (company_id, archive_id)
  WHERE status = 'aperta';
CREATE TRIGGER shopping_lists_updated_at BEFORE UPDATE ON public.shopping_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.shopping_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  list_id uuid NOT NULL REFERENCES public.shopping_lists(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  unit_id uuid REFERENCES public.units_of_measure(id),
  unit_code text,
  suggested_quantity numeric(14,3),
  decided_quantity numeric(14,3) NOT NULL,
  change_reason text,
  origin public.shopping_list_item_origin NOT NULL DEFAULT 'manuale',
  snapshot_available numeric(14,3),
  snapshot_needed numeric(14,3),
  snapshot_min_stock numeric(14,3),
  snapshot_raw_need numeric(14,3),
  snapshot_order_multiple numeric(14,3),
  notes text,
  created_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shopping_list_items TO authenticated;
GRANT ALL ON public.shopping_list_items TO service_role;
ALTER TABLE public.shopping_list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shopping_list_items_select" ON public.shopping_list_items FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE UNIQUE INDEX shopping_list_items_unique ON public.shopping_list_items (list_id, product_id);
CREATE INDEX shopping_list_items_product ON public.shopping_list_items (product_id);
CREATE TRIGGER shopping_list_items_updated_at BEFORE UPDATE ON public.shopping_list_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.shopping_list_item_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  item_id uuid NOT NULL REFERENCES public.shopping_list_items(id) ON DELETE CASCADE,
  product_supplier_link_id uuid NOT NULL REFERENCES public.product_supplier_links(id),
  supplier_record_id uuid NOT NULL REFERENCES public.supplier_records(id),
  assigned_quantity numeric(14,3) NOT NULL,
  purchase_quantity numeric(14,3),
  purchase_unit_id uuid REFERENCES public.units_of_measure(id),
  purchase_unit_code text,
  conversion_factor numeric(14,4),
  min_warning_accepted boolean NOT NULL DEFAULT false,
  min_warning_accepted_by uuid,
  min_warning_accepted_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shopping_list_item_suppliers_qty CHECK (assigned_quantity > 0),
  CONSTRAINT shopping_list_item_suppliers_purchase_qty CHECK (purchase_quantity IS NULL OR purchase_quantity > 0)
);
GRANT SELECT ON public.shopping_list_item_suppliers TO authenticated;
GRANT ALL ON public.shopping_list_item_suppliers TO service_role;
ALTER TABLE public.shopping_list_item_suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shopping_list_item_suppliers_select" ON public.shopping_list_item_suppliers FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE UNIQUE INDEX shopping_list_item_suppliers_unique
  ON public.shopping_list_item_suppliers (item_id, supplier_record_id);
CREATE TRIGGER shopping_list_item_suppliers_updated_at BEFORE UPDATE ON public.shopping_list_item_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Le righe si modificano solo mentre la lista è aperta: una lista confermata è storia.
CREATE OR REPLACE FUNCTION public.assert_shopping_list_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list uuid;
  v_status public.shopping_list_status;
BEGIN
  IF TG_TABLE_NAME = 'shopping_list_items' THEN
    v_list := COALESCE(NEW.list_id, OLD.list_id);
  ELSE
    SELECT list_id INTO v_list FROM public.shopping_list_items
     WHERE id = COALESCE(NEW.item_id, OLD.item_id);
  END IF;
  SELECT status INTO v_status FROM public.shopping_lists WHERE id = v_list;
  IF v_status IS DISTINCT FROM 'aperta' THEN
    RAISE EXCEPTION 'La lista non è più aperta: non può essere modificata';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.assert_shopping_list_open() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER shopping_list_items_open BEFORE INSERT OR UPDATE OR DELETE ON public.shopping_list_items
  FOR EACH ROW EXECUTE FUNCTION public.assert_shopping_list_open();
CREATE TRIGGER shopping_list_item_suppliers_open BEFORE INSERT OR UPDATE OR DELETE ON public.shopping_list_item_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.assert_shopping_list_open();

-- Stato della riga e residuo: un solo punto di calcolo, usato da elenco e conferma.
CREATE OR REPLACE FUNCTION public.shopping_list_item_state(_item_id uuid)
RETURNS TABLE (
  assigned numeric,
  remaining numeric,
  status text,
  untranslatable integer,
  under_minimum integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH item AS (
    SELECT i.id, i.decided_quantity, lower(coalesce(i.unit_code, '')) AS unit_code
      FROM public.shopping_list_items i WHERE i.id = _item_id
  ), asg AS (
    SELECT a.assigned_quantity,
           lower(coalesce(l.conversion_reference_um, u.code, '')) AS purchase_code,
           l.conversion_factor,
           l.min_quantity,
           a.min_warning_accepted
      FROM public.shopping_list_item_suppliers a
      JOIN public.product_supplier_links l ON l.id = a.product_supplier_link_id
      LEFT JOIN public.units_of_measure u ON u.id = l.purchase_unit_id
     WHERE a.item_id = _item_id
  ), agg AS (
    SELECT COALESCE(sum(assigned_quantity), 0) AS assigned,
           COUNT(*) FILTER (
             WHERE purchase_code <> '' AND purchase_code <> (SELECT unit_code FROM item)
               AND conversion_factor IS NULL
           )::int AS untranslatable,
           COUNT(*) FILTER (
             WHERE min_quantity IS NOT NULL AND assigned_quantity < min_quantity AND NOT min_warning_accepted
           )::int AS under_minimum
      FROM asg
  )
  SELECT agg.assigned,
         item.decided_quantity - agg.assigned,
         CASE
           WHEN agg.assigned = 0 THEN 'da_assegnare'
           WHEN agg.assigned = item.decided_quantity AND agg.untranslatable = 0 THEN 'assegnata'
           ELSE 'parziale'
         END,
         agg.untranslatable,
         agg.under_minimum
    FROM item CROSS JOIN agg;
$$;
REVOKE EXECUTE ON FUNCTION public.shopping_list_item_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shopping_list_item_state(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.manage_shopping_list(
  _company_id uuid,
  _action text,
  _list_id uuid DEFAULT NULL,
  _archive_id uuid DEFAULT NULL,
  _name text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_bad text;
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;

  IF _action = 'open' THEN
    IF _archive_id IS NULL THEN RAISE EXCEPTION 'Archivio obbligatorio'; END IF;
    INSERT INTO public.shopping_lists (company_id, archive_id, name, notes, created_by)
    VALUES (_company_id, _archive_id,
            COALESCE(NULLIF(btrim(_name), ''), 'Lista ' || to_char(now(), 'DD/MM/YYYY HH24:MI')),
            _notes, _actor_user_id)
    RETURNING id INTO v_id;
  ELSE
    SELECT id INTO v_id FROM public.shopping_lists WHERE id = _list_id AND company_id = _company_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Lista non trovata'; END IF;

    IF _action = 'rename' THEN
      UPDATE public.shopping_lists
         SET name = COALESCE(NULLIF(btrim(_name), ''), name), notes = COALESCE(_notes, notes)
       WHERE id = v_id;
    ELSIF _action = 'confirm' THEN
      SELECT string_agg(p.code, ', ' ORDER BY p.code) INTO v_bad
        FROM public.shopping_list_items i
        JOIN public.products p ON p.id = i.product_id
        CROSS JOIN LATERAL public.shopping_list_item_state(i.id) s
       WHERE i.list_id = v_id AND s.status <> 'assegnata';
      IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'Righe non pronte (quantità non ripartita o conversione mancante): %', v_bad;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.shopping_list_items WHERE list_id = v_id) THEN
        RAISE EXCEPTION 'La lista è vuota';
      END IF;
      UPDATE public.shopping_lists
         SET status = 'confermata', confirmed_at = now(), confirmed_by = _actor_user_id
       WHERE id = v_id AND status = 'aperta';
    ELSIF _action = 'close' THEN
      UPDATE public.shopping_lists SET status = 'chiusa', closed_at = now()
       WHERE id = v_id AND status IN ('aperta', 'confermata');
    ELSIF _action = 'cancel' THEN
      UPDATE public.shopping_lists SET status = 'annullata', closed_at = now()
       WHERE id = v_id AND status = 'aperta';
    ELSE
      RAISE EXCEPTION 'Azione non valida';
    END IF;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, detail)
  VALUES (_company_id, _actor_user_id, 'shopping_list.' || _action, 'shopping_list', v_id, NULL);

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.manage_shopping_list(uuid, text, uuid, uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_shopping_list(uuid, text, uuid, uuid, text, text, uuid) TO authenticated;

-- Aggiunta di uno o più prodotti: mai due righe dello stesso prodotto nella stessa lista.
CREATE OR REPLACE FUNCTION public.add_shopping_list_items(
  _company_id uuid,
  _list_id uuid,
  _items jsonb,
  _replace_existing boolean DEFAULT false,
  _actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_exists uuid;
BEGIN
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
    v_decided := COALESCE(NULLIF(it->>'decided_quantity', '')::numeric, v_suggested, 0);
    IF v_decided <= 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT s.stock_unit_id, COALESCE(u.code, p.danea_um)
      INTO v_unit_id, v_unit_code
      FROM public.products p
      LEFT JOIN public.product_stock_settings s ON s.product_id = p.id
      LEFT JOIN public.units_of_measure u ON u.id = s.stock_unit_id
     WHERE p.id = v_product;

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
      suggested_quantity, decided_quantity, origin,
      snapshot_available, snapshot_needed, snapshot_min_stock, snapshot_raw_need, snapshot_order_multiple,
      created_by, decided_by, decided_at
    )
    VALUES (
      _company_id, _list_id, v_product, v_unit_id, v_unit_code,
      v_suggested, v_decided,
      COALESCE(NULLIF(it->>'origin', '')::public.shopping_list_item_origin, 'manuale'),
      NULLIF(it->>'available', '')::numeric,
      NULLIF(it->>'needed', '')::numeric,
      NULLIF(it->>'min_stock', '')::numeric,
      NULLIF(it->>'raw_need', '')::numeric,
      NULLIF(it->>'order_multiple', '')::numeric,
      _actor_user_id, _actor_user_id, now()
    );
    v_added := v_added + 1;
  END LOOP;

  RETURN jsonb_build_object('added', v_added, 'skipped', v_skipped, 'updated', v_updated);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.add_shopping_list_items(uuid, uuid, jsonb, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_shopping_list_items(uuid, uuid, jsonb, boolean, uuid) TO authenticated;

-- La quantità suggerita non viene mai sovrascritta: cambia solo quella decisa.
CREATE OR REPLACE FUNCTION public.set_shopping_list_item_quantity(
  _company_id uuid,
  _item_id uuid,
  _decided_quantity numeric,
  _reason text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  IF _decided_quantity IS NULL OR _decided_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantità non valida';
  END IF;

  UPDATE public.shopping_list_items
     SET decided_quantity = _decided_quantity,
         change_reason = COALESCE(NULLIF(btrim(_reason), ''), change_reason),
         notes = COALESCE(_notes, notes),
         decided_by = _actor_user_id,
         decided_at = now()
   WHERE id = _item_id AND company_id = _company_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Riga non trovata'; END IF;
  RETURN _item_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_shopping_list_item_quantity(uuid, uuid, numeric, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_shopping_list_item_quantity(uuid, uuid, numeric, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_shopping_list_item(
  _company_id uuid,
  _item_id uuid,
  _actor_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  DELETE FROM public.shopping_list_items WHERE id = _item_id AND company_id = _company_id;
  RETURN FOUND;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.remove_shopping_list_item(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_shopping_list_item(uuid, uuid, uuid) TO authenticated;

-- Assegnazione a un fornitore: nessuna redistribuzione automatica delle altre assegnazioni.
CREATE OR REPLACE FUNCTION public.assign_shopping_list_supplier(
  _company_id uuid,
  _item_id uuid,
  _action text,
  _link_id uuid DEFAULT NULL,
  _assigned_quantity numeric DEFAULT NULL,
  _purchase_quantity numeric DEFAULT NULL,
  _min_warning_accepted boolean DEFAULT false,
  _notes text DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product uuid;
  v_link record;
  v_id uuid;
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  SELECT product_id INTO v_product FROM public.shopping_list_items
   WHERE id = _item_id AND company_id = _company_id;
  IF v_product IS NULL THEN RAISE EXCEPTION 'Riga non trovata'; END IF;

  IF _action = 'remove' THEN
    DELETE FROM public.shopping_list_item_suppliers
     WHERE item_id = _item_id AND product_supplier_link_id = _link_id;
    RETURN _item_id;
  ELSIF _action <> 'set' THEN
    RAISE EXCEPTION 'Azione non valida';
  END IF;

  SELECT l.*, u.code AS unit_code INTO v_link
    FROM public.product_supplier_links l
    LEFT JOIN public.units_of_measure u ON u.id = l.purchase_unit_id
   WHERE l.id = _link_id AND l.company_id = _company_id AND l.product_id = v_product;
  IF v_link.id IS NULL THEN RAISE EXCEPTION 'Fornitore non associato a questo prodotto'; END IF;
  IF NOT v_link.is_active THEN RAISE EXCEPTION 'Associazione fornitore non attiva'; END IF;
  IF _assigned_quantity IS NULL OR _assigned_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantità da assegnare non valida';
  END IF;

  INSERT INTO public.shopping_list_item_suppliers (
    company_id, item_id, product_supplier_link_id, supplier_record_id,
    assigned_quantity, purchase_quantity, purchase_unit_id, purchase_unit_code, conversion_factor,
    min_warning_accepted, min_warning_accepted_by, min_warning_accepted_at, notes, created_by
  )
  VALUES (
    _company_id, _item_id, v_link.id, v_link.supplier_record_id,
    _assigned_quantity, _purchase_quantity, v_link.purchase_unit_id,
    COALESCE(v_link.unit_code, v_link.conversion_reference_um), v_link.conversion_factor,
    COALESCE(_min_warning_accepted, false),
    CASE WHEN _min_warning_accepted THEN _actor_user_id END,
    CASE WHEN _min_warning_accepted THEN now() END,
    _notes, _actor_user_id
  )
  ON CONFLICT (item_id, supplier_record_id) DO UPDATE SET
    product_supplier_link_id = EXCLUDED.product_supplier_link_id,
    assigned_quantity = EXCLUDED.assigned_quantity,
    purchase_quantity = EXCLUDED.purchase_quantity,
    purchase_unit_id = EXCLUDED.purchase_unit_id,
    purchase_unit_code = EXCLUDED.purchase_unit_code,
    conversion_factor = EXCLUDED.conversion_factor,
    min_warning_accepted = EXCLUDED.min_warning_accepted,
    min_warning_accepted_by = EXCLUDED.min_warning_accepted_by,
    min_warning_accepted_at = EXCLUDED.min_warning_accepted_at,
    notes = EXCLUDED.notes
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.assign_shopping_list_supplier(uuid, uuid, text, uuid, numeric, numeric, boolean, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_shopping_list_supplier(uuid, uuid, text, uuid, numeric, numeric, boolean, text, uuid) TO authenticated;

-- Elenco operativo: riga, residuo, stato e suggerimento attuale ricalcolato per confronto.
CREATE OR REPLACE FUNCTION public.shopping_list_overview(_list_id uuid)
RETURNS TABLE (
  item_id uuid,
  product_id uuid,
  code text,
  description text,
  unit_code text,
  suggested_quantity numeric,
  decided_quantity numeric,
  change_reason text,
  origin text,
  snapshot_available numeric,
  snapshot_needed numeric,
  snapshot_min_stock numeric,
  snapshot_raw_need numeric,
  snapshot_order_multiple numeric,
  current_available numeric,
  current_min_stock numeric,
  current_order_multiple numeric,
  current_suggested numeric,
  assigned numeric,
  remaining numeric,
  status text,
  untranslatable integer,
  under_minimum integer,
  suppliers_available integer,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id,
         i.product_id,
         p.code,
         p.description,
         i.unit_code,
         i.suggested_quantity,
         i.decided_quantity,
         i.change_reason,
         i.origin::text,
         i.snapshot_available,
         i.snapshot_needed,
         i.snapshot_min_stock,
         i.snapshot_raw_need,
         i.snapshot_order_multiple,
         (o.j->>'total')::numeric,
         (o.j->>'min_stock')::numeric,
         (o.j->>'order_multiple')::numeric,
         (SELECT n.suggested FROM public.compute_purchase_need(
            COALESCE(i.snapshot_needed, 0), (o.j->>'min_stock')::numeric,
            (o.j->>'total')::numeric, (o.j->>'order_multiple')::numeric) n),
         s.assigned,
         s.remaining,
         s.status,
         s.untranslatable,
         s.under_minimum,
         (SELECT count(*)::int FROM public.product_supplier_links l
           WHERE l.product_id = i.product_id AND l.is_active),
         i.created_at
    FROM public.shopping_list_items i
    JOIN public.shopping_lists sl ON sl.id = i.list_id
    JOIN public.products p ON p.id = i.product_id
    CROSS JOIN LATERAL public.shopping_list_item_state(i.id) s
    CROSS JOIN LATERAL (SELECT public.product_stock_overview(i.product_id) AS j) o
   WHERE i.list_id = _list_id
     AND public.is_company_member(sl.company_id)
   ORDER BY p.code;
$$;
REVOKE EXECUTE ON FUNCTION public.shopping_list_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shopping_list_overview(uuid) TO authenticated;
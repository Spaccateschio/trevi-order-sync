-- 1. Storico append-only dei conteggi e delle segnalazioni
CREATE TABLE public.inventory_count_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.inventory_sessions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN ('conteggio','riconteggio','segnalazione','revoca_segnalazione','richiesta_riconteggio')),
  counted_quantity numeric,
  previous_quantity numeric,
  unit_id uuid REFERENCES public.units_of_measure(id),
  unit_code text,
  non_compliant boolean NOT NULL DEFAULT false,
  non_compliant_quantity numeric CHECK (non_compliant_quantity IS NULL OR non_compliant_quantity >= 0),
  note text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.inventory_count_entries TO authenticated;
GRANT ALL ON public.inventory_count_entries TO service_role;
ALTER TABLE public.inventory_count_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read count history" ON public.inventory_count_entries
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

CREATE INDEX inventory_count_entries_product_idx
  ON public.inventory_count_entries (company_id, product_id, created_at DESC);
CREATE INDEX inventory_count_entries_session_idx
  ON public.inventory_count_entries (session_id, product_id, location_id, created_at DESC);

CREATE TRIGGER inventory_count_entries_append_only
  BEFORE UPDATE OR DELETE ON public.inventory_count_entries
  FOR EACH ROW EXECUTE FUNCTION public.deny_history_write();

-- 2. Fotografia corrente: ricontrollo richiesto e non conformità
ALTER TABLE public.inventory_counts
  ADD COLUMN recount_requested_at timestamp with time zone,
  ADD COLUMN recount_requested_by uuid,
  ADD COLUMN non_compliant boolean NOT NULL DEFAULT false,
  ADD COLUMN non_compliant_quantity numeric,
  ADD COLUMN non_compliant_note text;

-- 3. Proposte di acquisto persistenti
CREATE TABLE public.product_purchase_proposals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'aperta' CHECK (status IN ('aperta','risolta')),
  opened_at timestamp with time zone NOT NULL DEFAULT now(),
  opened_by uuid,
  opened_note text,
  last_flagged_at timestamp with time zone NOT NULL DEFAULT now(),
  last_flagged_by uuid,
  flag_count integer NOT NULL DEFAULT 1,
  origin text NOT NULL DEFAULT 'inventario',
  session_id uuid REFERENCES public.inventory_sessions(id) ON DELETE SET NULL,
  resolved_at timestamp with time zone,
  resolved_by uuid,
  resolution_reason text,
  resolution_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.product_purchase_proposals TO authenticated;
GRANT ALL ON public.product_purchase_proposals TO service_role;
ALTER TABLE public.product_purchase_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read purchase proposals" ON public.product_purchase_proposals
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

CREATE UNIQUE INDEX product_purchase_proposals_open_key
  ON public.product_purchase_proposals (company_id, product_id)
  WHERE status = 'aperta';
CREATE INDEX product_purchase_proposals_company_idx
  ON public.product_purchase_proposals (company_id, status, last_flagged_at DESC);

CREATE TRIGGER product_purchase_proposals_updated_at
  BEFORE UPDATE ON public.product_purchase_proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.product_purchase_proposal_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id uuid NOT NULL REFERENCES public.product_purchase_proposals(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('segnalata','ri_segnalata','risolta_manuale','risolta_lista')),
  note text,
  reference_id uuid,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.product_purchase_proposal_events TO authenticated;
GRANT ALL ON public.product_purchase_proposal_events TO service_role;
ALTER TABLE public.product_purchase_proposal_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read proposal history" ON public.product_purchase_proposal_events
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

CREATE INDEX product_purchase_proposal_events_proposal_idx
  ON public.product_purchase_proposal_events (proposal_id, created_at DESC);

CREATE TRIGGER product_purchase_proposal_events_append_only
  BEFORE UPDATE OR DELETE ON public.product_purchase_proposal_events
  FOR EACH ROW EXECUTE FUNCTION public.deny_history_write();

-- 4. Registrazione conteggio / riconteggio / segnalazione con storico
CREATE OR REPLACE FUNCTION public.record_inventory_count_entry(
  _company_id uuid,
  _session_id uuid,
  _product_id uuid,
  _location_id uuid,
  _entry_type text DEFAULT 'conteggio',
  _counted_quantity numeric DEFAULT NULL,
  _unit_id uuid DEFAULT NULL,
  _unit_code text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _non_compliant boolean DEFAULT NULL,
  _non_compliant_quantity numeric DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session public.inventory_sessions;
  v_current public.inventory_counts;
  v_previous numeric;
  v_quantity numeric;
  v_non_compliant boolean;
  v_non_compliant_qty numeric;
  v_entry_id uuid;
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  IF _entry_type NOT IN ('conteggio','riconteggio','segnalazione','revoca_segnalazione','richiesta_riconteggio') THEN
    RAISE EXCEPTION 'Tipo di registrazione non valido';
  END IF;

  SELECT * INTO v_session FROM public.inventory_sessions WHERE id = _session_id AND company_id = _company_id;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Sessione di inventario inesistente';
  END IF;
  IF v_session.status <> 'in_corso' THEN
    RAISE EXCEPTION 'Sessione di inventario non aperta';
  END IF;

  SELECT * INTO v_current FROM public.inventory_counts
   WHERE session_id = _session_id AND product_id = _product_id AND location_id = _location_id;

  IF _entry_type IN ('conteggio','riconteggio') THEN
    IF _counted_quantity IS NULL OR _counted_quantity < 0 THEN
      RAISE EXCEPTION 'Quantità contata non valida';
    END IF;
    v_quantity := _counted_quantity;
  ELSE
    v_quantity := v_current.counted_quantity;
  END IF;

  IF _entry_type = 'revoca_segnalazione' THEN
    v_non_compliant := false;
    v_non_compliant_qty := NULL;
  ELSE
    v_non_compliant := COALESCE(_non_compliant, COALESCE(v_current.non_compliant, false));
    v_non_compliant_qty := CASE WHEN v_non_compliant
      THEN COALESCE(_non_compliant_quantity, CASE WHEN _non_compliant IS NULL THEN v_current.non_compliant_quantity ELSE NULL END)
      ELSE NULL END;
  END IF;

  IF v_non_compliant AND _entry_type = 'segnalazione' AND COALESCE(NULLIF(btrim(COALESCE(_notes, '')), ''), NULL) IS NULL THEN
    RAISE EXCEPTION 'Motivazione obbligatoria per la segnalazione di non conformità';
  END IF;
  IF v_non_compliant_qty IS NOT NULL AND v_non_compliant_qty < 0 THEN
    RAISE EXCEPTION 'Quantità non conforme non valida';
  END IF;
  IF v_non_compliant_qty IS NOT NULL AND v_quantity IS NOT NULL AND v_non_compliant_qty > v_quantity THEN
    RAISE EXCEPTION 'La quantità non conforme non può superare la quantità fisica confermata';
  END IF;

  SELECT quantity INTO v_previous FROM public.inventory_location_stock(_product_id, _location_id);

  IF _entry_type IN ('conteggio','riconteggio') THEN
    INSERT INTO public.inventory_counts (
      company_id, session_id, product_id, location_id, counted_quantity, unit_id, unit_code,
      previous_quantity, counted_at, counted_by, notes,
      recount_requested_at, recount_requested_by,
      non_compliant, non_compliant_quantity, non_compliant_note
    )
    VALUES (_company_id, _session_id, _product_id, _location_id, v_quantity, _unit_id, _unit_code,
            COALESCE(v_previous, 0), clock_timestamp(), _actor_user_id, _notes,
            NULL, NULL, v_non_compliant, v_non_compliant_qty,
            CASE WHEN v_non_compliant THEN COALESCE(_notes, v_current.non_compliant_note) ELSE NULL END)
    ON CONFLICT (session_id, product_id, location_id) DO UPDATE SET
      counted_quantity = EXCLUDED.counted_quantity,
      unit_id = EXCLUDED.unit_id,
      unit_code = EXCLUDED.unit_code,
      previous_quantity = EXCLUDED.previous_quantity,
      counted_at = clock_timestamp(),
      counted_by = EXCLUDED.counted_by,
      notes = EXCLUDED.notes,
      recount_requested_at = NULL,
      recount_requested_by = NULL,
      non_compliant = EXCLUDED.non_compliant,
      non_compliant_quantity = EXCLUDED.non_compliant_quantity,
      non_compliant_note = EXCLUDED.non_compliant_note;
  ELSIF _entry_type = 'richiesta_riconteggio' THEN
    IF v_current.id IS NULL THEN
      RAISE EXCEPTION 'Nessun conteggio confermato da ricontrollare';
    END IF;
    UPDATE public.inventory_counts
       SET recount_requested_at = clock_timestamp(), recount_requested_by = _actor_user_id
     WHERE id = v_current.id;
  ELSE
    IF v_current.id IS NULL THEN
      INSERT INTO public.inventory_counts (
        company_id, session_id, product_id, location_id, counted_quantity, unit_id, unit_code,
        previous_quantity, counted_at, counted_by, notes,
        non_compliant, non_compliant_quantity, non_compliant_note
      )
      VALUES (_company_id, _session_id, _product_id, _location_id, NULL, _unit_id, _unit_code,
              COALESCE(v_previous, 0), NULL, NULL, NULL,
              v_non_compliant, v_non_compliant_qty, CASE WHEN v_non_compliant THEN _notes ELSE NULL END);
    ELSE
      UPDATE public.inventory_counts
         SET non_compliant = v_non_compliant,
             non_compliant_quantity = v_non_compliant_qty,
             non_compliant_note = CASE WHEN v_non_compliant THEN COALESCE(_notes, non_compliant_note) ELSE NULL END
       WHERE id = v_current.id;
    END IF;
  END IF;

  INSERT INTO public.inventory_count_entries (
    company_id, session_id, product_id, location_id, entry_type, counted_quantity, previous_quantity,
    unit_id, unit_code, non_compliant, non_compliant_quantity, note, created_by
  )
  VALUES (_company_id, _session_id, _product_id, _location_id, _entry_type,
          CASE WHEN _entry_type IN ('conteggio','riconteggio') THEN v_quantity ELSE NULL END,
          COALESCE(v_previous, 0), _unit_id, _unit_code, v_non_compliant, v_non_compliant_qty,
          NULLIF(btrim(COALESCE(_notes, '')), ''), _actor_user_id)
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_inventory_count_entry(uuid,uuid,uuid,uuid,text,numeric,uuid,text,text,boolean,numeric,uuid) FROM PUBLIC, anon;

-- 5. Storico leggibile di un prodotto
CREATE OR REPLACE FUNCTION public.inventory_count_history(
  _company_id uuid,
  _product_id uuid,
  _location_id uuid DEFAULT NULL,
  _limit integer DEFAULT 50
) RETURNS TABLE(
  id uuid, session_id uuid, location_id uuid, location_name text, entry_type text,
  counted_quantity numeric, previous_quantity numeric, unit_code text,
  non_compliant boolean, non_compliant_quantity numeric, note text,
  created_by uuid, created_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  RETURN QUERY
  SELECT e.id, e.session_id, e.location_id, l.name, e.entry_type,
         e.counted_quantity, e.previous_quantity, e.unit_code,
         e.non_compliant, e.non_compliant_quantity, e.note,
         e.created_by, e.created_at
    FROM public.inventory_count_entries e
    LEFT JOIN public.inventory_locations l ON l.id = e.location_id
   WHERE e.company_id = _company_id
     AND e.product_id = _product_id
     AND (_location_id IS NULL OR e.location_id = _location_id)
   ORDER BY e.created_at DESC, e.id DESC
   LIMIT GREATEST(COALESCE(_limit, 50), 1);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.inventory_count_history(uuid,uuid,uuid,integer) FROM PUBLIC, anon;

-- 6. Proposte di acquisto: segnalazione e risoluzione
CREATE OR REPLACE FUNCTION public.manage_purchase_proposal(
  _company_id uuid,
  _product_id uuid,
  _action text,
  _note text DEFAULT NULL,
  _reason text DEFAULT NULL,
  _session_id uuid DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_proposal public.product_purchase_proposals;
  v_note text := NULLIF(btrim(COALESCE(_note, '')), '');
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _product_id AND company_id = _company_id) THEN
    RAISE EXCEPTION 'Prodotto non appartenente all''azienda';
  END IF;

  SELECT * INTO v_proposal FROM public.product_purchase_proposals
   WHERE company_id = _company_id AND product_id = _product_id AND status = 'aperta';

  IF _action = 'flag' THEN
    IF v_proposal.id IS NULL THEN
      INSERT INTO public.product_purchase_proposals (
        company_id, product_id, opened_by, opened_note, last_flagged_by, session_id,
        origin
      ) VALUES (
        _company_id, _product_id, _actor_user_id, v_note, _actor_user_id, _session_id,
        CASE WHEN _session_id IS NULL THEN 'manuale' ELSE 'inventario' END
      ) RETURNING * INTO v_proposal;

      INSERT INTO public.product_purchase_proposal_events (proposal_id, company_id, product_id, event_type, note, reference_id, created_by)
      VALUES (v_proposal.id, _company_id, _product_id, 'segnalata', v_note, _session_id, _actor_user_id);
    ELSE
      UPDATE public.product_purchase_proposals
         SET last_flagged_at = now(), last_flagged_by = _actor_user_id, flag_count = flag_count + 1
       WHERE id = v_proposal.id;

      INSERT INTO public.product_purchase_proposal_events (proposal_id, company_id, product_id, event_type, note, reference_id, created_by)
      VALUES (v_proposal.id, _company_id, _product_id, 'ri_segnalata', v_note, _session_id, _actor_user_id);
    END IF;
  ELSIF _action = 'resolve' THEN
    IF v_proposal.id IS NULL THEN
      RETURN NULL;
    END IF;
    UPDATE public.product_purchase_proposals
       SET status = 'risolta', resolved_at = now(), resolved_by = _actor_user_id,
           resolution_reason = COALESCE(NULLIF(btrim(COALESCE(_reason, '')), ''), 'non_serve_piu'),
           resolution_note = v_note
     WHERE id = v_proposal.id;

    INSERT INTO public.product_purchase_proposal_events (proposal_id, company_id, product_id, event_type, note, created_by)
    VALUES (v_proposal.id, _company_id, _product_id, 'risolta_manuale', v_note, _actor_user_id);
  ELSE
    RAISE EXCEPTION 'Azione non valida';
  END IF;

  RETURN v_proposal.id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.manage_purchase_proposal(uuid,uuid,text,text,text,uuid,uuid) FROM PUBLIC, anon;

-- 7. Risoluzione automatica alla conferma della lista della spesa
CREATE OR REPLACE FUNCTION public.resolve_proposals_on_list_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row record;
BEGIN
  IF NEW.status = 'confermata' AND COALESCE(OLD.status, '') <> 'confermata' THEN
    FOR v_row IN
      SELECT pr.id AS proposal_id, pr.product_id
        FROM public.product_purchase_proposals pr
       WHERE pr.company_id = NEW.company_id
         AND pr.status = 'aperta'
         AND pr.product_id IN (SELECT i.product_id FROM public.shopping_list_items i WHERE i.list_id = NEW.id)
    LOOP
      UPDATE public.product_purchase_proposals
         SET status = 'risolta', resolved_at = now(), resolved_by = NEW.confirmed_by,
             resolution_reason = 'lista_confermata'
       WHERE id = v_row.proposal_id;

      INSERT INTO public.product_purchase_proposal_events (proposal_id, company_id, product_id, event_type, note, reference_id, created_by)
      VALUES (v_row.proposal_id, NEW.company_id, v_row.product_id, 'risolta_lista', NULL, NEW.id, NEW.confirmed_by);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER shopping_lists_resolve_proposals
  AFTER UPDATE ON public.shopping_lists
  FOR EACH ROW EXECUTE FUNCTION public.resolve_proposals_on_list_confirm();

-- 8. Righe della sessione con i nuovi stati
DROP FUNCTION IF EXISTS public.inventory_session_rows(uuid,uuid,text,text,text,boolean,integer);

CREATE FUNCTION public.inventory_session_rows(
  _session_id uuid,
  _location_id uuid DEFAULT NULL::uuid,
  _category text DEFAULT NULL::text,
  _subcategory text DEFAULT NULL::text,
  _search text DEFAULT NULL::text,
  _favorites_only boolean DEFAULT false,
  _limit integer DEFAULT 300
) RETURNS TABLE(
  product_id uuid, location_id uuid, location_name text, code text, description text,
  danea_um text, category text, subcategory text, is_favorite boolean,
  image_path text, thumbnail_path text, calculated numeric, counted numeric, difference numeric,
  counted_at timestamp with time zone, counted_by uuid, note text,
  recount_requested_at timestamp with time zone, non_compliant boolean,
  non_compliant_quantity numeric, non_compliant_note text,
  proposal_status text, proposal_flagged_at timestamp with time zone,
  min_stock numeric, order_multiple numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session public.inventory_sessions;
  v_term text := NULLIF(btrim(COALESCE(_search, '')), '');
BEGIN
  SELECT * INTO v_session FROM public.inventory_sessions WHERE id = _session_id;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Sessione di inventario inesistente';
  END IF;
  IF NOT public.is_company_member(v_session.company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;

  RETURN QUERY
  SELECT
    sp.product_id,
    sp.location_id,
    l.name,
    p.code,
    p.description,
    p.danea_um,
    p.category,
    p.subcategory,
    f.product_id IS NOT NULL,
    img.image_path,
    img.thumbnail_path,
    COALESCE(st.quantity, 0),
    c.counted_quantity,
    c.difference,
    c.counted_at,
    c.counted_by,
    c.notes,
    c.recount_requested_at,
    COALESCE(c.non_compliant, false),
    c.non_compliant_quantity,
    c.non_compliant_note,
    pr.status,
    pr.last_flagged_at,
    ss.min_stock,
    ss.order_multiple
  FROM public.inventory_session_products sp
  JOIN public.inventory_locations l ON l.id = sp.location_id
  JOIN public.products p ON p.id = sp.product_id
  LEFT JOIN public.company_product_favorites f
    ON f.company_id = sp.company_id AND f.product_id = sp.product_id
  LEFT JOIN public.product_images img ON img.product_id = sp.product_id
  LEFT JOIN public.inventory_counts c
    ON c.session_id = sp.session_id AND c.product_id = sp.product_id AND c.location_id = sp.location_id
  LEFT JOIN public.product_purchase_proposals pr
    ON pr.company_id = sp.company_id AND pr.product_id = sp.product_id AND pr.status = 'aperta'
  LEFT JOIN public.product_stock_settings ss
    ON ss.company_id = sp.company_id AND ss.product_id = sp.product_id
  LEFT JOIN LATERAL public.inventory_location_stock(sp.product_id, sp.location_id) st ON true
  WHERE sp.session_id = _session_id
    AND (_location_id IS NULL OR sp.location_id = _location_id)
    AND (_category IS NULL OR COALESCE(NULLIF(btrim(p.category), ''), 'Senza categoria') = _category)
    AND (_subcategory IS NULL OR COALESCE(NULLIF(btrim(p.subcategory), ''), 'Senza sottocategoria') = _subcategory)
    AND (NOT _favorites_only OR f.product_id IS NOT NULL)
    AND (v_term IS NULL OR p.code ILIKE '%' || v_term || '%' OR p.description ILIKE '%' || v_term || '%')
  ORDER BY p.description NULLS LAST, p.code
  LIMIT GREATEST(COALESCE(_limit, 300), 1);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.inventory_session_rows(uuid,uuid,text,text,text,boolean,integer) FROM PUBLIC, anon;

-- 9. Proposte aperte dell'azienda (lettura per Inventario e Lista della Spesa)
CREATE OR REPLACE FUNCTION public.open_purchase_proposals(_company_id uuid)
RETURNS TABLE(
  id uuid, product_id uuid, code text, description text, danea_um text,
  opened_at timestamp with time zone, opened_by uuid, opened_note text,
  last_flagged_at timestamp with time zone, last_flagged_by uuid, flag_count integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  RETURN QUERY
  SELECT pr.id, pr.product_id, p.code, p.description, p.danea_um,
         pr.opened_at, pr.opened_by, pr.opened_note,
         pr.last_flagged_at, pr.last_flagged_by, pr.flag_count
    FROM public.product_purchase_proposals pr
    JOIN public.products p ON p.id = pr.product_id
   WHERE pr.company_id = _company_id AND pr.status = 'aperta'
   ORDER BY pr.last_flagged_at DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.open_purchase_proposals(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.purchase_proposal_history(_company_id uuid, _product_id uuid, _limit integer DEFAULT 50)
RETURNS TABLE(
  id uuid, proposal_id uuid, event_type text, note text, reference_id uuid,
  created_by uuid, created_at timestamp with time zone, proposal_status text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Accesso non consentito';
  END IF;
  RETURN QUERY
  SELECT e.id, e.proposal_id, e.event_type, e.note, e.reference_id, e.created_by, e.created_at, pr.status
    FROM public.product_purchase_proposal_events e
    JOIN public.product_purchase_proposals pr ON pr.id = e.proposal_id
   WHERE e.company_id = _company_id AND e.product_id = _product_id
   ORDER BY e.created_at DESC, e.id DESC
   LIMIT GREATEST(COALESCE(_limit, 50), 1);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.purchase_proposal_history(uuid,uuid,integer) FROM PUBLIC, anon;
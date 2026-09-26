CREATE OR REPLACE FUNCTION public.resolve_proposals_on_list_confirm()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row record;
BEGIN
  IF NEW.status = 'confermata' AND COALESCE(OLD.status::text, '') <> 'confermata' THEN
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
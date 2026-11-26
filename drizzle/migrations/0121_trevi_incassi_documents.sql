CREATE TABLE public.supplier_delivery_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  external_id text NOT NULL,
  seller_company_id uuid NOT NULL REFERENCES public.companies(id),
  doc_type text NOT NULL CHECK (doc_type IN ('ddt','preventivo')),
  doc_number text,
  doc_date date,
  customer_code text,
  order_ref text,
  notes_raw text,
  purchase_order_id uuid REFERENCES public.purchase_orders(id),
  buyer_company_id uuid REFERENCES public.companies(id),
  link_status text NOT NULL DEFAULT 'da_controllare' CHECK (link_status IN ('collegato','da_controllare')),
  link_reason text,
  prepared_at timestamptz,
  in_carico_at timestamptz,
  consegna_stato text CHECK (consegna_stato IN ('consegnato','non_consegnato')),
  consegna_at timestamptz,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  has_lines_to_review boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);
CREATE INDEX supplier_delivery_documents_order_idx ON public.supplier_delivery_documents(purchase_order_id);
GRANT SELECT ON public.supplier_delivery_documents TO authenticated;
GRANT ALL ON public.supplier_delivery_documents TO service_role;
ALTER TABLE public.supplier_delivery_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY sdd_read_seller ON public.supplier_delivery_documents FOR SELECT TO authenticated
  USING (public.is_company_member(seller_company_id));

CREATE OR REPLACE FUNCTION public.incassi_find_orders(_seller uuid, _customer_code text, _order_ref text)
RETURNS TABLE(order_id uuid, buyer_company_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT po.id, po.company_id
  FROM public.purchase_orders po
  JOIN public.supplier_customer_relations r ON r.id = po.relation_id
  JOIN public.customer_records cr ON cr.id = r.customer_record_id
  WHERE r.seller_company_id = _seller
    AND po.number = _order_ref
    AND lower(btrim(cr.internal_reference)) = lower(btrim(_customer_code))
    AND btrim(coalesce(_customer_code,'')) <> ''
$$;
REVOKE ALL ON FUNCTION public.incassi_find_orders(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.incassi_find_orders(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.order_delivery_progress(_order_ids uuid[])
RETURNS TABLE(order_id uuid, prepared_at timestamptz, in_carico_at timestamptz, consegna_stato text, consegna_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (d.purchase_order_id) d.purchase_order_id, d.prepared_at, d.in_carico_at, d.consegna_stato, d.consegna_at
  FROM public.supplier_delivery_documents d
  JOIN public.purchase_orders po ON po.id = d.purchase_order_id
  WHERE d.link_status = 'collegato'
    AND d.purchase_order_id = ANY(_order_ids)
    AND (public.is_company_member(po.company_id) OR public.is_company_member(d.seller_company_id))
  ORDER BY d.purchase_order_id, d.updated_at DESC
$$;
REVOKE ALL ON FUNCTION public.order_delivery_progress(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_delivery_progress(uuid[]) TO authenticated, service_role;
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { docTotal, type CustomerDoc, type CustomerDocLine } from "@/lib/incassi/customer-documents";

/** Sola lettura: DDT di Trevi Incassi collegati all'azienda acquirente, dopo verifica di appartenenza. */
export const getMyDeliveryDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ companyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<CustomerDoc[]> => {
    const { data: member, error: memberError } = await context.supabase.rpc("is_company_member", { _company_id: data.companyId });
    if (memberError || !member) throw new Error("Documenti riservati all'azienda");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: docs, error } = await supabaseAdmin.from("supplier_delivery_documents")
      .select("id, doc_type, doc_number, doc_date, lines, seller_company_id")
      .eq("buyer_company_id", data.companyId).order("doc_date", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    const sellerIds = [...new Set((docs ?? []).map((d) => d.seller_company_id))];
    const { data: sellers } = sellerIds.length
      ? await supabaseAdmin.from("companies").select("id, legal_name").in("id", sellerIds)
      : { data: [] as { id: string; legal_name: string }[] };
    const names = new Map((sellers ?? []).map((s) => [s.id, s.legal_name]));
    return (docs ?? []).map((d) => {
      const raw = Array.isArray(d.lines) ? (d.lines as Record<string, unknown>[]) : [];
      const num = (v: unknown) => (typeof v === "number" ? v : null);
      const str = (v: unknown) => (typeof v === "string" ? v : null);
      const lines: CustomerDocLine[] = raw.map((l) => ({ code: str(l["code"]), description: str(l["description"]), qty: num(l["qty"]), um: str(l["um"]), price: num(l["price"]), total: num(l["total"]) }));
      return { id: d.id, sellerName: names.get(d.seller_company_id) ?? "Fornitore", docType: d.doc_type, docNumber: d.doc_number ?? "", docDate: d.doc_date, total: docTotal(lines), lines };
    });
  });

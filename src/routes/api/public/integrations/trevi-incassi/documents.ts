import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const iso = z.string().datetime({ offset: true }).nullable().optional();
const Body = z.object({
  external_id: z.string().trim().min(1).max(120),
  doc_type: z.enum(["ddt", "preventivo"]),
  doc_number: z.string().max(60).nullable().optional(),
  doc_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  customer_code: z.string().max(60).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  prepared_at: iso,
  in_carico_at: iso,
  consegna: z.object({ stato: z.enum(["consegnato", "non_consegnato"]).nullable().optional(), at: iso }).nullable().optional(),
  lines: z.array(z.object({
    code: z.string().max(80).nullable().optional(),
    description: z.string().max(500).nullable().optional(),
    qty: z.number().finite().nullable().optional(),
    um: z.string().max(20).nullable().optional(),
    price: z.number().finite().nullable().optional(),
    total: z.number().finite().nullable().optional(),
  })).max(500).optional(),
}).strict();

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

export const Route = createFileRoute("/api/public/integrations/trevi-incassi/documents")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["TREVI_INCASSI_KEY"];
        const seller = process.env["TREVI_INCASSI_SELLER_COMPANY_ID"];
        if (process.env["TREVI_INCASSI_ENABLED"] !== "true" || !key || !seller) return json({ error: "collegamento_non_attivo" }, 503);
        if (!(await safeEqual(request.headers.get("x-incassi-key") ?? "", key))) return json({ error: "chiave_non_valida" }, 401);

        let raw: unknown;
        try { raw = await request.json(); } catch { return json({ error: "dati_non_validi", details: ["JSON non leggibile"] }, 400); }
        const parsed = Body.safeParse(raw);
        if (!parsed.success) return json({ error: "dati_non_validi", details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);
        const b = parsed.data;

        const { extractOrderRef, mergeDocument, normalizeLines, resolveOrderLink } = await import("@/lib/incassi/incassi-link");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const source = "trevi_incassi";

        const { data: existing, error: readErr } = await supabaseAdmin.from("supplier_delivery_documents")
          .select("doc_type, doc_number, doc_date, customer_code, notes_raw, prepared_at, in_carico_at, consegna_stato, consegna_at, lines")
          .eq("source", source).eq("external_id", b.external_id).maybeSingle();
        if (readErr) return json({ error: "errore_interno" }, 500);

        const { data: units } = await supabaseAdmin.from("units_of_measure").select("code").eq("company_id", seller);
        const known = (units ?? []).map((u) => String((u as { code: string }).code));
        const merged = mergeDocument(existing as never, {
          doc_type: b.doc_type, doc_number: b.doc_number ?? null, doc_date: b.doc_date ?? null, customer_code: b.customer_code ?? null,
          notes_raw: b.notes ?? null, prepared_at: b.prepared_at ?? null, in_carico_at: b.in_carico_at ?? null,
          consegna_stato: b.consegna?.stato ?? null, consegna_at: b.consegna?.at ?? null,
          lines: b.lines ? normalizeLines(b.lines, known) : [],
        });

        const orderRef = extractOrderRef(merged.notes_raw);
        let candidates: { order_id: string; buyer_company_id: string }[] = [];
        if (merged.customer_code?.trim() && orderRef) {
          const { data, error } = await supabaseAdmin.rpc("incassi_find_orders", { _seller: seller, _customer_code: merged.customer_code, _order_ref: orderRef });
          if (error) return json({ error: "errore_interno" }, 500);
          candidates = data ?? [];
        }
        const link = resolveOrderLink(merged.customer_code, orderRef, candidates);

        const { error: upErr } = await supabaseAdmin.from("supplier_delivery_documents").upsert({
          source, external_id: b.external_id, seller_company_id: seller, ...merged, lines: merged.lines as never,
          order_ref: orderRef, purchase_order_id: link.orderId, buyer_company_id: link.buyerCompanyId,
          link_status: link.status, link_reason: link.reason, has_lines_to_review: merged.lines.some((l) => l.needs_review),
          updated_at: new Date().toISOString(),
        }, { onConflict: "source,external_id" });
        if (upErr) return json({ error: "errore_interno" }, 500);

        if (link.status === "collegato") return json({ status: "collegato", order_number: orderRef }, 200);
        return json({ status: "da_controllare", reason: link.reason }, 202);
      },
    },
  },
});

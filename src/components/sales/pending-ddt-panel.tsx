import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { canCreatePhoneOrder, ddtAmount, existingOrderWarning, lineReady, manualMatchesPayload, mapPendingDocs, unmatchedCount } from "./phone-order-ddt-logic";

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const date = (d: string | null) => d ? new Date(d).toLocaleDateString("it-IT") : "—";

/** Supplier-only box: the DB returns DDT only to active members of the seller company. */
export function PendingDdtPanel({ companyId }: { companyId: string }) {
  const cache = useQueryClient();
  const [manual, setManual] = useState<Record<string, Record<string, string>>>({});
  const query = useQuery({
    queryKey: ["incassi-pending-documents", companyId],
    queryFn: async () => { const { data, error } = await supabase.rpc("incassi_pending_documents"); if (error) throw new Error(error.message); return data; },
  });
  const create = useMutation({
    mutationFn: async (docId: string) => {
      const { data, error } = await supabase.rpc("create_phone_order_from_document", { _document_id: docId, _line_matches: manualMatchesPayload(manual[docId]) });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: async () => {
      toast.success("Ordine telefonico creato: il cliente lo vede in «Ordini fornitore»");
      await Promise.all([cache.invalidateQueries({ queryKey: ["incassi-pending-documents"] }), cache.invalidateQueries({ queryKey: ["received-orders"] })]);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const rows = mapPendingDocs(query.data, manual);
  if (!rows.length) return null;
  return <Card className="mb-4 border-primary/50">
    <CardHeader className="pb-2"><CardTitle className="flex flex-wrap items-center gap-2 text-base"><FileText className="size-4" />DDT da abbinare ({rows.length})</CardTitle>
      <p className="text-xs text-muted-foreground">Documenti arrivati da Incassi senza numero d'ordine. Visibili solo a te, non al cliente.</p></CardHeader>
    <CardContent className="space-y-4">
      {rows.map(({ doc: d, candidates }) => { const warn = existingOrderWarning(d); const missing = unmatchedCount(d); return <section key={d.id} className="min-w-0 space-y-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><div className="min-w-0"><p className="break-words font-semibold">{d.customerName ?? "Cliente non riconosciuto"} <span className="text-xs font-normal text-muted-foreground">cod. {d.customerCode ?? "—"}</span></p><p className="text-xs text-muted-foreground">DDT {d.docNumber} del {date(d.docDate)} · {d.lines.length} righe · {eur(ddtAmount(d))}</p></div>
          {missing ? <Badge variant="destructive">{missing} da abbinare</Badge> : <Badge variant="secondary">Righe abbinate</Badge>}</div>
        {warn ? <p className="flex items-start gap-1 text-xs font-medium"><TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />{warn}</p> : null}
        <ul className="space-y-2 text-sm">{d.lines.map(l => <li key={l.key} className="min-w-0 space-y-1">
          <p className="break-words">{l.code} · {l.description} — {l.qty ?? "?"} {l.um ?? "U.M. da controllare"} × {eur(l.price ?? 0)}{lineReady(l) ? <span className="ml-2 text-xs text-muted-foreground">Abbinata</span> : null}</p>
          {!lineReady(l) && d.customerName && l.um ? <Select value={manual[d.id]?.[l.key] ?? ""} onValueChange={v => setManual(prev => ({ ...prev, [d.id]: { ...(prev[d.id] ?? {}), [l.key]: v } }))}><SelectTrigger className="h-9 w-full"><SelectValue placeholder="Scegli l'articolo del cliente" /></SelectTrigger><SelectContent>{candidates.map(c => <SelectItem key={c.linkId} value={c.linkId}>{c.code} · {c.description}</SelectItem>)}</SelectContent></Select> : null}
        </li>)}</ul>
        <Button size="sm" disabled={!canCreatePhoneOrder(d) || create.isPending} onClick={() => create.mutate(d.id)}>{create.isPending && create.variables === d.id ? "Creazione…" : "Crea ordine telefonico"}</Button>
      </section>; })}
    </CardContent>
  </Card>;
}

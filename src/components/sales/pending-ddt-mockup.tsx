import { useState } from "react";
import { FileText, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { canCreatePhoneOrder, ddtAmount, existingOrderWarning, lineReady, unmatchedCount, type PendingDdt } from "./phone-order-ddt-logic";

/** MOCKUP: isolated React state with sample data, no reads or writes. */
const SAMPLE_PRODUCTS = [{ id: "p-banane", label: "BAN01 · Banane" }, { id: "p-limoni", label: "LIM02 · Limoni" }, { id: "p-insalata", label: "INS05 · Insalata gentile" }];
const SAMPLE: PendingDdt[] = [
  { id: "m1", customerName: "ALDER (esempio)", customerCode: "0758", docNumber: "1245", docDate: "2026-11-28", existingOrderNumber: "ORD-2026-00031", lines: [
    { key: "a", code: "BAN01", description: "Banane", qty: 12.4, um: "kg", price: 1.35, matchedProductId: "p-banane" },
    { key: "b", code: "LIM02", description: "Limoni", qty: 5, um: "kg", price: 1.9, matchedProductId: "p-limoni" },
    { key: "c", code: "X-998", description: "Insalata gentile cassetta", qty: 2, um: "pz", price: 6.5, matchedProductId: null },
  ] },
  { id: "m2", customerName: "Bar Esempio", customerCode: "0812", docNumber: "1246", docDate: "2026-11-28", existingOrderNumber: null, lines: [
    { key: "a", code: "BAN01", description: "Banane", qty: 3, um: "kg", price: 1.35, matchedProductId: "p-banane" },
  ] },
];
const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const date = (d: string | null) => d ? new Date(d).toLocaleDateString("it-IT") : "—";

export function PendingDdtMockup() {
  const [docs, setDocs] = useState(SAMPLE);
  if (!docs.length) return null;
  const match = (docId: string, key: string, productId: string) => setDocs(prev => prev.map(d => d.id !== docId ? d : { ...d, lines: d.lines.map(l => l.key === key ? { ...l, matchedProductId: productId } : l) }));
  return <Card className="mb-4 border-primary/50">
    <CardHeader className="pb-2"><CardTitle className="flex flex-wrap items-center gap-2 text-base"><FileText className="size-4" />DDT da abbinare ({docs.length})<Badge variant="outline">Anteprima con dati di esempio</Badge></CardTitle>
      <p className="text-xs text-muted-foreground">Documenti arrivati da Incassi senza numero d'ordine. Visibili solo a te, non al cliente.</p></CardHeader>
    <CardContent className="space-y-4">
      {docs.map(d => { const warn = existingOrderWarning(d); const missing = unmatchedCount(d); return <section key={d.id} className="min-w-0 space-y-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><div className="min-w-0"><p className="break-words font-semibold">{d.customerName} <span className="text-xs font-normal text-muted-foreground">cod. {d.customerCode}</span></p><p className="text-xs text-muted-foreground">DDT {d.docNumber} del {date(d.docDate)} · {d.lines.length} righe · {eur(ddtAmount(d))}</p></div>
          {missing ? <Badge variant="destructive">{missing} da abbinare</Badge> : <Badge variant="secondary">Righe abbinate</Badge>}</div>
        {warn ? <p className="flex items-start gap-1 text-xs font-medium"><TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />{warn}</p> : null}
        <ul className="space-y-1 text-sm">{d.lines.map(l => <li key={l.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <span className="min-w-0 break-words">{l.code} · {l.description} — {l.qty} {l.um} × {eur(l.price ?? 0)}</span>
          {lineReady(l) ? <span className="text-xs text-muted-foreground">Abbinata</span> : <Select onValueChange={v => match(d.id, l.key, v)}><SelectTrigger className="h-8 w-44"><SelectValue placeholder="Scegli articolo" /></SelectTrigger><SelectContent>{SAMPLE_PRODUCTS.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent></Select>}
        </li>)}</ul>
        <Button size="sm" disabled={!canCreatePhoneOrder(d)} onClick={() => { setDocs(prev => prev.filter(x => x.id !== d.id)); toast.success("Anteprima: in futuro qui nascerà l'«Ordine telefonico». Nessun dato salvato."); }}>Crea ordine telefonico</Button>
      </section>; })}
    </CardContent>
  </Card>;
}

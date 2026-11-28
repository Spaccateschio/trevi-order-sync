import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { activeCompany, useIdentity } from "@/hooks/use-identity";
import { getMyDeliveryDocuments, getMyIncassiBalance } from "@/lib/customer-documents.functions";

const euro = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const day = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("it-IT") : "—");

export function CustomerDocumentsPage() {
  const identity = useIdentity();
  const company = activeCompany(identity.data);
  const fetchDocs = useServerFn(getMyDeliveryDocuments);
  const docs = useQuery({
    queryKey: ["customer-delivery-documents", company?.companyId],
    queryFn: () => fetchDocs({ data: { companyId: company!.companyId } }),
    enabled: Boolean(company?.companyId),
  });
  const fetchBalance = useServerFn(getMyIncassiBalance);
  const balance = useQuery({
    queryKey: ["customer-incassi-balance", company?.companyId],
    queryFn: () => fetchBalance({ data: { companyId: company!.companyId } }),
    enabled: Boolean(company?.companyId),
  });
  const bal = balance.data?.available ? balance.data : null;
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = docs.data ?? [];
  const total = rows.reduce((s, d) => s + Math.round(d.total * 100), 0) / 100;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Totale documenti</p>
          <p className="text-lg font-semibold">{euro(total)}</p>
          <p className="text-xs text-muted-foreground">{rows.length} DDT</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Saldo da pagare</p>
          <p className="text-lg font-semibold">{bal ? euro(bal.saldo) : balance.isLoading ? "…" : "Da confermare"}</p>
          <p className="text-xs text-muted-foreground">{bal ? (bal.scaduto > 0 ? `di cui scaduto ${euro(bal.scaduto)}` : "Nessun importo scaduto") : "Saldo non ancora disponibile da Trevi Incassi"}</p>
        </CardContent></Card>
      </div>
      {docs.isLoading ? <p className="text-sm text-muted-foreground">Caricamento documenti…</p> : null}
      {docs.isError ? <p className="text-sm text-destructive">Non riesco a leggere i documenti. Riprova tra poco.</p> : null}
      {docs.isSuccess && rows.length === 0 ? <p className="text-sm text-muted-foreground">Nessun documento ricevuto finora.</p> : null}
      <div className="space-y-2">
        {rows.map((d) => {
          const open = openId === d.id;
          return (
            <Card key={d.id}>
              <button type="button" className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3 text-left" onClick={() => setOpenId(open ? null : d.id)}>
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{d.docType.toUpperCase()} {d.docNumber} · {day(d.docDate)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{d.sellerName}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 font-semibold">{euro(d.total)}{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
              </button>
              {open ? (
                <CardContent className="space-y-1 border-t p-3 text-sm">
                  {d.lines.map((l, i) => (
                    <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <span className="min-w-0 truncate">{l.description ?? l.code ?? "Riga"} <span className="text-muted-foreground">· {l.qty ?? "—"} {l.um ?? ""}{l.price != null ? ` × ${euro(l.price)}` : ""}</span></span>
                      <span className="shrink-0">{l.total != null ? euro(l.total) : "—"}</span>
                    </div>
                  ))}
                  <Badge variant="secondary" className="mt-2">Prezzi dal DDT</Badge>
                </CardContent>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

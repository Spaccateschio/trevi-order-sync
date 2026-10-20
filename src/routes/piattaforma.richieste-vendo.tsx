import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { decideCompanySellRequest, getPlatformSellRequests } from "@/lib/sell-request.functions";

export const Route = createFileRoute("/piattaforma/richieste-vendo")({
  head: () => ({ meta: [
    { title: "Richieste Vendo — Trevi Fruit piattaforma" },
    { name: "description", content: "Richieste di attivazione Vendo e storico delle decisioni del super amministratore Trevi Fruit." },
    { property: "og:title", content: "Richieste Vendo — Trevi Fruit piattaforma" },
    { property: "og:description", content: "Richieste di attivazione Vendo e storico delle decisioni del super amministratore Trevi Fruit." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: SellRequests,
});

const labels: Record<string, string> = { in_attesa: "In attesa", approvata: "Approvata", rifiutata: "Rifiutata", annullata: "Annullata" };
function SellRequests() {
  const getRequests = useServerFn(getPlatformSellRequests);
  const decide = useServerFn(decideCompanySellRequest);
  const client = useQueryClient();
  const [decision, setDecision] = useState<{ id: string; company: string; approve: boolean } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: requests, isPending, error, refetch } = useQuery({ queryKey: ["platform-sell-requests"], queryFn: () => getRequests(), retry: false });
  async function submit() {
    if (!decision) return;
    setBusy(true);
    try {
      await decide({ data: { requestId: decision.id, approve: decision.approve, ...(reason.trim() ? { reason: reason.trim() } : {}) } });
      setDecision(null); setReason("");
      await client.invalidateQueries({ queryKey: ["platform-sell-requests"] });
      toast.success(decision.approve ? "Richiesta approvata." : "Richiesta rifiutata.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Operazione non riuscita"); }
    finally { setBusy(false); }
  }
  if (isPending) return <p className="text-muted-foreground">Caricamento richieste…</p>;
  if (error) return <div className="space-y-3"><p className="text-destructive">{error.message}</p><Button variant="outline" onClick={() => refetch()}>Riprova</Button></div>;
  function list(pending: boolean) {
    const rows = (requests ?? []).filter(r => (r.status === "in_attesa") === pending);
    return rows.length ? <ul className="divide-y divide-border">{rows.map(r => <li key={r.id} className="space-y-3 py-5">
      <div className="flex flex-wrap items-center gap-3"><h2 className="break-words font-semibold">{r.company_name}</h2><Badge variant={r.status === "rifiutata" ? "destructive" : "secondary"}>{labels[r.status] || r.status}</Badge></div>
      <p className="break-words text-sm text-muted-foreground">{r.requested_by_email} · {new Date(r.created_at).toLocaleString("it-IT")}{r.origin === "registrazione" ? " · Registrazione" : ""}</p>
      {r.decision_reason && <p className="break-words text-sm">Motivo: {r.decision_reason}</p>}
      {r.decided_at && <p className="text-sm text-muted-foreground">Decisione: {new Date(r.decided_at).toLocaleString("it-IT")}</p>}
      {pending && <div className="flex flex-wrap gap-2"><Button onClick={() => { setReason(""); setDecision({ id: r.id, company: r.company_name, approve: true }); }}>Approva</Button><Button variant="outline" onClick={() => { setReason(""); setDecision({ id: r.id, company: r.company_name, approve: false }); }}>Rifiuta</Button></div>}
    </li>)}</ul> : <p className="py-8 text-sm text-muted-foreground">{pending ? "Nessuna richiesta in attesa." : "Nessuna richiesta nello storico."}</p>;
  }
  return <div className="space-y-5"><h1 className="font-display text-xl font-semibold">Richieste Vendo</h1>
    <Tabs defaultValue="pending"><TabsList><TabsTrigger value="pending">In attesa ({requests?.filter(r => r.status === "in_attesa").length ?? 0})</TabsTrigger><TabsTrigger value="history">Storico</TabsTrigger></TabsList><TabsContent value="pending">{list(true)}</TabsContent><TabsContent value="history">{list(false)}</TabsContent></Tabs>
    <Dialog open={Boolean(decision)} onOpenChange={open => { if (!open && !busy) setDecision(null); }}><DialogContent><DialogHeader><DialogTitle>{decision?.approve ? "Approva richiesta Vendo" : "Rifiuta richiesta Vendo"}</DialogTitle></DialogHeader><p className="break-words text-sm">{decision?.company}</p>{decision?.approve ? <p className="text-sm">Confermando, il profilo Vendo sarà attivato.</p> : <div className="space-y-2"><Label htmlFor="reject-reason">Motivo (facoltativo)</Label><Textarea id="reject-reason" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></div>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDecision(null)}>Annulla</Button><Button disabled={busy} onClick={submit}>{decision?.approve ? "Conferma approvazione" : "Conferma rifiuto"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
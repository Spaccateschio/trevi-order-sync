import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { identityQueryKey, type Membership } from "@/hooks/use-identity";
import { cancelCompanySellRequest, getCompanySellRequests, requestCompanySell, setCompanyProfile } from "@/lib/sell-request.functions";
import { canDisableCompanyProfile } from "@/lib/sell-request-policy";

export function CompanyProfile({ company }: { company: Membership }) {
  const queryClient = useQueryClient();
  const getRequests = useServerFn(getCompanySellRequests);
  const request = useServerFn(requestCompanySell);
  const cancel = useServerFn(cancelCompanySellRequest);
  const setProfile = useServerFn(setCompanyProfile);
  const [busy, setBusy] = useState(false);
  const { data: requests, isPending, isError, refetch } = useQuery({ queryKey: ["company-sell-requests", company.memberId], queryFn: () => getRequests({ data: { memberId: company.memberId } }) });
  const latest = requests?.[0];
  const { buys, sells } = company.capabilities;
  async function act(operation: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await operation();
      await Promise.all([queryClient.invalidateQueries({ queryKey: identityQueryKey }), queryClient.invalidateQueries({ queryKey: ["company-sell-requests"] })]);
      toast.success(message);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Operazione non riuscita"); }
    finally { setBusy(false); }
  }
  return <section className="space-y-5 border-b border-border pb-6">
    <h2 className="font-display text-base font-semibold">Profilo — {company.companyName}</h2>
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="space-y-3">
        <div className="flex items-center gap-3"><h3 className="font-semibold">Compro</h3><Badge variant={buys ? "default" : "secondary"}>{buys ? "Attivo" : "Disattivato"}</Badge></div>
        <Button variant="outline" disabled={busy || (buys && !canDisableCompanyProfile(buys, sells, "buys"))} onClick={() => act(() => setProfile({ data: { memberId: company.memberId, buys: !buys, sells } }), buys ? "Compro disattivato." : "Compro attivato.")}>{buys ? "Disattiva Compro" : "Attiva Compro"}</Button>
        {buys && !sells && <p className="text-sm text-muted-foreground">Deve restare almeno un profilo attivo.</p>}
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-3"><h3 className="font-semibold">Vendo</h3><Badge variant={sells ? "default" : "secondary"}>{sells ? "Attivo" : latest?.status === "in_attesa" ? "In attesa" : "Disattivato"}</Badge></div>
        {isPending ? <p className="text-sm text-muted-foreground">Caricamento richiesta…</p> : isError ? <><p className="text-sm text-destructive">Impossibile leggere le richieste.</p><Button variant="outline" onClick={() => refetch()}>Riprova</Button></> : sells ? <><Button variant="outline" disabled={busy || !canDisableCompanyProfile(buys, sells, "sells")} onClick={() => act(() => setProfile({ data: { memberId: company.memberId, buys, sells: false } }), "Vendo disattivato.")}>Disattiva Vendo</Button>{!buys && <p className="text-sm text-muted-foreground">Deve restare almeno un profilo attivo.</p>}</> : latest?.status === "in_attesa" ? <Button variant="outline" disabled={busy} onClick={() => act(() => cancel({ data: { requestId: latest.id } }), "Richiesta annullata.")}>Annulla richiesta</Button> : <>
          {latest?.status === "rifiutata" && <p className="break-words text-sm text-destructive">Rifiutata: {latest.decision_reason || "Motivo non indicato"}</p>}
          <Button disabled={busy} onClick={() => act(() => request({ data: { memberId: company.memberId } }), "Richiesta in attesa di approvazione.")}>Richiedi attivazione</Button>
        </>}
      </div>
    </div>
  </section>;
}
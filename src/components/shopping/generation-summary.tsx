import { CheckCircle2, Loader2, RotateCcw, Send, ShoppingBag, XCircle } from "lucide-react";
import { OrderShareDialog } from "@/components/purchase/order-share-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { summarize, type GenerationOutcome } from "@/components/shopping/generation-results";

type Share = Extract<GenerationOutcome, { kind: "da_condividere" }>;
type SendErr = Extract<GenerationOutcome, { kind: "errore_invio" }>;

/** Riepilogo dopo «Genera ordini selezionati»: inviato, da condividere, errore, acquisto diretto. */
export function GenerationSummary({
  outcomes,
  pendingOrder,
  onRetry,
  onShare,
  onOpenDirect,
}: {
  outcomes: GenerationOutcome[];
  pendingOrder: string | null;
  onRetry: (o: SendErr) => void;
  onShare: (o: Share) => void;
  onOpenDirect: (id: string) => void;
}) {
  const sum = summarize(outcomes);
  return (
    <section className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
      <h3 className="text-sm font-semibold">Riepilogo</h3>
      <p className="text-xs text-muted-foreground">
        Inviati {sum.inviati} · Da condividere {sum.daCondividere} · Errori {sum.errori} · Acquisti diretti {sum.diretti}
      </p>
      <ul className="space-y-1">
        {outcomes.map((o, i) => (
          <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-background px-2 py-1.5 text-sm">
            <span className="min-w-0">
              <span className="font-medium">{o.name}</span>
              {"number" in o && o.number ? <span className="text-muted-foreground"> · {o.number}</span> : null}
              {o.kind === "errore_invio" || o.kind === "errore_generazione" ? (
                <span className="block text-xs text-destructive">{o.message}</span>
              ) : null}
            </span>
            <span className="flex items-center gap-2">
              {o.kind === "inviato" ? <Badge variant="secondary"><CheckCircle2 className="size-3" /> Inviato</Badge> : null}
              {o.kind === "da_condividere" ? (
                <>
                  <Badge variant="outline">Da condividere</Badge>
                  <Button size="sm" onClick={() => onShare(o)}><Send className="size-4" /> Condividi</Button>
                </>
              ) : null}
              {o.kind === "errore_invio" ? (
                <>
                  <Badge variant="destructive"><XCircle className="size-3" /> Errore di invio</Badge>
                  <Button size="sm" variant="outline" disabled={pendingOrder === o.orderId} onClick={() => onRetry(o)}>
                    {pendingOrder === o.orderId ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Riprova
                  </Button>
                </>
              ) : null}
              {o.kind === "errore_generazione" ? <Badge variant="destructive">Non generato</Badge> : null}
              {o.kind === "acquisto_diretto" ? (
                <>
                  <Badge variant="secondary"><ShoppingBag className="size-3" /> Acquisto diretto creato</Badge>
                  <Button size="sm" variant="outline" onClick={() => onOpenDirect(o.id)}>Apri</Button>
                </>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {outcomes.some((o) => o.kind === "errore_generazione") ? (
        <p className="text-xs text-muted-foreground">Per i documenti non generati premi di nuovo «Genera ordini selezionati»: non verranno creati doppioni.</p>
      ) : null}
    </section>
  );
}

/** Stessa finestra usata nel dettaglio ordine. */
export function ShareOrderDialog({ target, link, onLink, onClose, onConfirmed }: {
  target: Share;
  link: { url: string; expiresAt: string } | null;
  onLink: (link: { url: string; expiresAt: string }) => void;
  onClose: () => void;
  onConfirmed: (closed: boolean) => void | Promise<void>;
}) {
  return <OrderShareDialog orderId={target.orderId} initialLink={link} onLink={onLink} onClose={onClose} onConfirmed={onConfirmed} />;
}

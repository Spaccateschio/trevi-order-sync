import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Mail, MessageCircle, RotateCcw, Send, ShoppingBag, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { SendOrderDialog, type SendChannel } from "@/components/purchase/send-order-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { createOrderShareLink } from "@/lib/purchase.functions";
import { orderShareText, summarize, type GenerationOutcome } from "@/components/shopping/generation-results";

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

/** Condivisione ordine non B2B: WhatsApp o email con il testo dell'ordine; «inviato» solo dopo la conferma. */
export function ShareOrderDialog({
  target,
  pending,
  link,
  onLink,
  onClose,
  onConfirm,
}: {
  target: Share;
  pending: boolean;
  /** Link già creato per questo ordine in questa sessione: riaprire non ne crea un altro. */
  link: { url: string; expiresAt: string } | null;
  onLink: (link: { url: string; expiresAt: string }) => void;
  onClose: () => void;
  onConfirm: (channel: SendChannel) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const lines = useQuery({
    queryKey: ["share-order-lines", target.orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select("product_name, product_code, purchase_quantity, purchase_unit_code")
        .eq("order_id", target.orderId)
        .order("product_code");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const runShare = useServerFn(createOrderShareLink);
  // Link personale (token, scadenza 72 ore, revocabile) creato una sola volta per ordine.
  const share = useMutation({
    mutationFn: () => runShare({ data: { orderId: target.orderId, recipientLabel: target.name, validHours: 72 } }),
    onSuccess: (res) => onLink({ url: `${window.location.origin}/consegna/${res.token}`, expiresAt: res.expiresAt }),
  });
  const requested = useRef(false);
  useEffect(() => {
    if (!link && !requested.current) {
      requested.current = true;
      share.mutate();
    }
  }, [link, share]);
  const text = lines.data && link ? orderShareText(target.number, target.name, lines.data as never, link.url) : "";
  const subject = `Ordine ${target.number ?? ""}`;

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !pending) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Condividi {target.number ?? ""} · {target.name}</DialogTitle>
          <DialogDescription>Invia l'ordine con WhatsApp o email, poi conferma: solo allora risulta inviato.</DialogDescription>
        </DialogHeader>
        {share.isError ? (
          <div className="space-y-2 text-sm text-destructive">
            <p>Link non creato: {(share.error as Error).message}</p>
            <Button size="sm" variant="outline" onClick={() => share.mutate()}>Riprova</Button>
          </div>
        ) : null}
        {link ? <p className="text-xs text-muted-foreground">Link valido fino al {new Date(link.expiresAt).toLocaleString("it-IT")}; si può revocare dal dettaglio ordine.</p> : null}
        {lines.isLoading || share.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Caricamento…</p>
        ) : (
          <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded border border-border bg-muted p-2 text-xs">{text}</pre>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={!text} asChild>
            <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"><MessageCircle className="size-4" /> WhatsApp</a>
          </Button>
          <Button variant="outline" disabled={!text} asChild>
            <a href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`}><Mail className="size-4" /> Email</a>
          </Button>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={pending} onClick={onClose}>Più tardi</Button>
          <Button disabled={pending || !text} onClick={() => setConfirmOpen(true)}>Ho inviato l'ordine</Button>
        </DialogFooter>
        <SendOrderDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          isB2b={false}
          supplierName={target.name}
          orderNumber={target.number}
          pending={pending}
          onConfirm={(channel) => channel && onConfirm(channel)}
        />
      </DialogContent>
    </Dialog>
  );
}

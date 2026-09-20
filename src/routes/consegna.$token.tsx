import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseQuantity, qty } from "@/lib/inventory";
import {
  externalDeliveryDraft,
  externalSetDeliveryItem,
  externalSubmitDelivery,
} from "@/lib/purchase-external.functions";

const description =
  "Pagina riservata al fornitore: comunica ciò che stai consegnando per questo singolo ordine.";

export const Route = createFileRoute("/consegna/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Comunica la consegna — Trevi Fruit" },
      { name: "description", content: description },
      { property: "og:title", content: "Comunica la consegna — Trevi Fruit" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConsegnaEsterna,
});

function ConsegnaEsterna() {
  const { token } = Route.useParams();
  const loadDraft = useServerFn(externalDeliveryDraft);
  const runSet = useServerFn(externalSetDeliveryItem);
  const runSubmit = useServerFn(externalSubmitDelivery);

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [lots, setLots] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [sent, setSent] = useState(false);

  const draftQuery = useQuery({
    queryKey: ["external-delivery", token],
    retry: false,
    queryFn: () => loadDraft({ data: { token } }),
  });

  const submit = useMutation({
    mutationFn: async () => {
      const draft = draftQuery.data;
      if (!draft) throw new Error("Dati non disponibili");
      for (const item of draft.items) {
        const raw = edits[item.id];
        const lot = lots[item.id];
        if (raw === undefined && lot === undefined) continue;
        const quantity = raw === undefined ? null : parseQuantity(raw);
        if (raw !== undefined && (quantity === null || quantity < 0)) {
          throw new Error(`Quantità non valida per ${item.products?.code ?? ""}`);
        }
        await runSet({
          data: {
            token,
            deliveryItemId: item.id,
            declaredQuantity: quantity,
            declaredProducer: null,
            declaredProducerLot: lot?.trim() ? lot.trim() : null,
            declaredExpiry: null,
            lineNotes: null,
            missingReason: quantity === 0 ? "Non disponibile" : null,
          },
        });
      }
      await runSubmit({
        data: {
          token,
          deliveryId: draft.deliveryId,
          notes: null,
          actorLabel: name.trim() ? name.trim() : null,
        },
      });
    },
    onSuccess: () => {
      setSent(true);
      toast.success("Grazie: la comunicazione è stata inviata");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (draftQuery.isError) {
    return (
      <main className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <BrandMark />
        <h1 className="text-lg font-semibold">Link non valido</h1>
        <p className="text-sm text-muted-foreground">
          Questo indirizzo è scaduto oppure è stato annullato. Contatta chi ti ha inviato l'ordine.
        </p>
      </main>
    );
  }

  const draft = draftQuery.data;

  return (
    <main className="mx-auto max-w-lg space-y-4 p-4 pb-16">
      <BrandMark />
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">Comunica la consegna</h1>
        <p className="text-sm text-muted-foreground">
          Ordine {draft?.orderNumber}. Indica quanto consegni davvero: non serve nessun account.
        </p>
      </header>

      {sent ? (
        <p className="rounded-lg border border-border p-4 text-sm">
          Comunicazione ricevuta. Il controllo della merce avverrà alla consegna.
        </p>
      ) : (
        <>
          <div className="space-y-3">
            {(draft?.items ?? []).map((item) => (
              <div key={item.id} className="rounded-lg border border-border p-3">
                <p className="font-medium">{item.products?.code}</p>
                <p className="text-xs text-muted-foreground">{item.products?.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Atteso: {qty(item.declared_quantity)} {item.unit_code}
                </p>
                <label className="mt-2 block text-xs text-muted-foreground">
                  Quantità che consegni
                  <Input
                    className="mt-1"
                    inputMode="decimal"
                    value={edits[item.id] ?? String(item.declared_quantity)}
                    onChange={(event) =>
                      setEdits((prev) => ({ ...prev, [item.id]: event.target.value }))
                    }
                  />
                </label>
                <label className="mt-2 block text-xs text-muted-foreground">
                  Lotto del produttore (se lo hai)
                  <Input
                    className="mt-1"
                    value={lots[item.id] ?? item.declared_producer_lot ?? ""}
                    onChange={(event) =>
                      setLots((prev) => ({ ...prev, [item.id]: event.target.value }))
                    }
                  />
                </label>
              </div>
            ))}
          </div>

          <label className="block text-xs text-muted-foreground">
            Il tuo nome
            <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <Button
            className="w-full"
            onClick={() => submit.mutate()}
            disabled={submit.isPending || !draft}
          >
            Invia la comunicazione
          </Button>
        </>
      )}
    </main>
  );
}

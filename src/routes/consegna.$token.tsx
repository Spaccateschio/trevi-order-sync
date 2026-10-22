import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronDown, ChevronUp, MapPin, CalendarDays, FileText, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

type DraftItem = NonNullable<Awaited<ReturnType<typeof externalDeliveryDraft>>>["items"][number];

type LineEdit = {
  quantity: string;
  price: string;
  tare: string;
  gross: string;
  net: string;
  lot: string;
  altDescription: string;
  notes: string;
};

function initialEdit(item: DraftItem): LineEdit {
  const base =
    item.purchase_unit_code && item.declared_purchase_quantity !== null
      ? item.declared_purchase_quantity
      : item.declared_quantity;
  return {
    quantity: base !== null ? String(base) : "",
    price: item.declared_unit_price !== null ? String(item.declared_unit_price) : "",
    tare: item.declared_tare_weight !== null ? String(item.declared_tare_weight) : "",
    gross: item.declared_gross_weight !== null ? String(item.declared_gross_weight) : "",
    net: item.declared_net_weight !== null ? String(item.declared_net_weight) : "",
    lot: item.declared_producer_lot ?? "",
    altDescription: item.declared_alt_description ?? "",
    notes: item.line_notes ?? "",
  };
}

function ConsegnaEsterna() {
  const { token } = Route.useParams();
  const loadDraft = useServerFn(externalDeliveryDraft);
  const runSet = useServerFn(externalSetDeliveryItem);
  const runSubmit = useServerFn(externalSubmitDelivery);

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, LineEdit>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [name, setName] = useState("");
  const [sent, setSent] = useState(false);

  const draftQuery = useQuery({
    queryKey: ["external-delivery", token],
    retry: false,
    queryFn: () => loadDraft({ data: { token } }),
  });
  const draft = draftQuery.data;

  const editFor = (item: DraftItem): LineEdit => edits[item.id] ?? initialEdit(item);
  const setField = (item: DraftItem, field: keyof LineEdit, value: string) =>
    setEdits((prev) => {
      const next = { ...editFor(item), [field]: value };
      const unit = (item.purchase_unit_code ?? item.unit_code ?? "").toLowerCase();
      const isWeight = unit === "kg" || unit === "g" || unit.startsWith("chilogramm") || unit.startsWith("gramm");
      if (field === "tare" || field === "gross") {
        const tare = next.tare.trim() ? parseQuantity(next.tare) : null;
        const gross = next.gross.trim() ? parseQuantity(next.gross) : null;
        next.net = tare !== null && gross !== null ? String(Math.round((gross - tare) * 1000) / 1000) : "";
        if (isWeight && next.net) next.quantity = next.net;
      }
      if (field === "net" && isWeight) next.quantity = value;
      return { ...prev, [item.id]: next };
    });
  const isChecked = (item: DraftItem) => checked[item.id] ?? false;
  const checkedCount = (draft?.items ?? []).filter((item) => isChecked(item)).length;

  const submit = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("Dati non disponibili");
      const chosen = draft.items.filter((item) => isChecked(item));
      if (chosen.length === 0) throw new Error("Spunta almeno un prodotto che consegni");
      for (const item of chosen) {
        const edit = editFor(item);
        const label = item.products?.description ?? item.products?.code ?? "prodotto";
        const quantity = parseQuantity(edit.quantity);
        if (quantity === null || quantity < 0) throw new Error(`Quantità non valida per ${label}`);
        const price = edit.price.trim() ? parseQuantity(edit.price) : null;
        if (edit.price.trim() && (price === null || price < 0)) throw new Error(`Prezzo non valido per ${label}`);
        const tare = edit.tare.trim() ? parseQuantity(edit.tare) : null;
        const gross = edit.gross.trim() ? parseQuantity(edit.gross) : null;
        const net = edit.net.trim() ? parseQuantity(edit.net) : null;
        for (const [value, field] of [[tare, "Tara"], [gross, "Peso lordo"], [net, "Peso netto"]] as const) {
          if (value !== null && value < 0) throw new Error(`${field} non valido per ${label}`);
        }
        // La quantità va nella U.M. d'acquisto se esiste, altrimenti in quella di magazzino.
        const inPurchaseUnit = Boolean(item.purchase_unit_code);
        await runSet({
          data: {
            token,
            deliveryItemId: item.id,
            declaredQuantity: inPurchaseUnit ? null : quantity,
            declaredProducer: null,
            declaredProducerLot: edit.lot.trim() ? edit.lot.trim() : null,
            declaredExpiry: null,
            lineNotes: edit.notes.trim() ? edit.notes.trim() : null,
            missingReason: quantity === 0 ? "Non disponibile" : null,
            declaredPurchaseQuantity: inPurchaseUnit ? quantity : null,
            declaredUnitPrice: price,
            declaredTareWeight: tare,
            declaredGrossWeight: gross,
            declaredNetWeight: net,
            declaredAltDescription: edit.altDescription.trim() ? edit.altDescription.trim() : null,
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
    const msg = String((draftQuery.error as Error)?.message ?? "");
    const reason = msg.includes("scaduto")
      ? { title: "Link scaduto", text: "Il periodo di validità di questo link è terminato." }
      : msg.includes("revocato")
        ? { title: "Link annullato", text: "Questo link è stato sostituito o annullato." }
        : msg.includes("deve essere inviato")
          ? {
              title: "Ordine non ancora inviato",
              text: "Chi ti ha mandato il link non ha ancora confermato l'invio dell'ordine. Il link funzionerà appena l'invio sarà confermato.",
            }
          : { title: "Link non valido", text: "Questo indirizzo non corrisponde a nessun ordine." };
    return (
      <main className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <BrandMark />
        <h1 className="text-lg font-semibold">{reason.title}</h1>
        <p className="text-sm text-muted-foreground">
          {reason.text} Contatta chi ti ha inviato l'ordine.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 pb-16">
      <div className="flex items-center justify-between gap-2">
        <BrandMark />
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          Ordine ricevuto
        </span>
      </div>

      <h1 className="text-2xl font-bold">{draft?.orderNumber ?? "…"}</h1>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-3 text-sm">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <User className="h-3 w-3" /> Cliente
          </p>
          <p className="mt-1 font-semibold">{draft?.buyerName ?? "…"}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-sm">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarDays className="h-3 w-3" /> Consegna prevista
          </p>
          <p className="mt-1 font-semibold">
            {draft?.deliveryDate
              ? new Date(`${draft.deliveryDate}T00:00:00`).toLocaleDateString("it-IT")
              : "Da concordare"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-sm">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" /> Indirizzo di consegna
          </p>
          <p className="mt-1 font-semibold">{draft?.deliveryAddress || "Non indicato"}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-sm">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <FileText className="h-3 w-3" /> Note ordine
          </p>
          <p className="mt-1 font-semibold">{draft?.orderNotes || "—"}</p>
        </div>
      </div>

      {sent ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm">
          Comunicazione ricevuta. Il controllo della merce avverrà alla consegna.
        </p>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-base font-semibold">Comunica la consegna</h2>
            <p className="text-sm text-muted-foreground">
              Spunta i prodotti che consegni e indica la quantità. Tocca la freccia per aggiungere
              prezzo, pesi, lotto e note (facoltativi).
            </p>
            <div className="space-y-2">
              {(draft?.items ?? []).map((item) => {
                const edit = editFor(item);
                const unit = item.purchase_unit_code ?? item.unit_code ?? "";
                const open = expanded[item.id] ?? false;
                const on = isChecked(item);
                return (
                  <div
                    key={item.id}
                    className={`rounded-lg border p-3 ${on ? "border-primary bg-primary/5" : "border-border bg-card"}`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        aria-label={`Consegno ${item.products?.description ?? item.products?.code}`}
                        onClick={() => setChecked((prev) => ({ ...prev, [item.id]: !on }))}
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-md border-2 ${
                          on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
                        }`}
                      >
                        {on ? <Check className="h-4 w-4" /> : null}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{item.products?.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.products?.code}
                          {item.purchase_unit_code && item.unit_code && item.purchase_unit_code !== item.unit_code
                            ? ` · ordinato in ${item.purchase_unit_code}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Input
                          inputMode="decimal"
                          aria-label={`Quantità da consegnare per ${item.products?.description ?? item.products?.code}`}
                          className="h-9 w-20 text-right"
                          value={edit.quantity}
                          onChange={(event) => setField(item, "quantity", event.target.value)}
                          onFocus={() => {
                            if (!on) setChecked((prev) => ({ ...prev, [item.id]: true }));
                          }}
                        />
                        <span className="w-8 text-sm text-muted-foreground">{unit}</span>
                        <button
                          type="button"
                          aria-label={open ? "Nascondi dettagli" : "Mostra dettagli"}
                          onClick={() => setExpanded((prev) => ({ ...prev, [item.id]: !open }))}
                          className="grid h-9 w-9 place-items-center text-muted-foreground"
                        >
                          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    {open ? (
                      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                        <label>
                          Prezzo unitario (€/{unit || "unità"})
                          <Input
                            className="mt-1"
                            inputMode="decimal"
                            value={edit.price}
                            onChange={(event) => setField(item, "price", event.target.value)}
                          />
                        </label>
                        <label>
                          Tara (kg)
                          <Input
                            className="mt-1"
                            inputMode="decimal"
                            value={edit.tare}
                            onChange={(event) => setField(item, "tare", event.target.value)}
                          />
                        </label>
                        <label>
                          Peso lordo (kg)
                          <Input
                            className="mt-1"
                            inputMode="decimal"
                            value={edit.gross}
                            onChange={(event) => setField(item, "gross", event.target.value)}
                          />
                        </label>
                        <label>
                          Peso netto (kg)
                          <Input
                            className="mt-1"
                            inputMode="decimal"
                            value={edit.net}
                            onChange={(event) => setField(item, "net", event.target.value)}
                          />
                        </label>
                        <label>
                          Lotto
                          <Input
                            className="mt-1"
                            value={edit.lot}
                            onChange={(event) => setField(item, "lot", event.target.value)}
                          />
                        </label>
                        <label>
                          Descrizione alternativa
                          <Input
                            className="mt-1"
                            value={edit.altDescription}
                            onChange={(event) => setField(item, "altDescription", event.target.value)}
                          />
                        </label>
                        <label className="col-span-2">
                          Note per {draft?.buyerName ?? "il cliente"}
                          <Textarea
                            className="mt-1"
                            rows={2}
                            value={edit.notes}
                            onChange={(event) => setField(item, "notes", event.target.value)}
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            La comunicazione della consegna non modifica l'ordine originale. Le informazioni che
            inserisci saranno inviate a {draft?.buyerName ?? "chi ha ordinato"} e serviranno per la
            ricezione della merce.
          </p>

          <label className="block text-xs text-muted-foreground">
            Il tuo nome
            <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <Button
            className="w-full"
            onClick={() => submit.mutate()}
            disabled={submit.isPending || !draft || checkedCount === 0}
          >
            Invia la comunicazione{checkedCount > 0 ? ` (${checkedCount} ${checkedCount === 1 ? "prodotto" : "prodotti"})` : ""}
          </Button>
        </>
      )}

      <section className="rounded-lg border border-primary/30 bg-primary/5 p-4">
        <h2 className="text-base font-semibold">Vuoi gestire i tuoi ordini direttamente su Trevi Fruit?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Registrati gratuitamente per ricevere, consultare e gestire tutti i tuoi ordini in un
          unico posto.
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Visualizza lo storico dei tuoi ordini</li>
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Ricevi le notifiche in tempo reale</li>
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Comunica le consegne più velocemente</li>
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link to="/auth">Registrati ora</Link>
          </Button>
          <p className="text-sm text-muted-foreground">
            Hai già un account?{" "}
            <Link to="/auth" className="font-medium text-primary underline">
              Accedi
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

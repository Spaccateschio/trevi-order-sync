import { useState } from "react";
import { Plus, ShoppingBasket, Star, Trash2, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Proposta isolata: nessun dato operativo o comando di salvataggio. */
export function DirectPurchaseMockup() {
  const [direct, setDirect] = useState(false);
  const [secondSupplier, setSecondSupplier] = useState(false);
  const [preferred, setPreferred] = useState<string | null>("supplier");

  function togglePreferred(value: string) {
    setPreferred((current) => current === value ? null : value);
  }

  function preferenceButton(value: string, name: string) {
    const selected = preferred === value;
    return (
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={`Scelta abituale: ${name}`}
        aria-pressed={selected}
        title={selected ? "Togli scelta abituale" : "Imposta come scelta abituale"}
        onClick={() => togglePreferred(value)}
        className={cn("shrink-0", selected && "text-accent-foreground bg-accent/20")}
      >
        <Star className={cn("size-4", selected && "fill-current")} />
      </Button>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge variant="outline">Anteprima — nessun salvataggio</Badge>
        <span className="text-xs text-muted-foreground">Prodotto e fornitori di esempio</span>
      </div>
      <section aria-labelledby="demo-product" className="space-y-6">
        <header className="space-y-3 border-b pb-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">Esempio</Badge><span>DEMO-001</span>
          </div>
          <h2 id="demo-product" className="text-lg font-semibold">ALLORO A MAZZI — ESEMPIO</h2>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>Prodotto</span><span>Vendita</span>
            <span className="font-semibold text-foreground" aria-current="page">Acquisto</span><span>Inventario</span>
          </div>
        </header>

        <section aria-labelledby="demo-sources" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="demo-sources" className="text-sm font-semibold">Fornitori e acquisto diretto</h3>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={secondSupplier} onClick={() => setSecondSupplier(true)}>
                <Plus className="size-4" /> Fornitore
              </Button>
              <Button size="sm" variant="outline" disabled={direct} onClick={() => setDirect(true)}>
                <Plus className="size-4" /> Acquisto diretto
              </Button>
            </div>
          </div>

          <article className="rounded-md border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-2">
                <h4 className="flex items-center gap-2 text-sm font-semibold"><Truck className="size-4 shrink-0" /> AZIENDA AGRICOLA DEMO</h4>
                <Badge variant="secondary">Fornitore</Badge>
                {preferred === "supplier" ? <Badge variant="outline" className="ml-2">Scelta abituale</Badge> : null}
              </div>
              {preferenceButton("supplier", "Azienda agricola demo")}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">U.M. acquistabile</dt><dd>mz</dd></div>
              <div><dt className="text-xs text-muted-foreground">Origine</dt><dd>Manuale</dd></div>
            </dl>
          </article>

          {secondSupplier ? (
            <article className="rounded-md border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-2">
                  <h4 className="flex items-center gap-2 text-sm font-semibold"><Truck className="size-4 shrink-0" /> MERCATO DEMO</h4>
                  <Badge variant="secondary">Fornitore</Badge>
                  {preferred === "second" ? <Badge variant="outline" className="ml-2">Scelta abituale</Badge> : null}
                </div>
                {preferenceButton("second", "Mercato demo")}
              </div>
            </article>
          ) : null}

          {direct ? (
            <article className="rounded-md border border-accent bg-accent/10 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-2">
                  <h4 className="flex items-start gap-2 text-sm font-semibold"><ShoppingBasket className="mt-0.5 size-4 shrink-0" /> Acquisto diretto — compro io</h4>
                  <Badge variant="secondary">Acquisto personale</Badge>
                  {preferred === "direct" ? <Badge variant="outline" className="ml-2">Scelta abituale</Badge> : null}
                </div>
                <div className="flex shrink-0">
                  {preferenceButton("direct", "Acquisto diretto")}
                  <Button size="icon" variant="ghost" title="Togli acquisto diretto" aria-label="Togli acquisto diretto" onClick={() => {
                    setDirect(false);
                    setPreferred((current) => current === "direct" ? null : current);
                  }}><Trash2 className="size-4" /></Button>
                </div>
              </div>
            </article>
          ) : null}
        </section>
      </section>
    </div>
  );
}
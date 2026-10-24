import { useState } from "react";
import { ImageOff, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Proposta visiva del pannello prodotto sempre attivo su computer.
 * Solo dati di esempio e stato locale: nessun salvataggio e nessun accesso ai dati reali.
 */

type DemoProduct = {
  id: string;
  code: string;
  description: string;
  danea_um: string;
  sale_units: string;
  listino: string;
  category: string;
};

const DEMO_PRODUCTS: DemoProduct[] = [
  { id: "p1", code: "0225", description: "AGLIO SPAGNA", danea_um: "kg", sale_units: "kg, pz, cs", listino: "5,00 €", category: "Ortaggi" },
  { id: "p2", code: "0288", description: "ALLORO IT A MAZZI", danea_um: "mazzo", sale_units: "nr, mazzo, mz", listino: "1,30 €", category: "Erbe aromatiche" },
  { id: "p3", code: "0846", description: "ANANAS COSTA RICA", danea_um: "kg", sale_units: "kg, cs, pz", listino: "2,00 €", category: "Frutta" },
  { id: "p4", code: "1316", description: "AVOCADO HASS KG", danea_um: "kg", sale_units: "kg, cs, pz", listino: "6,80 €", category: "Frutta" },
  { id: "p5", code: "0836", description: "BANANE COSTARICA", danea_um: "kg", sale_units: "kg, pz, cs", listino: "2,00 €", category: "Frutta" },
  { id: "p6", code: "0247", description: "BASILICO ERBE AROMATICHE IT CASSA", danea_um: "cassa", sale_units: "pz, cs, cassa", listino: "8,50 €", category: "Erbe aromatiche" },
  { id: "p7", code: "0114", description: "BROCCOLI ROMA IT", danea_um: "kg", sale_units: "kg, cs, pz", listino: "3,50 €", category: "Ortaggi" },
  { id: "p8", code: "1792", description: "CARCIOFI IT CAPATI", danea_um: "pezzo", sale_units: "nr, pezzo", listino: "1,95 €", category: "Ortaggi" },
];

const TABS = ["Prodotto", "Vendita", "Acquisto", "Inventario"] as const;

function Panel({ product, onClose }: { product: DemoProduct | null; onClose: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Prodotto");

  if (!product) {
    return (
      <div className="grid h-full min-h-[320px] place-items-center rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
        <div className="space-y-2">
          <p className="text-sm font-medium">Seleziona un prodotto</p>
          <p className="text-xs text-muted-foreground">Tocca una riga dell'elenco: la scheda si apre qui, a fianco.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Danea</Badge>
              <span className="font-mono text-xs text-muted-foreground">{product.code}</span>
            </div>
            <h2 className="truncate text-base font-semibold">{product.description}</h2>
          </div>
          <Button type="button" size="icon" variant="ghost" aria-label="Chiudi la scheda" onClick={onClose} className="shrink-0">
            <X className="size-4" />
          </Button>
        </div>
        <div className="mt-3 grid w-full grid-cols-4 gap-1 rounded-md bg-muted p-0.5">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={tab === item}
              onClick={() => setTab(item)}
              className={cn(
                "rounded-sm px-2 py-1.5 text-xs font-medium transition-colors",
                tab === item ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {tab === "Prodotto" ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div><dt className="text-xs uppercase text-muted-foreground">Codice</dt><dd>{product.code}</dd></div>
            <div><dt className="text-xs uppercase text-muted-foreground">U.M. base</dt><dd>{product.danea_um}</dd></div>
            <div><dt className="text-xs uppercase text-muted-foreground">Descrizione</dt><dd>{product.description}</dd></div>
            <div><dt className="text-xs uppercase text-muted-foreground">Categoria</dt><dd>{product.category}</dd></div>
            <div><dt className="text-xs uppercase text-muted-foreground">Archivio</dt><dd>Catalogo attuale</dd></div>
            <div><dt className="text-xs uppercase text-muted-foreground">Origine</dt><dd>Danea</dd></div>
          </dl>
        ) : tab === "Vendita" ? (
          <div className="space-y-3 text-sm">
            <div className="divide-y divide-border/60 rounded-lg border border-border px-3">
              <div className="flex items-center justify-between gap-2 py-2"><span>In vetrina B2B</span><span className="text-xs text-muted-foreground">Sì</span></div>
              <div className="flex items-center justify-between gap-2 py-2"><span>Disponibilità commerciale</span><span className="text-xs text-muted-foreground">Disponibile</span></div>
              <div className="flex items-center justify-between gap-2 py-2"><span>U.M. del prezzo</span><span className="text-xs text-muted-foreground">{product.danea_um}</span></div>
            </div>
            <section>
              <h3 className="text-sm font-semibold">Listini</h3>
              <div className="mt-1 flex justify-between border-t border-border py-1.5"><span className="text-muted-foreground">Listino 1</span><span>{product.listino}</span></div>
            </section>
            <section>
              <h3 className="text-sm font-semibold">U.M. ordinabili</h3>
              <div className="mt-1 flex flex-wrap gap-1.5">{product.sale_units.split(", ").map((unit) => <Badge key={unit} variant="secondary">{unit}</Badge>)}</div>
            </section>
          </div>
        ) : tab === "Acquisto" ? (
          <div className="space-y-3 text-sm">
            <section>
              <h3 className="text-sm font-semibold">U.M. di acquisto</h3>
              <div className="mt-1 flex flex-wrap gap-1.5"><Badge variant="secondary">{product.danea_um}</Badge></div>
            </section>
            <section>
              <h3 className="text-sm font-semibold">Fornitori</h3>
              <div className="mt-1 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">Esempio: AZIENDA AGRICOLA DEMO · mz ★</div>
            </section>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <section>
              <h3 className="text-sm font-semibold">Giacenza</h3>
              <div className="mt-1 flex justify-between border-t border-border py-1.5"><span className="text-muted-foreground">In {product.danea_um}</span><span>24</span></div>
            </section>
            <section>
              <h3 className="text-sm font-semibold">Zone</h3>
              <div className="mt-1 flex flex-wrap gap-1.5"><Badge variant="secondary">Frigorifero Medio ★</Badge></div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

export function ProductDetailPanelMockup() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = DEMO_PRODUCTS.find((product) => product.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Anteprima — nessun salvataggio</Badge>
        <span className="text-xs text-muted-foreground">Prodotti di esempio · proposta per computer</span>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(380px,44%)]">
        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th className="w-12 px-3 py-2 text-left font-semibold">Foto</th>
                <th className="px-3 py-2 text-left font-semibold">Codice / Descrizione</th>
                <th className="w-28 px-3 py-2 text-left font-semibold">U.M.</th>
                <th className="w-24 px-3 py-2 text-right font-semibold">Prezzo</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_PRODUCTS.map((product) => (
                <tr
                  key={product.id}
                  className={cn(
                    "cursor-pointer border-t border-border hover:bg-muted/50",
                    selectedId === product.id && "bg-accent/10",
                  )}
                  onClick={() => setSelectedId(product.id)}
                >
                  <td className="px-3 py-2">
                    <span className="grid h-10 w-10 place-items-center rounded bg-muted">
                      <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="block font-mono text-xs text-muted-foreground">{product.code}</span>
                    <span className="block font-medium">{product.description}</span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{product.sale_units}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{product.listino}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="lg:sticky lg:top-4 lg:h-[calc(100dvh-9rem)]">
          <Panel product={selected} onClose={() => setSelectedId(null)} />
        </div>
      </div>
    </div>
  );
}

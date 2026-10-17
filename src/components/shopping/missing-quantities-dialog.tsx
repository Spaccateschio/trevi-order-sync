import { useState, type ReactNode } from "react";
import { Search, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { qty } from "@/lib/inventory";
import type { StockInfo } from "./shopping-list-card";

export type CompletionItem = { id: string; code: string; name: string; stock?: StockInfo | undefined };

export function MissingQuantitiesDialog({ open, onOpenChange, items, renderEditor, busy, onContinue }: {
  open: boolean; onOpenChange: (open: boolean) => void; items: CompletionItem[];
  renderEditor: (id: string) => ReactNode; busy: boolean; onContinue: () => void;
}) {
  const [search, setSearch] = useState("");
  const term = search.trim().toLocaleLowerCase("it");
  const visible = items.filter((item) => `${item.name} ${item.code}`.toLocaleLowerCase("it").includes(term));
  const amount = (value: number | null | undefined, unit: string | null | undefined) => value == null ? "—" : `${qty(value)} ${unit ?? ""}`;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[90dvh] min-w-0 flex-col gap-3 overflow-hidden sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>Completa le quantità</DialogTitle>
        <DialogDescription>{items.length ? `${items.length} ${items.length === 1 ? "prodotto" : "prodotti"} da completare` : "Quantità completate"}</DialogDescription>
      </DialogHeader>
      <div className="relative shrink-0">
        <Search className="absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true" />
        <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Cerca nei prodotti da completare" placeholder="Cerca prodotto o codice" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        {visible.map((item) => <div key={item.id} className="grid min-w-0 gap-2 border-b border-border py-3 sm:grid-cols-[minmax(0,1fr)_minmax(240px,1fr)]">
          <div className="min-w-0">
            <p className="break-words text-sm font-bold">{item.name}</p>
            <p className="text-xs text-muted-foreground">{item.code}</p>
            <dl className="mt-1.5 grid grid-cols-2 gap-2 text-xs">
              <div><dt className="text-muted-foreground">Ultimo conteggio</dt><dd className="font-semibold">{amount(item.stock?.lastQuantity, item.stock?.lastUnit)}</dd></div>
              <div><dt className="text-muted-foreground">Giacenza</dt><dd className="font-semibold">{amount(item.stock?.stock, item.stock?.stockUnit)}</dd></div>
            </dl>
          </div>
          <div className="min-w-0">{renderEditor(item.id)}</div>
        </div>)}
        {!visible.length ? <p className="py-6 text-center text-sm text-muted-foreground">{items.length ? "Nessun prodotto con questa ricerca." : "Tutte le quantità sono confermate."}</p> : null}
      </div>
      <DialogFooter className="shrink-0 gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button>
        <Button disabled={items.length > 0 || busy} onClick={onContinue}><ArrowRight className="size-4" /> Continua</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
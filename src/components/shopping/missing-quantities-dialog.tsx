import { useState, type ReactNode } from "react";
import { Search, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { qty } from "@/lib/inventory";
import type { StockInfo } from "./shopping-list-card";

export type CompletionItem = { id: string; code: string; name: string; stock?: StockInfo | undefined; empty: boolean };

export function MissingQuantitiesDialog({ open, onOpenChange, items, renderEditor, busy, onContinue, onExcludeEmpty }: {
  open: boolean; onOpenChange: (open: boolean) => void; items: CompletionItem[];
  renderEditor: (id: string) => ReactNode; busy: boolean; onContinue: () => void;
  onExcludeEmpty: (ids: string[]) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [confirmationIds, setConfirmationIds] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const disabled = busy || submitting;
  const continueOrAsk = () => {
    setError(null);
    const emptyIds = items.filter((item) => item.empty).map((item) => item.id);
    if (emptyIds.length) setConfirmationIds(emptyIds);
    else if (items.length) setError("Conferma le quantità già inserite prima di continuare.");
    else onContinue();
  };
  const confirmEmpty = async () => {
    if (disabled || !confirmationIds) return;
    setSubmitting(true);
    setError(null);
    try {
      await onExcludeEmpty(confirmationIds);
      setConfirmationIds(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Operazione non riuscita. Le quantità inserite restano disponibili.");
      setConfirmationIds(null);
    } finally { setSubmitting(false); }
  };
  const term = search.trim().toLocaleLowerCase("it");
  const visible = items.filter((item) => `${item.name} ${item.code}`.toLocaleLowerCase("it").includes(term));
  const amount = (value: number | null | undefined, unit: string | null | undefined) => value == null ? "—" : `${qty(value)} ${unit ?? ""}`;
  return <><Dialog open={open} onOpenChange={(next) => { if (!disabled) { setConfirmationIds(null); setError(null); onOpenChange(next); } }}>
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
        <Button variant="outline" disabled={disabled} onClick={() => onOpenChange(false)}>Chiudi</Button>
        <Button disabled={disabled} onClick={continueOrAsk}><ArrowRight className="size-4" /> Continua</Button>
      </DialogFooter>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </DialogContent>
  </Dialog>
    <AlertDialog open={open && confirmationIds !== null} onOpenChange={(next) => { if (!next && !disabled) setConfirmationIds(null); }}>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Quantità non inserite</AlertDialogTitle>
          <AlertDialogDescription>{confirmationIds?.length} {confirmationIds?.length === 1 ? "prodotto senza quantità. Lo segno" : "prodotti senza quantità. Li segno"} come «Non acquistare»? Le quantità già inserite e i fornitori impostati restano invariati.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <Button variant="outline" disabled={disabled} onClick={() => setConfirmationIds(null)}>No, torno alle quantità</Button>
          <Button disabled={disabled} onClick={() => void confirmEmpty()}>{submitting ? "Salvataggio…" : "Sì, non acquistare"}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
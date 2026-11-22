import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCheck, ChevronRight, ShoppingCart, Trash2, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { confirmedLinesWithoutDrafts, entryCartMetrics, type EntryCartLine, type EntryCartMissing, type EntryCartProgress } from "@/lib/local-entry-cart";

export function EntryCartDock({
  areaLabel,
  lines,
  confirmedLines,
  reviewSignal = 0,
  missing,
  progress,
  saving,
  confirmDisabled = false,
  secondaryAction,
  onQuantityChange,
  onRemove,
  onRevealMissing,
  onConfirm,
  onRetry,
}: {
  areaLabel: string;
  lines: EntryCartLine[];
  confirmedLines?: EntryCartLine[];
  reviewSignal?: number;
  missing: EntryCartMissing[];
  progress: EntryCartProgress;
  saving: boolean;
  confirmDisabled?: boolean;
  secondaryAction?: { label: string; disabled?: boolean; onClick: () => void } | undefined;
  onQuantityChange: (id: string, quantity: string) => void;
  onRemove: (id: string) => void;
  onRevealMissing: (id: string) => void;
  onConfirm: () => void;
  onRetry?: (() => void) | undefined;
}) {
  const [cartOpen, setCartOpen] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const linesRef = useRef(lines);
  const retryRef = useRef(onRetry);
  linesRef.current = lines;
  retryRef.current = onRetry;
  useEffect(() => {
    const update = () => {
      const next = navigator.onLine;
      if (next && !online && linesRef.current.some((line) => line.error)) retryRef.current?.();
      setOnline(next);
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, [online]);
  useEffect(() => {
    if (reviewSignal > 0) setCartOpen(true);
  }, [reviewSignal]);
  const visibleConfirmedLines = useMemo(() => confirmedLinesWithoutDrafts(confirmedLines ?? [], lines), [confirmedLines, lines]);
  const summaryLines = lines.length ? lines : visibleConfirmedLines;
  const metrics = useMemo(() => entryCartMetrics(summaryLines), [summaryLines]);
  const percentage = progress?.total ? Math.round((progress.done / progress.total) * 100) : 0;

  const requestConfirm = () => {
    if (saving || confirmDisabled) return;
    // L'avviso offline è già visibile nella barra: un toast qui coprirebbe il pulsante.
    if (!online) return;
    if (missing.length) setMissingOpen(true);
    else onConfirm();
  };

  return <>
    <div data-entry-cart={areaLabel} data-hide-on-keyboard className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-sidebar-border bg-sidebar px-3 py-2 text-sidebar-foreground sm:px-5 lg:bottom-0 lg:left-60 lg:px-4">
      <div className="mx-auto grid w-full max-w-3xl gap-1.5">
        {!online ? <p className="flex items-center justify-center gap-1 text-[11px] font-semibold text-warning" role="status"><WifiOff className="size-3.5" /> Da sincronizzare · la bozza resta su questo dispositivo</p> : null}
        {progress ? <div className="space-y-1" aria-live="polite">
          <p className="text-center text-[11px]">Salvataggio {progress.done} di {progress.total}</p>
          <Progress value={percentage} className="h-1.5" aria-label="Avanzamento salvataggio" />
        </div> : null}
        <div className="flex min-w-0 items-stretch gap-2">
          <Button type="button" variant="ghost" className="h-auto min-w-0 flex-1 flex-col items-start bg-sidebar-accent px-3 py-1.5 text-left text-sidebar-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-foreground" onClick={() => setCartOpen(true)} aria-label={`Apri carrello ${areaLabel}`}>
            <span className="flex items-center gap-1.5 text-xs font-bold"><ShoppingCart className="size-4" /> CARRELLO</span>
            <span className="truncate text-[11px] font-normal text-sidebar-foreground/75">{metrics.products} {metrics.products === 1 ? "prodotto" : "prodotti"} · {metrics.suppliers} {metrics.suppliers === 1 ? "fornitore" : "fornitori"}</span>
          </Button>
          <Button type="button" className="shrink-0" disabled={saving || confirmDisabled} onClick={requestConfirm}>
            <CheckCheck /> {saving ? "Salvataggio…" : online ? "CONFERMA" : "RIPROVA"}
          </Button>
          {secondaryAction ? <Button type="button" variant="outline" className="hidden shrink-0 sm:inline-flex" disabled={saving || secondaryAction.disabled} onClick={secondaryAction.onClick}>{secondaryAction.label}</Button> : null}
        </div>
      </div>
    </div>

    <Dialog open={cartOpen} onOpenChange={(open) => { if (!saving) setCartOpen(open); }}>
      <DialogContent className="flex max-h-[85dvh] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Carrello · {areaLabel}</DialogTitle>
          <DialogDescription>{lines.length ? "Le modifiche restano sul dispositivo finché non premi Conferma." : "Riepilogo delle quantità salvate: puoi modificarle prima di preparare gli ordini."}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          <section aria-label="Articoli inseriti">
            <h3 className="mb-2 text-sm font-semibold">Inseriti ({lines.length})</h3>
            {lines.length ? <ul className="space-y-2">{lines.map((line) => <li key={line.id} className="rounded-md border border-border p-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{line.label}</p>{line.detail ? <p className="text-xs text-muted-foreground">{line.detail}</p> : null}</div>
                <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0" disabled={saving} onClick={() => onRemove(line.id)} aria-label={`Togli ${line.label} dal carrello`}><Trash2 className="size-4" /></Button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Input inputMode="decimal" className="h-9 text-right text-base font-semibold" value={line.quantity} disabled={saving} onChange={(event) => onQuantityChange(line.id, event.target.value)} aria-label={`Quantità nel carrello di ${line.label}`} />
                <span className="w-16 shrink-0 text-sm font-semibold">{line.unitCode ?? "—"}</span>
              </div>
              {line.supplierDetails?.length ? <p className="mt-1 text-xs text-muted-foreground">{line.supplierDetails.join(" · ")}</p> : null}
              {line.error ? <p className="mt-2 flex items-start gap-1 text-xs text-destructive" role="alert"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{line.error}</p> : null}
            </li>)}</ul> : <p className="text-sm text-muted-foreground">Nessuna nuova quantità inserita.</p>}
          </section>
          {visibleConfirmedLines.length ? <section aria-label="Articoli confermati" className="border-t border-border pt-3">
            <h3 className="mb-2 text-sm font-semibold">Confermati ({visibleConfirmedLines.length})</h3>
            <ul className="space-y-2">{visibleConfirmedLines.map((line) => <li key={line.id} className="rounded-md border border-border p-2">
              <p className="break-words text-sm font-semibold">{line.label}</p>
              {line.detail ? <p className="text-xs text-muted-foreground">{line.detail}</p> : null}
              <div className="mt-2 flex items-center gap-2">
                <Input inputMode="decimal" className="h-9 text-right text-base font-semibold" value={line.quantity} disabled={saving} onChange={(event) => onQuantityChange(line.id, event.target.value)} aria-label={`Modifica quantità confermata di ${line.label}`} />
                <span className="w-16 shrink-0 text-sm font-semibold">{line.unitCode ?? "—"}</span>
              </div>
              {line.supplierDetails?.length ? <p className="mt-1 text-xs text-muted-foreground">{line.supplierDetails.join(" · ")}</p> : null}
            </li>)}</ul>
          </section> : null}
          <section aria-label="Articoli mancanti" className="border-t border-border pt-3">
            <h3 className="mb-2 text-sm font-semibold">Mancanti ({missing.length})</h3>
            {missing.length ? <ul className="space-y-1">{missing.slice(0, 200).map((item) => <li key={item.id}><button type="button" className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-muted" onClick={() => { setCartOpen(false); onRevealMissing(item.id); }}>
              <span className="min-w-0 flex-1"><span className="block break-words text-sm">{item.label}</span>{item.detail ? <span className="block text-xs text-muted-foreground">{item.detail}</span> : null}</span><ChevronRight className="size-4 shrink-0" />
            </button></li>)}</ul> : <p className="text-sm text-muted-foreground">Tutti gli articoli hanno una quantità.</p>}
          </section>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={saving || confirmDisabled || !lines.length} onClick={() => { setCartOpen(false); requestConfirm(); }}><CheckCheck /> Conferma modifiche</Button>
          {secondaryAction ? <Button disabled={saving || secondaryAction.disabled || lines.length > 0} onClick={() => { setCartOpen(false); secondaryAction.onClick(); }}>{secondaryAction.label}</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={missingOpen} onOpenChange={(open) => { if (!saving) setMissingOpen(open); }}>
      <DialogContent className="flex max-h-[85dvh] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader><DialogTitle>Articoli senza quantità</DialogTitle><DialogDescription>Puoi completarli oppure confermare soltanto il carrello. I mancanti non diventano zero.</DialogDescription></DialogHeader>
        <div className="min-h-0 overflow-y-auto"><ul className="space-y-1">{missing.slice(0, 200).map((item) => <li key={item.id}><button type="button" className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left hover:bg-muted" onClick={() => { setMissingOpen(false); onRevealMissing(item.id); }}><span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold">{item.label}</span>{item.detail ? <span className="block text-xs text-muted-foreground">{item.detail}</span> : null}</span><ChevronRight className="size-4 shrink-0" /></button></li>)}</ul></div>
        <DialogFooter className="gap-2"><Button variant="outline" disabled={saving} onClick={() => setMissingOpen(false)}>Torna a inserire</Button><Button disabled={saving} onClick={() => { setMissingOpen(false); onConfirm(); }}>Conferma lo stesso</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

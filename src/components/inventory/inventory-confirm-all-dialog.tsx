import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ConfirmAllResult, InventoryBulkReview } from "@/lib/inventory-confirm-all";

const quantity = (value: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3 }).format(value);

export function InventoryConfirmAllDialog({ open, onOpenChange, review, loading, pending, error, skipped, onConfirm, onCorrect }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  review: InventoryBulkReview | null;
  loading: boolean;
  pending: boolean;
  error: string | null;
  skipped: ConfirmAllResult["skipped"];
  onConfirm: () => void;
  onCorrect: () => void;
}) {
  return <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
    <DialogContent className="flex max-h-[85dvh] w-full max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden sm:max-w-2xl [&>*]:min-w-0">
      <DialogHeader>
        <DialogTitle>Conferma tutto — riepilogo</DialogTitle>
        <DialogDescription>Tutte le card dell’inventario aperto, anche fuori dai filtri.</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 space-y-4 overflow-y-auto">
        {loading ? <p role="status" className="text-sm text-muted-foreground">Verifica delle quantità…</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {review ? <>
          <dl className="grid grid-cols-3 gap-3 border-y border-border py-3 text-sm">
            {([
              ["Da confermare", review.products.ready, review.ready.length],
              ["Vuoti · mai contati", review.products.empty, review.empty.length],
              ["Bloccati", review.products.blocked, review.blocked.length],
            ] as const).map(([label, products, cards]) => <div key={label} className="min-w-0">
              <dt className="break-words text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-semibold">{products} {products === 1 ? "prodotto" : "prodotti"}</dd>
              <dd className="text-xs text-muted-foreground">{cards} card</dd>
            </div>)}
          </dl>
          {review.blocked.length ? <section className="space-y-2">
            <h3 className="text-sm font-semibold">Quantità non confermabili</h3>
            <ul className="divide-y divide-border text-sm">{review.blocked.map((row) => <li key={row.key} className="py-2">
              <p className="font-semibold">{row.label}</p><p className="text-xs text-muted-foreground">{row.detail}</p>
              <p className="text-xs text-destructive">{row.blockedReason}</p>
            </li>)}</ul>
          </section> : null}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Le 10 differenze più grandi</h3>
            {review.differences.length ? <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-border text-muted-foreground"><tr>
                  <th className="py-2 pr-3 text-left">Prodotto</th><th className="p-2 text-right">Calcolata</th>
                  <th className="p-2 text-right">Contata</th><th className="py-2 pl-2 text-right">Differenza</th>
                </tr></thead>
                <tbody className="divide-y divide-border">{review.differences.map((row) => <tr key={row.key} className={cn(row.overHalf && "bg-destructive/5 text-destructive")}>
                  <td className="min-w-28 py-2 pr-3"><p className="font-semibold">{row.label}</p><p className="text-[11px]">{row.detail}</p>{row.overHalf ? <p className="mt-1 font-semibold">{row.calculated === 0 ? "Calcolata zero, contata diversa da zero" : "Differenza oltre il 50%"}</p> : null}</td>
                  <td className="whitespace-nowrap p-2 text-right">{quantity(row.calculated ?? 0)} {row.unit}</td>
                  <td className="whitespace-nowrap p-2 text-right">{quantity(row.counted)} {row.unit}</td>
                  <td className="whitespace-nowrap py-2 pl-2 text-right font-semibold">{row.difference > 0 ? "+" : ""}{quantity(row.difference)} {row.unit}</td>
                </tr>)}</tbody>
              </table>
            </div> : <p className="text-xs text-muted-foreground">Nessuna differenza confrontabile tra le bozze da confermare.</p>}
          </section>
          <p className="text-xs text-muted-foreground">I vuoti restano mai contati, non vengono salvati a zero. Le note sulle differenze sono facoltative. L’inventario resta aperto.</p>
        </> : null}
        {skipped.length ? <section className="space-y-2" aria-label="Quantità rimaste in bozza">
          <h3 className="text-sm font-semibold">Quantità rimaste in bozza</h3>
          <ul className="divide-y divide-border">{skipped.map((row, index) => <li key={`${row.label}-${index}`} className="py-2 text-sm"><p className="font-semibold">{row.label}</p><p className="text-xs text-destructive">{row.reason}</p></li>)}</ul>
        </section> : null}
      </div>
      <DialogFooter className="gap-2">
        <Button variant="outline" disabled={pending} onClick={onCorrect}>Torna a correggere</Button>
        <Button disabled={pending || loading || !review?.ready.length} onClick={onConfirm}>{pending ? "Conferma in corso…" : "Conferma tutto"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
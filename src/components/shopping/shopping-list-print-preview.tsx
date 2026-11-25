import { createPortal, flushSync } from "react-dom";
import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { hasEnteredQuantity, printQuantity, type ShoppingPrintRow } from "./shopping-list-print-data";

function PrintContent({ rows, filters, title }: { rows: ShoppingPrintRow[]; filters: string[]; title: string }) {
  return <div className="space-y-3 bg-background text-foreground">
    <h2 className="text-xl font-bold">{title}</h2>
    <p className="text-sm">Prodotti: {rows.length} · Filtri: {filters.length ? filters.join(" · ") : "Tutti i prodotti"}</p>
    <table className="w-full border-collapse text-left text-xs">
      <thead><tr>{["Prodotto / codice", "Categoria", "Giacenza", "Da acquistare", "Stato", "Fornitori / ripartizioni"].map((label) => <th key={label} className="border-b border-border p-2 align-top">{label}</th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}>
        <td className="border-b border-border p-2 align-top"><strong>{row.description ?? row.code}</strong><br />{row.code}</td>
        <td className="border-b border-border p-2 align-top">{row.category ?? "—"}</td>
        <td className="border-b border-border p-2 align-top">{printQuantity(row.stock, row.stockUnit)}</td>
        <td className="border-b border-border p-2 align-top">{row.nonPurchase ? "Non acquistare" : printQuantity(row.quantity, row.quantityUnit)}{row.draft ? <div className="font-semibold">Non confermata</div> : null}</td>
        <td className="border-b border-border p-2 align-top">{row.state}</td>
        <td className="border-b border-border p-2 align-top">{(row.splits.length ? row.splits : row.supplierNames).map((text, i) => <div key={`${i}:${text}`}>{text}</div>)}{!row.splits.length && !row.supplierNames.length ? "—" : null}</td>
      </tr>)}</tbody>
    </table>
    {!rows.length ? <p className="text-sm">Nessun prodotto corrisponde ai filtri impostati.</p> : null}
  </div>;
}

export function ShoppingListPrintPreview({ open, onOpenChange, rows, filters, title }: {
  open: boolean; onOpenChange: (value: boolean) => void; rows: ShoppingPrintRow[]; filters: string[]; title: string;
}) {
  const [quantityOnly, setQuantityOnly] = useState(false);
  const quantityRows = rows.filter(hasEnteredQuantity);
  const shown = quantityOnly ? quantityRows : rows;
  const shownFilters = quantityOnly ? [...filters, "Solo con quantità inserite"] : filters;
  /** Il foglio di stampa deve essere già aggiornato prima che il browser apra la stampa. */
  const print = (next: boolean) => { flushSync(() => setQuantityOnly(next)); window.print(); };
  const handleOpenChange = (value: boolean) => { if (!value) setQuantityOnly(false); onOpenChange(value); };

  return <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-1rem)] max-w-6xl flex-col print:hidden">
        <DialogHeader><DialogTitle>Stampa risultati</DialogTitle><DialogDescription>{rows.length} prodotti corrispondenti ai filtri impostati</DialogDescription></DialogHeader>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button className="w-fit" disabled={!rows.length} onClick={() => print(false)}><Printer aria-hidden="true" />Stampa / PDF</Button>
          <Button className="w-fit" variant="outline" disabled={!quantityRows.length} onClick={() => print(true)}><Printer aria-hidden="true" />Stampa solo con quantità inserite ({quantityRows.length})</Button>
        </div>
        <div className="min-h-0 overflow-auto"><div className="min-w-[720px]"><PrintContent rows={shown} filters={shownFilters} title={title} /></div></div>
      </DialogContent>
    </Dialog>
    {open && typeof document !== "undefined" ? createPortal(<div id="product-print-area" className="hidden print:block"><PrintContent rows={shown} filters={shownFilters} title={title} /></div>, document.body) : null}
  </>;
}

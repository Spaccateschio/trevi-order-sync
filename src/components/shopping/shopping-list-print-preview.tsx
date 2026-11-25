import { createPortal, flushSync } from "react-dom";
import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { printQuantity, type ShoppingPrintRow } from "./shopping-list-print-data";

type Col = "product" | "code" | "category" | "stock" | "quantity" | "state" | "suppliers";
const COLS: [Col, string][] = [["product", "Prodotto"], ["code", "Codice"], ["category", "Categoria"], ["stock", "Totale inventario"], ["quantity", "Da acquistare"], ["state", "Stato"], ["suppliers", "Fornitori / ripartizioni"]];
const DEFAULT_COLS: Col[] = ["product", "code", "quantity", "suppliers"];

function cell(row: ShoppingPrintRow, col: Col) {
  switch (col) {
    case "product": return <strong>{row.description ?? row.code}</strong>;
    case "code": return row.code;
    case "category": return row.category ?? "—";
    case "stock": return printQuantity(row.stock, row.stockUnit);
    case "quantity": return row.nonPurchase ? "Non acquistare" : printQuantity(row.quantity, row.quantityUnit);
    case "state": return row.state === "Non in lista" ? "—" : row.state;
    case "suppliers": return <>{(row.splits.length ? row.splits : row.supplierNames).map((text, i) => <div key={`${i}:${text}`}>{text}</div>)}{!row.splits.length && !row.supplierNames.length ? "—" : null}</>;
  }
}

function PrintContent({ rows, filters, title, cols }: { rows: ShoppingPrintRow[]; filters: string[]; title: string; cols: Col[] }) {
  const shownCols = COLS.filter(([c]) => cols.includes(c));
  return <div className="space-y-3 bg-background text-foreground">
    <h2 className="text-xl font-bold">{title}</h2>
    <p className="text-sm">Prodotti: {rows.length} · Filtri: {filters.length ? filters.join(" · ") : "Tutti i prodotti"}</p>
    <table className="w-full border-collapse text-left text-xs">
      <thead><tr>{shownCols.map(([c, label]) => <th key={c} className="border-b border-border p-2 align-top">{label}</th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}>{shownCols.map(([c]) => <td key={c} className="border-b border-border p-2 align-top">{cell(row, c)}</td>)}</tr>)}</tbody>
    </table>
    {!rows.length ? <p className="text-sm">Nessun prodotto corrisponde ai filtri impostati.</p> : null}
  </div>;
}

export function ShoppingListPrintPreview({ open, onOpenChange, rows, quantityRows, filters, title }: {
  open: boolean; onOpenChange: (value: boolean) => void; rows: ShoppingPrintRow[]; quantityRows: ShoppingPrintRow[]; filters: string[]; title: string;
}) {
  const [quantityOnly, setQuantityOnly] = useState(false);
  const [cols, setCols] = useState<Col[]>(DEFAULT_COLS);
  const toggleCol = (c: Col) => setCols((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  const shown = quantityOnly ? quantityRows : rows;
  const shownFilters = quantityOnly ? ["Solo con quantità inserite (tutti i prodotti, filtri ignorati)"] : filters;
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
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 text-sm"><span className="font-medium">Colonne da stampare:</span>{COLS.map(([c, label]) => <label key={c} className="flex items-center gap-1.5"><Checkbox checked={cols.includes(c)} onCheckedChange={() => toggleCol(c)} />{label}</label>)}</div>
        <div className="min-h-0 overflow-auto"><div className="min-w-[720px]"><PrintContent rows={shown} filters={shownFilters} title={title} cols={cols} /></div></div>
      </DialogContent>
    </Dialog>
    {open && typeof document !== "undefined" ? createPortal(<div id="product-print-area" className="hidden print:block"><PrintContent rows={shown} filters={shownFilters} title={title} cols={cols} /></div>, document.body) : null}
  </>;
}

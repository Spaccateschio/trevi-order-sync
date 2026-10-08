/** Etichette delle card della Lista: solo lettura di contenitori esistenti, nessun calcolo nuovo. */
export type EvaluationBadgeStatus = "da_valutare" | "da_acquistare" | "non_acquistare";

/**
 * Badge di valutazione Inventario (prodotto contato non ancora in Lista).
 * Fonte: inventory_purchase_evaluation_items; nessuna riga = da valutare.
 */
export function evaluationBadge(
  saved: { status: EvaluationBadgeStatus; decided_quantity: number | null } | undefined,
  unit: string,
): string {
  if (!saved || saved.status === "da_valutare") return "Da valutare";
  if (saved.status === "non_acquistare") return "Non acquistare";
  const q = saved.decided_quantity;
  return q && q > 0 ? `Da acquistare · ${q}${unit ? ` ${unit}` : ""}` : "Da acquistare";
}

/**
 * Card non in Lista: chi pubblica (B2B) o fornitori collegati (product_supplier_links).
 * Non indica mai un fornitore assegnato alla riga della Lista.
 */
export function catalogSupplierLabel(entry: { isB2b: boolean; supplierNames: string[] }): string {
  if (entry.isB2b) return `Catalogo B2B · ${entry.supplierNames[0] ?? "venditore"}`;
  const n = entry.supplierNames.length;
  if (n === 0) return "Nessun fornitore collegato";
  if (n <= 2) return `Fornitori collegati: ${entry.supplierNames.join(", ")}`;
  return `${n} fornitori collegati`;
}

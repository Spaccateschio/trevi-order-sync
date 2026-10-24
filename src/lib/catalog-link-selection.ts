/** Regole pure della finestra «Aggiungi ai miei prodotti». */

/** Il codice del fornitore viene sempre dall'articolo selezionato, mai da uno stato precedente. */
export function supplierCodeFor(sellerProduct: { code: string | null }): string {
  return (sellerProduct.code ?? "").trim();
}

/** Selezione valida solo se il prodotto è ancora tra i risultati visibili. */
export function visibleSelection(selectedId: string | null, visibleIds: readonly string[]): string | null {
  return selectedId && visibleIds.includes(selectedId) ? selectedId : null;
}

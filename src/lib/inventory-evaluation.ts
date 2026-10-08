export type EvaluationStatus = "da_valutare" | "da_acquistare" | "non_acquistare";

/** Regola: campo vuoto = da_valutare; quantità > 0 = da_acquistare. «Non acquistare» è solo un comando esplicito. */
export function statusFromQuantity(quantity: number | null): { status: EvaluationStatus; quantity: number | null } {
  return quantity !== null && quantity > 0
    ? { status: "da_acquistare", quantity }
    : { status: "da_valutare", quantity: null };
}

export type EvaluationRow = { product_id: string; status: EvaluationStatus; decided_quantity: number | null };

/** Contatori del riquadro: prodotti senza riga salvata sono «da valutare». */
export function evaluationCounts(productIds: string[], rows: Map<string, EvaluationRow>) {
  let daAcquistare = 0;
  let nonAcquistare = 0;
  for (const id of productIds) {
    const row = rows.get(id);
    if (row?.status === "da_acquistare" && Number(row.decided_quantity) > 0) daAcquistare += 1;
    else if (row?.status === "non_acquistare") nonAcquistare += 1;
  }
  return { daValutare: productIds.length - daAcquistare - nonAcquistare, daAcquistare, nonAcquistare };
}

/**
 * Conferma conteggio Inventario: aggiornamento ottimistico della sola card e ripristino su errore.
 * Funzioni pure: la ricarica in sottofondo dal database riallinea sempre lo stato reale.
 */
export type OptimisticCountRow = {
  calculated: number | string | null;
  counted: number | string | null;
  difference: number | string | null;
  counted_at: string | null;
  counted_unit_code: string | null;
  recount_requested_at: string | null;
};

export type CountPatch = { value: number; unitCode: string | null; stockValue: number | null; at: string };

/** Campi della card dopo una conferma: differenza solo se l'equivalente in U.M. di magazzino è noto. */
export function countedRowPatch(row: OptimisticCountRow, patch: CountPatch): Partial<OptimisticCountRow> {
  const calculated = row.calculated === null ? null : Number(row.calculated);
  return {
    counted: patch.value,
    counted_unit_code: patch.unitCode,
    counted_at: patch.at,
    recount_requested_at: null,
    difference: patch.stockValue === null || calculated === null ? null : Math.round((patch.stockValue - calculated) * 1000) / 1000,
  };
}

/** Nuovo elenco con la sola card indicata modificata; le altre restano gli stessi oggetti. */
export function patchCardRow<R>(rows: R[] | undefined, key: string, keyOf: (row: R) => string, patch: (row: R) => Partial<R>): R[] | undefined {
  if (!rows) return rows;
  let hit = false;
  const next = rows.map((row) => {
    if (keyOf(row) !== key) return row;
    hit = true;
    return { ...row, ...patch(row) };
  });
  return hit ? next : rows;
}

/** Ripristina la card salvata prima della conferma (solo quella), lasciando invariate le altre. */
export function restoreCardRow<R>(rows: R[] | undefined, key: string, keyOf: (row: R) => string, original: R | undefined): R[] | undefined {
  if (!rows || !original) return rows;
  return rows.map((row) => (keyOf(row) === key ? original : row));
}

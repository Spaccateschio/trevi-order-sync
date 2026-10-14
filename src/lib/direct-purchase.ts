/** Calcoli di sola visualizzazione dell'acquisto diretto: nessuna conversione tra U.M. viene inventata. */

export type DirectLineCalc = {
  quantity: number | null;
  unitId: string | null;
  unitPrice: number | null;
  priceUnitId: string | null;
};

/** Totale riga solo se quantità e prezzo sono nella stessa U.M.; altrimenti null (non calcolabile). */
export function directLineTotal(l: DirectLineCalc): number | null {
  if (l.quantity == null || l.unitPrice == null || !l.unitId || !l.priceUnitId) return null;
  if (l.unitId !== l.priceUnitId) return null;
  return Math.round(l.quantity * l.unitPrice * 100) / 100;
}

export function directTotals(lines: DirectLineCalc[], totalPaid: number | null) {
  let sum = 0;
  let notComputable = 0;
  for (const l of lines) {
    const t = directLineTotal(l);
    if (t === null) {
      if (l.unitPrice != null) notComputable += 1;
    } else sum += t;
  }
  sum = Math.round(sum * 100) / 100;
  const difference = totalPaid == null ? null : Math.round((totalPaid - sum) * 100) / 100;
  return { sum, notComputable, difference };
}

/** La quota della Lista è cambiata dopo la bozza? (fotografia diversa dal valore attuale) */
export function quotaChanged(
  planned: { quantity: number | null; unitId: string | null },
  current: { quantity: number | null; unitId: string | null } | null,
): boolean {
  if (!current) return true;
  return Number(planned.quantity) !== Number(current.quantity) || (planned.unitId ?? null) !== (current.unitId ?? null);
}

export function parseDecimal(v: string): number | null {
  const s = v.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

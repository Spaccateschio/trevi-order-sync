export type CustomerDocLine = { code: string | null; description: string | null; qty: number | null; um: string | null; price: number | null; total: number | null };
export type CustomerDoc = { id: string; sellerName: string; docType: string; docNumber: string; docDate: string | null; total: number; lines: CustomerDocLine[] };

/** Totale documento = somma dei totali di riga dichiarati da Trevi Incassi (qty×price se manca). */
export function docTotal(lines: CustomerDocLine[]): number {
  const cents = lines.reduce((sum, l) => {
    const t = l.total ?? (l.qty != null && l.price != null ? l.qty * l.price : 0);
    return sum + Math.round(t * 100);
  }, 0);
  return cents / 100;
}

/**
 * Ricollegamento da «Aggiungi fornitore»: se il fornitore era già collegato e poi scollegato,
 * si riattiva il collegamento spento (con il suo articolo B2B) invece di crearne un altro.
 */
export type InactiveLink = { id: string; b2b_item_id: string | null; created_at: string };

/** Collegamento da riattivare: prima quello con articolo B2B, poi il più recente; null se non c'è. */
export function pickLinkToReactivate<T extends InactiveLink>(rows: T[]): T | null {
  const sorted = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  return sorted.find((r) => r.b2b_item_id) ?? sorted[0] ?? null;
}

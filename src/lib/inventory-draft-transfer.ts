import { parseQuantity } from "@/lib/inventory";

type CardLike = { product_id: string; location_id: string; card_favorite?: boolean | null };

/** Card che riceve una quantità scritta prima dell'apertura: unica card, oppure unica con stella; altrimenti nessuna. */
export function resolveDraftTarget<T extends CardLike>(cards: T[], productId: string, locationId: string): T | null {
  const matches = cards.filter((row) => row.product_id === productId && row.location_id === locationId);
  if (matches.length === 1) return matches[0] ?? null;
  const starred = matches.filter((row) => row.card_favorite);
  return starred.length === 1 ? (starred[0] ?? null) : null;
}

type SavedEvaluation = { status?: string | null; decided_quantity?: number | string | null };

/** Quantità da inviare alla Lista: il valore mostrato nel campo prevale; senza testo, la riga salvata «da acquistare» > 0. */
export function typedPurchaseQuantities(
  productIds: string[],
  values: Record<string, string | undefined>,
  saved: Map<string, SavedEvaluation>,
): { product_id: string; quantity: number }[] {
  return productIds.flatMap((productId) => {
    const raw = (values[productId] ?? "").trim();
    if (raw) {
      const value = parseQuantity(raw);
      return value !== null && value > 0 ? [{ product_id: productId, quantity: value }] : [];
    }
    const row = saved.get(productId);
    return row?.status === "da_acquistare" && Number(row.decided_quantity) > 0
      ? [{ product_id: productId, quantity: Number(row.decided_quantity) }]
      : [];
  });
}

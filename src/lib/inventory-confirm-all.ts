/**
 * «Conferma tutto»: il database (confirm_all_inventory_drafts) conferma ogni bozza con i controlli
 * della conferma singola; le card non confermabili restano bozze. Qui solo il riepilogo da mostrare.
 */
export type ConfirmAllResult = {
  confirmed: number;
  skipped: { label: string; reason: string }[];
};

export function inventoryDraftQuantity(raw: string): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw.trim().replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export type InventoryReviewCard = {
  key: string;
  productId: string;
  label: string;
  detail: string;
  raw: string;
  alreadyCounted: boolean;
  calculated: number | null;
  unit: string;
  countedUnit: string;
  factor: number | null;
  blockedReason: string | null;
};

export type InventoryReviewDifference = InventoryReviewCard & {
  counted: number;
  difference: number;
  overHalf: boolean;
};

export type InventoryBulkReview = {
  ready: InventoryReviewCard[];
  empty: InventoryReviewCard[];
  blocked: InventoryReviewCard[];
  differences: InventoryReviewDifference[];
  products: { ready: number; empty: number; blocked: number };
  signature: string;
};

/** No percentage for unknown baselines; zero vs nonzero is anomalous without dividing by zero. */
export function inventoryDifferenceOverHalf(calculated: number | null, counted: number): boolean {
  return calculated !== null && Math.abs(counted - calculated) > Math.abs(calculated) * 0.5;
}

/** Compare drafts only, in stock units; a blank is never a zero or an existing count. */
export function inventoryBulkReview(cards: InventoryReviewCard[]): InventoryBulkReview {
  const ready: InventoryReviewCard[] = [];
  const empty: InventoryReviewCard[] = [];
  const blocked: InventoryReviewCard[] = [];
  const differences: InventoryReviewDifference[] = [];
  for (const card of cards) {
    if (!card.raw.trim()) {
      if (!card.alreadyCounted) empty.push(card);
      continue;
    }
    const quantity = inventoryDraftQuantity(card.raw);
    const reason = quantity === null ? "Quantità non valida" : card.blockedReason;
    if (reason) {
      blocked.push({ ...card, blockedReason: reason });
      continue;
    }
    if (quantity === null) continue;
    ready.push(card);
    if (card.factor === null || !Number.isFinite(card.factor) || card.factor <= 0) continue;
    const counted = Math.round(quantity * card.factor * 1000) / 1000;
    if (card.calculated !== null && Number.isFinite(card.calculated)) {
      const difference = Math.round((counted - card.calculated) * 1000) / 1000;
      if (difference !== 0) differences.push({ ...card, counted, difference, overHalf: inventoryDifferenceOverHalf(card.calculated, counted) });
    }
  }
  differences.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference) || a.label.localeCompare(b.label, "it") || a.key.localeCompare(b.key));
  const productCount = (rows: InventoryReviewCard[]) => new Set(rows.map((row) => row.productId)).size;
  return {
    ready, empty, blocked, differences: differences.slice(0, 10),
    products: { ready: productCount(ready), empty: productCount(empty), blocked: productCount(blocked) },
    signature: JSON.stringify([...cards].sort((a, b) => a.key.localeCompare(b.key))),
  };
}

/** Wait on actual writes, not elapsed time. A rejected write prevents the command. */
export async function afterInventoryDraftWrites<T>(writes: Promise<unknown>[], command: () => Promise<T>): Promise<T> {
  const results = await Promise.allSettled(writes);
  const failed = results.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  return command();
}

export function confirmAllSummary(result: ConfirmAllResult): { kind: "empty" | "done" | "partial"; message: string } {
  if (result.confirmed === 0 && result.skipped.length === 0) {
    return { kind: "empty", message: "Nessuna bozza da confermare" };
  }
  if (result.skipped.length === 0) {
    return { kind: "done", message: `${result.confirmed} quantità confermate` };
  }
  const names = result.skipped.slice(0, 3).map((s) => s.label).join(", ");
  return {
    kind: "partial",
    message: `${result.skipped.length} non confermate: ${names}${result.skipped.length > 3 ? "…" : ""}`,
  };
}

import { quantityHasDraft } from "./shopping-quantity-state";

export type QuantityCompletionFacts = {
  id: string;
  quantity: number | null;
  locked: boolean;
  excluded?: boolean | undefined;
  nonPurchase?: boolean | undefined;
  draft?: string | undefined;
  unitChanged?: boolean | undefined;
};

/** Uses the entire list, never the visible/filter subset. No writes or conversions. */
export function missingQuantities<T extends QuantityCompletionFacts>(rows: T[]): T[] {
  return rows.filter((row) => {
    if (row.excluded || (row.nonPurchase && row.draft === undefined)) return false;
    return row.quantity === null || row.quantity <= 0 || !row.locked || row.unitChanged || quantityHasDraft(row.draft, row.quantity);
  });
}
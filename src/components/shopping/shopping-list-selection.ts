type SelectableList = { id: string; status: string };

/** An explicit empty cycle is not an invitation to reuse a previous open list. */
export const NEXT_PURCHASE = "__next_purchase__";

export function purchaseSelectionKey(userId: string, companyId: string): string {
  return `shopping-purchase-cycle:${userId}:${companyId}`;
}

/** A pending old inventory must not hide an existing open purchase list. */
export function selectShoppingList<T extends SelectableList>(
  lists: readonly T[], selectedId: string | null, linked: T | null, inventoryPreview: boolean,
): T | null {
  if (selectedId === NEXT_PURCHASE) return null;
  return lists.find((row) => row.id === selectedId)
    ?? linked
    ?? lists.find((row) => row.status === "aperta")
    ?? (inventoryPreview ? null : lists.find((row) => row.status === "confermata") ?? null);
}
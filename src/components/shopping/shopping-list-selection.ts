type SelectableList = { id: string; status: string };

type DownloadedListFacts = {
  status: string;
  purchase_orders: readonly { status: string; danea_exported_at: string | null; purchase_order_items: readonly { source_assignment_id: string | null }[] }[];
  shopping_list_items: readonly {
    excluded_at: string | null;
    decided_quantity: number | null;
    decided_unit_id: string | null;
    decided_unit_code: string | null;
    manual_purchase_quantity: number | null;
    manual_purchase_done_at: string | null;
    shopping_list_item_suppliers: readonly { id: string; deselected_at: string | null; assigned_quantity: number | null }[];
  }[];
};

/** Only presentation: never complete a list or remove outstanding purchases. */
export function shoppingListDownloaded(list: DownloadedListFacts): boolean {
  const orders = list.purchase_orders.filter((order) => order.status !== "annullato");
  if (!orders.length || orders.some((order) => !order.danea_exported_at)) return false;
  if (list.status === "chiusa") return true;
  const covered = new Set(orders.flatMap((order) => order.purchase_order_items.map((item) => item.source_assignment_id)));
  return list.shopping_list_items.length > 0 && list.shopping_list_items.every((item) => {
    if (item.excluded_at || item.decided_quantity === 0) return true;
    if (item.decided_quantity === null) return false;
    // A quantity in a chosen purchase unit cannot be compared with stock equivalents.
    if (item.decided_unit_id || item.decided_unit_code) return false;
    if (item.manual_purchase_quantity && !item.manual_purchase_done_at) return false;
    const assignments = item.shopping_list_item_suppliers.filter((assignment) => !assignment.deselected_at);
    // Unknown equivalents must not be guessed. Closed lists use their authoritative status above.
    if (!assignments.length || assignments.some((assignment) => !covered.has(assignment.id) || assignment.assigned_quantity === null)) return false;
    return assignments.reduce((sum, assignment) => sum + (assignment.assigned_quantity ?? 0), 0) >= item.decided_quantity;
  });
}

/** An explicit empty cycle is not an invitation to reuse a previous open list. */
export const NEXT_PURCHASE = "__next_purchase__";

export function purchaseSelectionKey(userId: string, companyId: string): string {
  return `shopping-purchase-cycle:v2:${userId}:${companyId}`;
}

/** Start the authorized presentation once; afterwards retain explicit current work/recovery. */
export function restorePurchaseSelection(storedId: string | null): string {
  return storedId || NEXT_PURCHASE;
}

/** A pending old inventory must not hide an existing open purchase list. */
export function selectShoppingList<T extends SelectableList>(
  lists: readonly T[], selectedId: string | null, linked: T | null, inventoryPreview: boolean,
  // An explicit id (e.g. «Apri» from history) may point to a list hidden from current work.
  explicitLists: readonly T[] = lists,
): T | null {
  if (selectedId === NEXT_PURCHASE) return null;
  if (selectedId) return explicitLists.find((row) => row.id === selectedId) ?? null;
  return linked
    ?? lists.find((row) => row.status === "aperta")
    ?? (inventoryPreview ? null : lists.find((row) => row.status === "confermata") ?? null);
}
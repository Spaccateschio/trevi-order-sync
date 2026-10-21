type SelectableList = { id: string; status: string };

/** A pending old inventory must not hide an existing open purchase list. */
export function selectShoppingList<T extends SelectableList>(
  lists: readonly T[], selectedId: string | null, linked: T | null, inventoryPreview: boolean,
): T | null {
  return lists.find((row) => row.id === selectedId)
    ?? linked
    ?? lists.find((row) => row.status === "aperta")
    ?? (inventoryPreview ? null : lists.find((row) => row.status === "confermata") ?? null);
}
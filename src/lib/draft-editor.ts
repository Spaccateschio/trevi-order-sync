// Logica pura della finestra «Bozza»: stato modificabile, modifiche non salvate, chiusura.
export type DraftDelivery = { date: string; from: string; to: string; address: string; notes: string };
export type DraftEditState = { delivery: DraftDelivery; qty: Record<string, string> };
export type SavedDraftOrder = {
  delivery_date: string | null;
  delivery_time_from: string | null;
  delivery_time_to: string | null;
  delivery_address_text: string | null;
  supplier_notes: string | null;
};
export type SavedDraftItem = { id: string; purchase_quantity: number };

/** Stato iniziale = soltanto i dati salvati nel database. */
export function draftStateFromSaved(order: SavedDraftOrder, items: SavedDraftItem[]): DraftEditState {
  return {
    delivery: {
      date: order.delivery_date ?? "",
      from: order.delivery_time_from?.slice(0, 5) ?? "",
      to: order.delivery_time_to?.slice(0, 5) ?? "",
      address: order.delivery_address_text ?? "",
      notes: order.supplier_notes ?? "",
    },
    qty: Object.fromEntries(items.map((i) => [i.id, String(i.purchase_quantity)])),
  };
}

export function isDraftDirty(state: DraftEditState | null, order: SavedDraftOrder | null, items: SavedDraftItem[]): boolean {
  if (!state || !order) return false;
  const saved = draftStateFromSaved(order, items);
  const a = state.delivery;
  const b = saved.delivery;
  if (a.date !== b.date || a.from !== b.from || a.to !== b.to || a.address !== b.address || a.notes !== b.notes) return true;
  return items.some((i) => state.qty[i.id] !== saved.qty[i.id]);
}

/** Chiusura: con modifiche non salvate serve conferma; altrimenti si chiude subito. */
export function draftCloseAction(dirty: boolean, editable: boolean): "ask" | "close" {
  return dirty && editable ? "ask" : "close";
}

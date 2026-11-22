export type ShoppingListOrderStatus = {
  id: string;
  status: string;
  sent_at: string | null;
  seen_by_supplier_at: string | null;
};

export function isSentPurchaseOrder(order: Pick<ShoppingListOrderStatus, "status" | "sent_at">) {
  return order.status !== "annullato" && Boolean(order.sent_at);
}

export function shoppingListOrderSummary(orders: readonly ShoppingListOrderStatus[]) {
  const sent = orders.filter(isSentPurchaseOrder);
  const seen = sent.filter((order) => Boolean(order.seen_by_supplier_at)).length;
  return { sent: sent.length, seen, unopened: sent.length - seen };
}

export function shoppingListStatusMessage(input: {
  hasList: boolean;
  productCount: number;
  orders: readonly ShoppingListOrderStatus[];
  proposedDateLabel: string;
}) {
  if (!input.hasList) return `Nessuna lista fatta per il ${input.proposedDateLabel}`;
  const summary = shoppingListOrderSummary(input.orders);
  if (!summary.sent) return `Lista in lavorazione (${input.productCount} prodotti)`;
  return `Lista inviata: ${summary.sent} ${summary.sent === 1 ? "ordine" : "ordini"}, ${summary.seen} ${summary.seen === 1 ? "visto" : "visti"} dal fornitore, ${summary.unopened} ancora da aprire`;
}

export type ShoppingHistoryFilter = "tutte" | "lavorazione" | "inviate" | "chiuse" | "annullate";

export function matchesShoppingHistoryFilter(
  row: { status: string; purchase_orders: readonly ShoppingListOrderStatus[] },
  filter: ShoppingHistoryFilter,
) {
  if (filter === "annullate") return row.status === "annullata";
  if (row.status === "annullata") return false;
  if (filter === "lavorazione") return row.status === "aperta" || row.status === "confermata";
  if (filter === "chiuse") return row.status === "chiusa";
  if (filter === "inviate") return row.purchase_orders.some(isSentPurchaseOrder);
  return true;
}

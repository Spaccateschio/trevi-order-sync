export const SENT_ORDER_WINDOW_HOURS = 12;
export const PENDING_RECEIPT_STATUSES = ["inviato", "parzialmente_consegnato"];
export const PENDING_RECEIPT_REFRESH_MS = 15_000;

export function pendingPickupKey(companyId: string) {
  return ["purchase-orders-pending-pickup", companyId];
}

export function bannerRules(untilPickup: boolean, now = Date.now()) {
  return {
    statuses: untilPickup ? PENDING_RECEIPT_STATUSES : ["inviato"],
    since: untilPickup ? null : new Date(now - SENT_ORDER_WINDOW_HOURS * 3_600_000).toISOString(),
    dismissible: !untilPickup,
    refreshMs: untilPickup ? PENDING_RECEIPT_REFRESH_MS : 60_000,
  };
}

export function visibleSentOrders<T extends { id: string }>(orders: T[], dismissed: Set<string>, untilPickup: boolean): T[] {
  return untilPickup ? orders : orders.filter((order) => !dismissed.has(order.id));
}
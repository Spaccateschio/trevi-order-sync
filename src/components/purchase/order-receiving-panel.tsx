import { PurchaseOrdersPanel } from "./purchase-orders-panel";

/** Compatibility entry: receipt work now belongs to the unified supplier-order list. */
export function OrderReceivingPanel({ companyId }: { companyId: string }) {
  return <PurchaseOrdersPanel companyId={companyId} initialFilter="in_arrivo" />;
}

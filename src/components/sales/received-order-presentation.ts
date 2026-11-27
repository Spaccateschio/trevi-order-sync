import { compareOrderStage, orderStageRank, orderTimeline, type OrderTimeline } from '@/components/purchase/order-list-presentation';
import { deliveryTimelineFacts } from '@/lib/incassi/incassi-link';

export type SellerOrderFilter = 'da_lavorare' | 'in_consegna' | 'consegnati' | 'tutti';
export const SELLER_FILTER_LABELS: Record<SellerOrderFilter, string> = { da_lavorare: 'Da lavorare', in_consegna: 'In consegna', consegnati: 'Consegnati', tutti: 'Tutti' };
export const SELLER_FILTERS: SellerOrderFilter[] = ['da_lavorare', 'in_consegna', 'consegnati', 'tutti'];

export type SellerOrderFacts = {
  status: string; sent_at: string | null; seen_at: string | null; danea_exported_at: string | null;
  delivery_date: string | null; created_at: string; contested: boolean;
  progress?: Parameters<typeof deliveryTimelineFacts>[0];
};

/** Same unified timeline as the customer side; Danea download stays a separate badge, never a state. */
export function sellerOrderTimeline(o: SellerOrderFacts): OrderTimeline {
  return orderTimeline({ status: o.status, sent_at: o.sent_at, seen_by_supplier_at: o.seen_at, supplier_received_at: o.danea_exported_at, contested: o.contested, ...deliveryTimelineFacts(o.progress) });
}

/** Which tab a supplier order belongs to (besides «Tutti»). Cancelled orders only in «Tutti». */
export function sellerOrderGroup(o: SellerOrderFacts, t = sellerOrderTimeline(o)): Exclude<SellerOrderFilter, 'tutti'> | null {
  if (o.status === 'annullato') return null;
  const key = t.steps.find((s) => s.current)?.key;
  if (o.status === 'consegnato' || o.status === 'chiuso' || key === 'consegnato' || key === 'completato') return 'consegnati';
  if (o.status === 'parzialmente_consegnato' || key === 'in_consegna') return 'in_consegna';
  return 'da_lavorare';
}
export function matchesSellerFilter(o: SellerOrderFacts, f: SellerOrderFilter, t = sellerOrderTimeline(o)): boolean {
  return f === 'tutti' || sellerOrderGroup(o, t) === f;
}
export function initialSellerFilter(orders: SellerOrderFacts[]): SellerOrderFilter {
  if (orders.some((o) => matchesSellerFilter(o, 'da_lavorare'))) return 'da_lavorare';
  if (orders.some((o) => matchesSellerFilter(o, 'in_consegna'))) return 'in_consegna';
  return 'tutti';
}
/** Customer-side ordering: work first, then in delivery, delivered/cancelled last; nearest delivery first. */
export function sortSellerOrders<T extends SellerOrderFacts>(orders: T[]): T[] {
  return orders.map((o) => {
    const t = sellerOrderTimeline(o);
    const lo = { status: o.status, send_status: 'inviato', delivery_date: o.delivery_date, created_at: o.created_at };
    return { item: o, o: lo, rank: orderStageRank(lo, t, o.status === 'annullato') };
  }).sort(compareOrderStage).map((x) => x.item);
}

/** Presentation only: never derives receipt quantities or writes order state. */
export type OrderListFacts = { status: string; send_status: string; delivery_date: string | null; created_at: string };
export type OrderListFilter = 'da_inviare' | 'in_arrivo' | 'ricevuti' | 'tutti' | 'acquisti_diretti';
export function isAwaitingGoods(o: OrderListFacts): boolean {
  return o.send_status === 'inviato' && (o.status === 'inviato' || o.status === 'parzialmente_consegnato');
}
export function matchesOrderListFilter(o: OrderListFacts, filter: OrderListFilter, cancelled = false): boolean {
  if (filter === 'tutti') return true;
  if (filter === 'acquisti_diretti') return false;
  if (cancelled || o.status === 'annullato') return false;
  if (filter === 'in_arrivo') return isAwaitingGoods(o);
  if (filter === 'ricevuti') return o.status === 'consegnato' || o.status === 'chiuso';
  return o.send_status === 'da_inviare' || o.send_status === 'errore_invio';
}
export function compareOrderList(a: OrderListFacts, b: OrderListFacts): number {
  const cancelled = Number(a.status === 'annullato') - Number(b.status === 'annullato');
  if (cancelled) return cancelled;
  const pending = Number(isAwaitingGoods(b)) - Number(isAwaitingGoods(a));
  if (pending) return pending;
  return (a.delivery_date ?? '9999-12-31').localeCompare(b.delivery_date ?? '9999-12-31') || b.created_at.localeCompare(a.created_at);
}
export function orderMainAction(o: OrderListFacts, cancelled = false): string {
  if (cancelled) return 'Visualizza';
  if (o.status === 'bozza') return 'Invia';
  if (o.status === 'inviato') return 'Registra arrivo merce';
  if (o.status === 'parzialmente_consegnato') return 'Continua ricezione';
  return 'Visualizza';
}
export function orderStateDot(o: OrderListFacts, cancelled = false): string {
  if (cancelled || o.status === 'annullato') return 'bg-muted-foreground';
  if (o.send_status === 'errore_invio') return 'bg-destructive';
  if (o.status === 'parzialmente_consegnato') return 'bg-warning';
  if (o.status === 'consegnato' || o.status === 'chiuso') return 'bg-success';
  if (o.status === 'inviato') return 'bg-chart-2';
  return 'bg-muted-foreground';
}
/** Direct purchases (AD) stay separate documents: shown only in «Tutti» and «Acquisti diretti». */
export function showsDirectPurchases(filter: OrderListFilter): boolean {
  return filter === 'tutti' || filter === 'acquisti_diretti';
}
export function compareDirectPurchases(a: { status: string; purchase_date: string | null; created_at: string }, b: { status: string; purchase_date: string | null; created_at: string }): number {
  const cancelled = Number(a.status === 'annullato') - Number(b.status === 'annullato');
  return cancelled || (b.purchase_date ?? b.created_at).localeCompare(a.purchase_date ?? a.created_at);
}

/** Facts for the 7-step timeline. Steps 4-6 have no source yet: always absent today. */
export type OrderTimelineFacts = {
  status: string;
  sent_at: string | null;
  seen_by_supplier_at: string | null;
  supplier_received_at: string | null;
  prepared_at?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  contested?: boolean;
  not_delivered?: boolean;
};
export type TimelineStep = { key: string; label: string; color: string; reachedAt: string | null; reached: boolean; current: boolean };
export type OrderTimeline = { steps: TimelineStep[]; currentLabel: string; currentColor: string; contested: boolean; notDelivered: boolean };
const STEP_DEFS = [
  ['inviato', 'Inviato', 'bg-chart-1'],
  ['visto', 'Visto dal fornitore', 'bg-chart-2'],
  ['ricevuto', 'In lavorazione', 'bg-chart-3'],
  ['preparato', 'Pronto per la consegna', 'bg-chart-4'],
  ['in_consegna', 'In consegna', 'bg-chart-5'],
  ['consegnato', 'Consegnato', 'bg-primary'],
  ['completato', 'Completato', 'bg-success'],
] as const;
export function orderTimeline(f: OrderTimelineFacts): OrderTimeline {
  const done = f.status === 'consegnato' || f.status === 'chiuso';
  const facts: (string | null | undefined | true)[] = [f.sent_at, f.seen_by_supplier_at, f.supplier_received_at, f.prepared_at, f.shipped_at, f.delivered_at, done ? true : null];
  let currentIdx = -1;
  facts.forEach((v, i) => { if (v) currentIdx = i; });
  const steps = STEP_DEFS.map(([key, label, color], i) => {
    const v = facts[i];
    return { key, label, color: v ? color : 'bg-muted', reachedAt: typeof v === 'string' ? v : null, reached: Boolean(v), current: i === currentIdx };
  });
  const contested = Boolean(f.contested);
  let currentLabel = currentIdx === 1 ? 'Inviato' : currentIdx >= 0 ? STEP_DEFS[currentIdx]![1] : 'Da inviare';
  let currentColor = currentIdx >= 0 ? STEP_DEFS[currentIdx]![2] : 'bg-muted-foreground';
  if (f.status === 'annullato') { currentLabel = 'Annullato'; currentColor = 'bg-muted-foreground'; }
  else if (f.status === 'parzialmente_consegnato') { currentLabel = 'Ricevuto in parte'; currentColor = 'bg-warning'; }
  return { steps, currentLabel, currentColor, contested, notDelivered: Boolean(f.not_delivered) && !f.delivered_at };
}

/** Display rank of the unified stage vocabulary (lower first). */
export function orderStageRank(o: OrderListFacts, t: OrderTimeline, cancelled = false): number {
  if (cancelled || o.status === 'annullato') return 9;
  if (o.status === 'chiuso' || o.status === 'consegnato') return 8;
  if (o.send_status === 'da_inviare' || o.send_status === 'errore_invio') return 0;
  const key = t.steps.find((s) => s.current)?.key;
  if (o.status === 'parzialmente_consegnato' || key === 'in_consegna') return 1;
  if (key === 'consegnato') return 1;
  if (key === 'preparato') return 2;
  if (key === 'ricevuto') return 3;
  return 4;
}
export function compareOrderStage(a: { o: OrderListFacts; rank: number }, b: { o: OrderListFacts; rank: number }): number {
  return a.rank - b.rank
    || (a.o.delivery_date ?? '9999-12-31').localeCompare(b.o.delivery_date ?? '9999-12-31')
    || b.o.created_at.localeCompare(a.o.created_at);
}
/** Sent but not delivered, with the expected date already past: never hidden, shown as «In ritardo». */
export function isLateOrder(o: OrderListFacts, today: string, cancelled = false): boolean {
  return !cancelled && isAwaitingGoods(o) && Boolean(o.delivery_date) && o.delivery_date! < today;
}
/** Opening tab: «Da inviare» when something is unsent, otherwise «In arrivo». */
export function initialOrderFilter(orders: { o: OrderListFacts; cancelled: boolean }[]): OrderListFilter {
  return orders.some(({ o, cancelled }) => matchesOrderListFilter(o, 'da_inviare', cancelled)) ? 'da_inviare' : 'in_arrivo';
}
export const ORDER_FILTER_LABELS: Record<OrderListFilter, string> = { da_inviare: 'Da inviare', in_arrivo: 'In arrivo', ricevuti: 'Ricevuti', tutti: 'Tutti', acquisti_diretti: 'Acquisti diretti' };

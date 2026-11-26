/** Presentation only: never derives receipt quantities or writes order state. */
export type OrderListFacts = { status: string; send_status: string; delivery_date: string | null; created_at: string };
export type OrderListFilter = 'tutti' | 'da_inviare' | 'in_attesa' | 'ricevuti' | 'acquisti_diretti';
export function isAwaitingGoods(o: OrderListFacts): boolean {
  return o.send_status === 'inviato' && (o.status === 'inviato' || o.status === 'parzialmente_consegnato');
}
export function matchesOrderListFilter(o: OrderListFacts, filter: OrderListFilter, cancelled = false): boolean {
  if (filter === 'tutti') return true;
  if (filter === 'acquisti_diretti') return false;
  if (cancelled || o.status === 'annullato') return false;
  if (filter === 'in_attesa') return isAwaitingGoods(o);
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

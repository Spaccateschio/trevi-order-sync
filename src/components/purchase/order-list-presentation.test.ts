import { describe, expect, it } from 'vitest';
import { compareOrderList, isAwaitingGoods, matchesOrderListFilter, orderMainAction } from './order-list-presentation';
const order = { status: 'inviato', send_status: 'inviato', delivery_date: '2026-11-27', created_at: '2026-11-26' };
describe('supplier order list presentation', () => {
  it('includes sent orders awaiting goods', () => expect(isAwaitingGoods(order)).toBe(true));
  it('includes partially delivered orders', () => expect(isAwaitingGoods({...order, status:'parzialmente_consegnato'})).toBe(true));
  it('excludes drafts, received and closed orders', () => {
    for (const status of ['bozza','consegnato','chiuso','annullato']) expect(isAwaitingGoods({...order,status})).toBe(false);
  });
  it('received includes delivered and closed only', () => {
    expect(matchesOrderListFilter({...order,status:'consegnato'},'ricevuti')).toBe(true);
    expect(matchesOrderListFilter({...order,status:'chiuso'},'ricevuti')).toBe(true);
    expect(matchesOrderListFilter(order,'ricevuti')).toBe(false);
  });
  it('unsent filter includes send errors', () => expect(matchesOrderListFilter({...order,send_status:'errore_invio'},'da_inviare')).toBe(true));
  it('cancelled drafts remain only in all orders', () => {
    expect(matchesOrderListFilter({...order,status:'bozza',send_status:'da_inviare'},'da_inviare',true)).toBe(false);
    expect(matchesOrderListFilter(order,'tutti',true)).toBe(true);
    expect(orderMainAction({...order,status:'bozza'},true)).toBe('Visualizza');
  });
  it('pending orders precede older drafts', () => expect(compareOrderList(order,{...order,status:'bozza',delivery_date:'2026-10-01'})).toBeLessThan(0));
  it('pending orders sort by delivery date', () => expect(compareOrderList(order,{...order,delivery_date:'2026-11-28'})).toBeLessThan(0));
  it('ties sort newest creation first', () => expect(compareOrderList(order,{...order,created_at:'2026-11-25'})).toBeLessThan(0));
});

import { showsDirectPurchases as _show } from './order-list-presentation';
import { matchesOrderListFilter as _match } from './order-list-presentation';
import { describe as _d, it as _it, expect as _e } from 'vitest';
_d('acquisti diretti nella lista', () => {
  _it('compaiono solo in Tutti e Acquisti diretti', () => {
    _e(_show('tutti')).toBe(true); _e(_show('acquisti_diretti')).toBe(true); _e(_show('in_attesa')).toBe(false);
  });
  _it('il filtro Acquisti diretti esclude gli ordini', () => {
    _e(_match({ status: 'inviato', send_status: 'inviato', delivery_date: null, created_at: '' }, 'acquisti_diretti')).toBe(false);
  });
});

import { orderTimeline } from './order-list-presentation';
describe('orderTimeline', () => {
  const base = { status: 'inviato', sent_at: '2026-11-25T10:00:00Z', seen_by_supplier_at: null, supplier_received_at: null };
  it('only sent', () => { const t = orderTimeline(base); expect(t.currentLabel).toBe('Inviato'); expect(t.steps.filter(s => s.reached).length).toBe(1); });
  it('seen', () => expect(orderTimeline({ ...base, seen_by_supplier_at: '2026-11-25T11:00:00Z' }).currentLabel).toBe('Visto dal fornitore'));
  it('received by supplier', () => { const t = orderTimeline({ ...base, seen_by_supplier_at: 'x', supplier_received_at: '2026-11-25T12:00:00Z' }); expect(t.currentLabel).toBe('Ordine ricevuto'); expect(t.steps[2]?.reachedAt).toBe('2026-11-25T12:00:00Z'); });
  it('delivered or closed reach step 7', () => { for (const status of ['consegnato', 'chiuso']) { const t = orderTimeline({ ...base, status }); expect(t.currentLabel).toBe('Completato'); expect(t.steps[6]?.current).toBe(true); } });
  it('partial shows received in part, step 7 not reached', () => { const t = orderTimeline({ ...base, status: 'parzialmente_consegnato' }); expect(t.currentLabel).toBe('Ricevuto in parte'); expect(t.steps[6]?.reached).toBe(false); });
  it('steps 4-6 stay grey today', () => { const t = orderTimeline({ ...base, status: 'chiuso', seen_by_supplier_at: 'x', supplier_received_at: 'y' }); for (const i of [3, 4, 5]) { expect(t.steps[i]?.reached).toBe(false); expect(t.steps[i]?.color).toBe('bg-muted'); } });
  it('open dispute flags contested', () => expect(orderTimeline({ ...base, contested: true }).contested).toBe(true));
  it('requeued order switches step 3 off', () => expect(orderTimeline({ ...base, seen_by_supplier_at: 'x', supplier_received_at: null }).steps[2]?.reached).toBe(false));
  it('each step has a distinct colour', () => { const t = orderTimeline({ status: 'chiuso', sent_at: 'a', seen_by_supplier_at: 'b', supplier_received_at: 'c', prepared_at: 'd', shipped_at: 'e', delivered_at: 'f' }); expect(new Set(t.steps.map(s => s.color)).size).toBe(7); });
});

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

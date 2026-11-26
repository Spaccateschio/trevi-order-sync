import { describe, expect, it } from 'vitest';
import { confirmUntouched, initialReceiveDraft, receivePayload, receiveSummary, receiveLineColumns, type ReceiveLine } from './receive-outcomes';

const line: ReceiveLine = { key: 'a', orderItemId: 'a', deliveryItemId: null, productId: 'p', code: 'A', name: 'Aglio', version: 'v', ordered: 10, baseline: 10, unitCode: 'kg', stockUnitCode: 'kg', sameUnit: true, declaredStock: null, declaredPurchase: null, lineType: 'ordinata', producer: null, lot: null, expiry: null, unitCost: null, priceUnitCode: null, priceUnitId: null, verifiedStock: null, priceQuantity: null };
describe('ricezione unica', () => {
  it('Conferma tutte tocca solo righe non lavorate', () => {
    const partial = { ...initialReceiveDraft(line), outcome: 'parziale' as const, quantity: '4' };
    const lines = [line, { ...line, key: 'b' }];
    const result = confirmUntouched(lines, { a: partial });
    expect(result['a']).toEqual(partial);
    expect(result['b']?.outcome).toBe('ok');
  });
  it('OK registra 10 kg dichiarati e verificati distinti', () => {
    const payload = receivePayload(line, { ...initialReceiveDraft(line), outcome: 'ok' }, false);
    expect(payload.declared_stock_quantity).toBe(10); expect(payload.verified_quantity).toBe(10);
  });
  it('Parziale registra solo 4 dei 10 kg', () => {
    const payload = receivePayload(line, { ...initialReceiveDraft(line), outcome: 'parziale', quantity: '4' }, false);
    expect(payload.arrived_quantity).toBe(4); expect(payload.verified_quantity).toBe(4);
  });
  it('Mancante è zero con motivo, non un carico', () => {
    const payload = receivePayload(line, { ...initialReceiveDraft(line), outcome: 'mancante', missingReason: 'Arriva domani' }, false);
    expect(payload.verified_quantity).toBe(0); expect(payload.missing_reason).toBe('Arriva domani');
  });
  it('Danneggiato distingue 10 arrivati e 7 buoni con motivo qualità', () => {
    const payload = receivePayload(line, { ...initialReceiveDraft(line), outcome: 'danneggiato', goodQuantity: '7' }, false);
    expect(payload.declared_stock_quantity).toBe(10); expect(payload.verified_quantity).toBe(7); expect(payload.reason).toBe('qualita');
  });
  it('non sovrascrive il dichiarato del fornitore quando arrivano solo 4 kg', () => {
    const payload = receivePayload({ ...line, declaredStock: 10 }, { ...initialReceiveDraft(line), outcome: 'parziale', quantity: '4' }, true);
    expect(payload.declared_stock_quantity).toBe(10); expect(payload.verified_quantity).toBe(4);
  });
  it('senza conversione non scambia due casse per due kg', () => {
    const crates = { ...line, unitCode: 'casse', sameUnit: false, baseline: 2 };
    expect(() => receivePayload(crates, { ...initialReceiveDraft(crates), outcome: 'ok' }, false)).toThrow();
    const payload = receivePayload(crates, { ...initialReceiveDraft(crates), outcome: 'ok', stockQuantity: '13,4' }, false);
    expect(payload.quantity).toBe(2); expect(payload.verified_quantity).toBe(13.4);
  });
  it('impedisce di confermare una riga senza esito', () => expect(() => receivePayload(line, initialReceiveDraft(line), false)).toThrow('esito'));
  it('riepiloga ogni esito senza confondere i mancanti con gli OK', () => {
    const summary = receiveSummary([line, { ...line, key: 'b' }], { a: { ...initialReceiveDraft(line), outcome: 'mancante' } });
    expect(summary).toEqual({ ok: 0, parziale: 0, mancante: 1, danneggiato: 0, untouched: 1 });
  });
  it('non produce un costo se manca la quantità nella U.M. prezzo diversa', () => {
    const payload = receivePayload(line, { ...initialReceiveDraft(line), outcome: 'ok', unitCost: '3', priceUnitCode: 'cassa' }, false);
    expect(payload.price_quantity).toBeNull();
  });
  it('trasmette la versione del carico in bozza per non sovrascriverlo', () => {
    const existing = { ...line, receiptId: 'receipt', receiptItemId: 'item', receiptVersion: '2026-11-26T08:00:00Z', receiptItemVersion: '2026-11-26T08:01:00Z' };
    const payload = receivePayload(existing, { ...initialReceiveDraft(existing), outcome: 'ok' }, true);
    expect(payload.receipt_item_version).toBe('2026-11-26T08:01:00Z');
    expect(payload.receipt_version).toBe('2026-11-26T08:00:00Z');
  });
});
describe('receiveLineColumns', () => {
  it('mostra ordinato e dichiarato con le loro unità', () => {
    const c = receiveLineColumns({ ...line, ordered: 2, orderedUnitCode: 'pz', unitCode: 'kg', stockUnitCode: 'cs', sameUnit: false, declaredPurchase: 0.2, declaredStock: 1 });
    expect(c.ordered).toBe('2 pz');
    expect(c.arrived).toBe('0,2 kg');
    expect(c.arrivedStock).toBe('1 cs');
  });
  it('senza dichiarazione arrivato è assente', () => {
    expect(receiveLineColumns(line).arrived).toBeNull();
  });
  it('senza prezzo non mostra nulla', () => {
    expect(receiveLineColumns(line).price).toBeNull();
  });
  it('prezzo con la sua unità', () => {
    expect(receiveLineColumns({ ...line, unitCost: 3.5, priceUnitCode: 'kg' }).price).toMatch(/3,50.*€ \/ kg/);
  });
});

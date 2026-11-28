import { describe, expect, it } from 'vitest';
import { confirmUntouched, initialReceiveDraft, receivePayload, receiveSummary, receiveLineColumns, chooseReceiveOutcome, canReceiveExcess, type ReceiveLine } from './receive-outcomes';

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
    expect(summary).toEqual({ ok: 0, parziale: 0, mancante: 1, danneggiato: 0, eccedenza: 0, untouched: 1 });
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

const excessLine: ReceiveLine = { ...line, ordered: 1, baseline: 1, incassi: { status: 'eccedenza', documentId: 'd1', docNumber: '42', qty: 1.55, unit: 'kg', price: 3.5, reason: null } };
describe('eccedenza DDT kg', () => {
  it('eccedenza esplicita carica 1,55 kg con prezzo DDT e documento', () => {
    const p = receivePayload(excessLine, { ...initialReceiveDraft(excessLine), outcome: 'eccedenza', unitCost: '99' }, false);
    expect(p.quantity).toBe(1.55); expect(p.verified_quantity).toBe(1.55); expect(p.declared_stock_quantity).toBe(1.55);
    expect(p.unit_cost).toBe(3.5); expect(p.price_quantity).toBe(1.55); expect(p.price_unit_code).toBe('kg'); expect(p.excess_confirmed).toBe(true); expect(p.ddt_document_id).toBe('d1');
  });
  it('OK resta 1 kg esatto', () => { const p = receivePayload(excessLine, { ...initialReceiveDraft(excessLine), outcome: 'ok' }, false); expect(p.quantity).toBe(1); expect(p.excess_confirmed).toBe(false); });
  it('bozza iniziale preimpostata come eccedenza con qty e prezzo DDT', () => { const d = initialReceiveDraft(excessLine); expect(d.outcome).toBe('eccedenza'); expect(d.quantity).toBe('1.55'); expect(d.unitCost).toBe('3.5'); expect(d.priceUnitCode).toBe('kg'); expect(d.priceQuantity).toBe('1.55'); });
  it('con consegna dichiarata la bozza non è preimpostata', () => expect(initialReceiveDraft(excessLine, true).outcome).toBeNull());
  it('pz, unità diverse e righe non abbinate restano da verificare', () => { for (const l of [{ ...excessLine, unitCode: 'pz', stockUnitCode: 'pz' }, { ...excessLine, stockUnitCode: 'cs', sameUnit: false }, { ...excessLine, incassi: { ...excessLine.incassi!, status: 'da_controllare' as const } }]) expect(initialReceiveDraft(l).outcome).toBeNull(); });
  it('conferma collettiva conserva l’eccedenza e mette OK alle altre', () => { const other = { ...line, key: 'b' }; const r = confirmUntouched([excessLine, other], {}); expect(r['a']?.outcome).toBe('eccedenza'); expect(r['b']?.outcome).toBe('ok'); const p = receivePayload(excessLine, r['a']!, false); expect(p.quantity).toBe(1.55); });
  it('riepilogo conta l’eccedenza senza click', () => expect(receiveSummary([excessLine], {})).toMatchObject({ eccedenza: 1, untouched: 0 }));
  it('payload senza click include conferma e documento DDT', () => { const p = receivePayload(excessLine, initialReceiveDraft(excessLine), false); expect(p.excess_confirmed).toBe(true); expect(p.ddt_document_id).toBe('d1'); });
  it('pz non possono usare eccedenza', () => { const l = { ...excessLine, unitCode: 'pz', stockUnitCode: 'pz' }; expect(canReceiveExcess(l)).toBe(false); expect(() => receivePayload(l, { ...initialReceiveDraft(l), outcome: 'eccedenza', quantity: '2' }, false)).toThrow('eccedenza'); });
  it('unità diverse non possono usare eccedenza', () => expect(canReceiveExcess({ ...excessLine, stockUnitCode: 'cs', sameUnit: false })).toBe(false));
  it('dichiarazione fornitore resta invariata', () => { expect(canReceiveExcess(excessLine, true)).toBe(false); expect(canReceiveExcess({ ...excessLine, deliveryItemId: 'd' })).toBe(false); expect(() => receivePayload(excessLine, { ...initialReceiveDraft(excessLine), outcome: 'eccedenza' }, true)).toThrow('eccedenza'); });
  it('1,60 kg sopra DDT 1,55 è rifiutato', () => expect(() => receivePayload(excessLine, { ...initialReceiveDraft(excessLine), outcome: 'eccedenza', quantity: '1.60' }, false)).toThrow('eccedenza'));
  it('eccedenza pari all’ordinato è rifiutata', () => expect(() => receivePayload(excessLine, { ...initialReceiveDraft(excessLine), outcome: 'eccedenza', quantity: '1' }, false)).toThrow('eccedenza'));
});

describe('cambio esito dopo eccedenza', () => {
  it('ritorno a OK ripristina 1 kg anche per la quantità prezzo', () => {
    const l = { ...excessLine, priceUnitCode: 'kg' };
    const d = chooseReceiveOutcome(l, { ...initialReceiveDraft(l), outcome: 'eccedenza', priceQuantity: '1.55' }, 'ok');
    const p = receivePayload(l, d, false);
    expect(p.quantity).toBe(1); expect(p.price_quantity).toBe(1); expect(p.unit_cost).toBe(3.5);
  });
  it('1,20 kg confermati entro il DDT usano 1,20 come quantità prezzo', () => {
    const p = receivePayload(excessLine, { ...initialReceiveDraft(excessLine), outcome: 'eccedenza', quantity: '1.20' }, false);
    expect(p.verified_quantity).toBe(1.2); expect(p.price_quantity).toBe(1.2); expect(p.unit_cost).toBe(3.5);
  });
});

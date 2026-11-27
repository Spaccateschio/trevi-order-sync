import { describe, expect, it } from 'vitest';
import { deliveryTimelineFacts, extractOrderRef, mergeDocument, normalizeIncassiUnit, resolveDocType, normalizeLines, resolveOrderLink } from './incassi-link';
import { orderTimeline } from '../../components/purchase/order-list-presentation';

describe('collegamento', () => {
  const one = [{ order_id: 'o1', buyer_company_id: 'b1' }];
  it('un solo ordine → collegato', () => expect(resolveOrderLink('C1', 'ORD-2026-00026', one)).toMatchObject({ status: 'collegato', orderId: 'o1' }));
  it('nessun ordine', () => expect(resolveOrderLink('C1', 'ORD-2026-00026', []).reason).toBe('nessun_ordine'));
  it('più ordini', () => expect(resolveOrderLink('C1', 'ORD-2026-00001', [...one, { order_id: 'o2', buyer_company_id: 'b2' }]).reason).toBe('più_ordini'));
  it('codice cliente obbligatorio anche se l\'ORD esiste', () => expect(resolveOrderLink(' ', 'ORD-2026-00001', one).reason).toBe('codice_cliente_mancante'));
  it('nessun ORD nelle note', () => expect(extractOrderRef('consegna mattina')).toBeNull());
  it('due ORD diversi nelle note', () => expect(extractOrderRef('ORD-2026-00001 e ORD-2026-00002')).toBeNull());
  it('ORD ripetuto uguale', () => expect(extractOrderRef('rif ord-2026-00026, ORD-2026-00026')).toBe('ORD-2026-00026'));
});

describe('unità', () => {
  it('pz e pezzo uguali', () => expect([normalizeIncassiUnit('pezzo'), normalizeIncassiUnit('PZ')]).toEqual(['pz', 'pz']));
  it('vuota o sconosciuta da controllare', () => {
    expect(normalizeIncassiUnit('')).toBeNull();
    expect(normalizeLines([{ qty: 1, um: 'casse' }])[0]!.needs_review).toBe(true);
  });
});

describe('idempotenza', () => {
  const doc = { doc_type: 'ddt' as const, doc_number: '1', prepared_at: '2026-11-26T07:00:00Z', lines: normalizeLines([{ code: 'A', qty: 2, um: 'kg' }]) };
  it('stesso documento due volte = stesso risultato', () => {
    const a = mergeDocument(null, doc);
    expect(mergeDocument(a, doc)).toEqual(a);
  });
  it('aggiornamento non cancella valori salvati', () => {
    const a = mergeDocument(null, doc);
    const b = mergeDocument(a, { doc_type: 'ddt', in_carico_at: '2026-11-26T09:00:00Z', prepared_at: null });
    expect(b.prepared_at).toBe('2026-11-26T07:00:00Z');
    expect(b.in_carico_at).toBe('2026-11-26T09:00:00Z');
    expect(b.lines).toHaveLength(1);
  });
});

describe('passi 4-6', () => {
  const base = { status: 'inviato', sent_at: 'x', seen_by_supplier_at: 'x', supplier_received_at: 'x' };
  it('accesi dal documento', () => {
    const t = orderTimeline({ ...base, ...deliveryTimelineFacts({ prepared_at: 'p', in_carico_at: 'c', consegna_stato: 'consegnato', consegna_at: 'd' }) });
    expect(t.steps.slice(3, 6).map((s) => s.reachedAt)).toEqual(['p', 'c', 'd']);
  });
  it('non_consegnato non accende il 6', () => {
    const t = orderTimeline({ ...base, ...deliveryTimelineFacts({ prepared_at: 'p', in_carico_at: 'c', consegna_stato: 'non_consegnato', consegna_at: 'd' }) });
    expect(t.steps[5]!.reached).toBe(false);
    expect(t.notDelivered).toBe(true);
  });
  it('senza documento tutto grigio', () => {
    const t = orderTimeline({ ...base, ...deliveryTimelineFacts(null) });
    expect(t.steps.slice(3, 6).every((s) => !s.reached)).toBe(true);
  });
});

describe('aggiornamenti parziali', () => {
  const saved = mergeDocument(null, { doc_type: 'ddt', doc_number: '16724', customer_code: 'C1', notes_raw: 'ORD-2026-00026', prepared_at: '2026-11-26T07:00:00Z', lines: normalizeLines([{ code: 'A', qty: 2, um: 'kg' }]) });
  it('senza doc_type su documento esistente: usa quello salvato', () => expect(resolveDocType(saved, undefined)).toBe('ddt'));
  it('senza doc_type su documento nuovo: rifiutato', () => expect(resolveDocType(null, undefined)).toBeNull());
  it('solo consegna: gli altri campi restano', () => {
    const m = mergeDocument(saved, { doc_type: resolveDocType(saved, undefined)!, consegna_stato: 'consegnato', consegna_at: '2026-11-27T08:00:00Z', lines: [] });
    expect(m).toEqual({ ...saved, consegna_stato: 'consegnato', consegna_at: '2026-11-27T08:00:00Z' });
  });
});

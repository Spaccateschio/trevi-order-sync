import { describe, expect, it } from 'vitest';
import { initialSellerFilter, sellerOrderGroup, sellerOrderTimeline, sortSellerOrders, type SellerOrderFacts } from './received-order-presentation';

const b: SellerOrderFacts = { status: 'inviato', sent_at: 's', seen_at: null, danea_exported_at: null, delivery_date: '2026-11-28', created_at: '2026-11-27', contested: false };

describe('stato unico lato fornitore', () => {
  it('appena ricevuto è «Inviato», non «Ricevuto»', () => {
    expect(sellerOrderTimeline(b).currentLabel).toBe('Inviato');
    expect(sellerOrderTimeline({ ...b, seen_at: 'v' }).currentLabel).toBe('Inviato');
  });
  it('Scaricato da Danea porta a «In lavorazione», resta badge separato', () => {
    expect(sellerOrderTimeline({ ...b, danea_exported_at: 'd' }).currentLabel).toBe('In lavorazione');
  });
  it('passi 4–6 da Incassi', () => {
    const p = { prepared_at: 'p', in_carico_at: null, consegna_stato: null, consegna_at: null };
    expect(sellerOrderTimeline({ ...b, progress: p }).currentLabel).toBe('Pronto per la consegna');
    expect(sellerOrderGroup({ ...b, progress: { ...p, in_carico_at: 'c' } })).toBe('in_consegna');
    expect(sellerOrderGroup({ ...b, progress: { ...p, in_carico_at: 'c', consegna_stato: 'consegnato', consegna_at: 'x' } })).toBe('consegnati');
  });
  it('contestato è badge aggiuntivo, non cambia scheda', () => {
    const t = sellerOrderTimeline({ ...b, contested: true });
    expect(t.contested).toBe(true);
    expect(sellerOrderGroup({ ...b, contested: true })).toBe('da_lavorare');
  });
  it('annullato solo in Tutti; completato in Consegnati', () => {
    expect(sellerOrderTimeline({ ...b, status: 'annullato' }).currentLabel).toBe('Annullato');
    expect(sellerOrderGroup({ ...b, status: 'annullato' })).toBeNull();
    expect(sellerOrderGroup({ ...b, status: 'chiuso' })).toBe('consegnati');
  });
  it('scheda iniziale e ordinamento', () => {
    expect(initialSellerFilter([{ ...b, status: 'chiuso' }])).toBe('tutti');
    expect(initialSellerFilter([{ ...b, status: 'chiuso' }, b])).toBe('da_lavorare');
    const s = sortSellerOrders([{ ...b, status: 'annullato', created_at: '1' }, { ...b, status: 'chiuso', created_at: '2' }, { ...b, created_at: '3' }]);
    expect(s.map((o) => o.created_at)).toEqual(['3', '2', '1']);
  });
});

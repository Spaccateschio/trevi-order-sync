import { describe, expect, it } from 'vitest';
import { matchIncassiLines, type IncassiReceiveDoc } from './incassi-receive';

const doc = (lines: IncassiReceiveDoc['lines'], extra: Partial<IncassiReceiveDoc> = {}): IncassiReceiveDoc => ({ id: 'd1', docNumber: '16626', docDate: null, consegnaStato: null, lines, ...extra });
const line = (code: string | null, ordered: number, unit: string) => ({ key: 'k', supplierCode: code, ordered, orderedUnitCode: unit });
const L = (code: string | null, qty: number | null, um: string | null) => ({ code, description: null, qty, um, price: 1.5 });

describe('matchIncassiLines', () => {
  it('pz e pezzo sono la stessa unità', () => expect(matchIncassiLines([line('0225', 2, 'pezzo')], [doc([L('0225', 2, 'pz')])]).byKey['k']?.status).toBe('abbinata'));
  it('unità vuota da controllare', () => expect(matchIncassiLines([line('0225', 2, 'kg')], [doc([L('0225', 2, '')])]).byKey['k']?.status).toBe('da_controllare'));
  it('unità sconosciuta da controllare', () => expect(matchIncassiLines([line('0225', 2, 'kg')], [doc([L('0225', 2, 'zzz')])]).byKey['k']?.status).toBe('da_controllare'));
  it('0,75 pz da controllare', () => expect(matchIncassiLines([line('1766', 1, 'pz')], [doc([L('1766', 0.75, 'pz')])]).byKey['k']?.reason).toBe('Pezzi con decimali'));
  it('1 pz ordinato, 2 sul documento: differenza', () => expect(matchIncassiLines([line('0225', 1, 'pz')], [doc([L('0225', 2, 'pz')])]).byKey['k']?.status).toBe('differenza'));
  it('riga non abbinata mai assegnata a caso', () => {
    const r = matchIncassiLines([line('0225', 1, 'pz')], [doc([L('9999', 1, 'pz')])]);
    expect(r.byKey['k']).toBeUndefined(); expect(r.unmatched).toHaveLength(1);
  });
  it('codice ripetuto da controllare', () => expect(matchIncassiLines([line('0225', 1, 'pz')], [doc([L('0225', 1, 'pz'), L('0225', 1, 'pz')])]).byKey['k']?.status).toBe('da_controllare'));
  it('nessun DDT: nessun abbinamento', () => expect(matchIncassiLines([line('0225', 1, 'pz')], []).byKey).toEqual({}));
  it('più DDT: tutto da controllare', () => expect(matchIncassiLines([line('0225', 1, 'pz')], [doc([L('0225', 1, 'pz')]), doc([L('0225', 1, 'pz')], { id: 'd2' })]).byKey['k']?.status).toBe('da_controllare'));
});

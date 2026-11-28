import { describe, expect, it } from 'vitest';
import { canCreatePhoneOrder, ddtAmount, existingOrderWarning, unmatchedCount, type PendingDdt } from './phone-order-ddt-logic';

const base: PendingDdt = { id: 'd', customerName: 'ALDER', customerCode: '0758', docNumber: '12', docDate: '2026-11-28', existingOrderNumber: null,
  lines: [{ key: '1', code: 'A', description: 'Mele', qty: 2, um: 'kg', price: 1.5, matchedProductId: 'p1' }, { key: '2', code: 'B', description: 'Pere', qty: 3, um: 'pz', price: 1, matchedProductId: 'p2' }] };

describe('ordine telefonico da DDT', () => {
  it('tutte le righe abbinate: creazione consentita', () => expect(canCreatePhoneOrder(base)).toBe(true));
  it('una riga non abbinata blocca la creazione', () => { const d = { ...base, lines: [base.lines[0]!, { ...base.lines[1]!, matchedProductId: null }] }; expect(unmatchedCount(d)).toBe(1); expect(canCreatePhoneOrder(d)).toBe(false); });
  it('riga senza U.M. o quantità blocca', () => expect(canCreatePhoneOrder({ ...base, lines: [{ ...base.lines[0]!, um: '' }] })).toBe(false));
  it('cliente non riconosciuto blocca', () => expect(canCreatePhoneOrder({ ...base, customerName: null })).toBe(false));
  it('ordine esistente per la data: solo avviso, non blocca', () => { const d = { ...base, existingOrderNumber: 'ORD-2026-00012' }; expect(existingOrderWarning(d)).toContain('ORD-2026-00012'); expect(canCreatePhoneOrder(d)).toBe(true); });
  it('importo = somma qty × prezzo DDT', () => expect(ddtAmount(base)).toBe(6));
});

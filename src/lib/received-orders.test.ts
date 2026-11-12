import { describe, expect, it } from 'vitest';
import { isReceivedOrder } from './received-orders';

describe('received orders scope', () => {
  it('excludes own purchases without a B2B seller', () => {
    expect(isReceivedOrder({ status: 'inviato', sellerCompanyId: null }, 'trevi')).toBe(false);
  });
  it('includes orders received by the selected seller', () => {
    expect(isReceivedOrder({ status: 'inviato', sellerCompanyId: 'trevi' }, 'trevi')).toBe(true);
  });
  it('excludes orders belonging to another seller even when readable', () => {
    expect(isReceivedOrder({ status: 'inviato', sellerCompanyId: 'other' }, 'trevi')).toBe(false);
  });
  it('excludes unsent drafts', () => {
    expect(isReceivedOrder({ status: 'bozza', sellerCompanyId: 'trevi' }, 'trevi')).toBe(false);
  });
  it('preserves received cancelled orders for the existing history handling', () => {
    expect(isReceivedOrder({ status: 'annullato', sellerCompanyId: 'trevi' }, 'trevi')).toBe(true);
  });
});
import { describe, expect, it } from 'vitest';
import { supplierLinkPatch } from './supplier-link-patch';

describe('supplier partial save', () => {
  it('preserves absent fields', () => {
    expect(supplierLinkPatch({ supplier_product_code: 'A', manual_cost: 12, notes: 'keep' }, { supplier_product_code: 'B' })).toEqual({ supplier_product_code: 'B' });
  });
  it('does not replay unchanged fields', () => {
    expect(supplierLinkPatch({ supplier_product_code: 'A', manual_cost: 12 }, { supplier_product_code: 'A', manual_cost: 12 })).toEqual({});
  });
  it('allows an explicit clear', () => {
    expect(supplierLinkPatch({ notes: 'old' }, { notes: null })).toEqual({ notes: null });
  });
});
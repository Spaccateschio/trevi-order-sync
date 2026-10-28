import { describe,it,expect } from 'vitest';
import { priceIndicationTotal } from './manual-price-indication';
describe('manual Danea cost basis',()=>{
  it('Avocado: one case approximately 5.5 kg at 2 euro/kg',()=>expect(priceIndicationTotal(1,5.5,2,'kg','kg')).toBe(11));
  it('different Danea and stock units without verified package have no total',()=>expect(priceIndicationTotal(1,1,2,'pezzo','cassa')).toBeNull());
  it('verified package permits conversion to Danea price unit',()=>expect(priceIndicationTotal(2,1,2,'pezzo','cassa',0.0625)).toBe(64));
  it('missing cost has no indication',()=>expect(priceIndicationTotal(1,5.5,null,'kg','kg')).toBeNull());
  it('missing Danea unit has no indication',()=>expect(priceIndicationTotal(1,5.5,2,null,'kg')).toBeNull());
});
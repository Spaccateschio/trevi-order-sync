import {describe,it,expect} from 'vitest';
import {countPackageConversion} from './inventory-package-conversion';
describe('inventory quantities',()=>{
 it('stock unit keeps raw quantity',()=>expect(countPackageConversion(3,'kg','kg',[])).toBe(3));
 it('two 10 kg cases save 20 kg',()=>expect(countPackageConversion(2,'cs','kg',[{unitId:'cs',factor:10,active:true,verifiedStockUnitId:'kg'}])).toBe(20));
 it('no package blocks',()=>expect(countPackageConversion(2,'cs','kg',[])).toBeNull());
 it('stale verification blocks',()=>expect(countPackageConversion(2,'cs','kg',[{unitId:'cs',factor:10,active:true,verifiedStockUnitId:'pz'}])).toBeNull());
 it('ambiguous factors block',()=>expect(countPackageConversion(2,'cs','kg',[{unitId:'cs',factor:16,active:true,verifiedStockUnitId:'kg'},{unitId:'cs',factor:18,active:true,verifiedStockUnitId:'kg'}])).toBeNull());
});
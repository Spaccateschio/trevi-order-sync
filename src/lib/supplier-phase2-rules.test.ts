import {describe,it,expect} from 'vitest';
import {firstSupplierUnit,safeLegacyConversion} from './supplier-phase2-rules';
describe('phase2 supplier unit rules',()=>{
 const unit=(id:string,star:boolean,active=true)=>({id,unit_id:id,is_active:active,is_default:star,created_at:`2026-10-${id}`});
 it('starred unit is first',()=>expect(firstSupplierUnit([unit('01',false),unit('02',true)])).toBe('02'));
 it('without star uses first created active unit',()=>expect(firstSupplierUnit([unit('03',false),unit('01',false,false),unit('02',false)])).toBe('02'));
 it('no active unit is empty',()=>expect(firstSupplierUnit([unit('01',true,false)])).toBeNull());
 it('keeps all eight safe transfer candidates and excludes seven incoherent ones',()=>{
 const candidates=[...Array.from({length:6},()=>({sameUnit:false,factor:5.5,stockCode:'kg',reference:'kg',newConfigured:false})),{sameUnit:false,factor:10,stockCode:'pz',reference:'pz',newConfigured:false},{sameUnit:true,factor:1,stockCode:'cassa',reference:'cassa',newConfigured:false},{sameUnit:true,factor:16,stockCode:'cassa',reference:'cassa',newConfigured:false},{sameUnit:true,factor:10,stockCode:'cassa',reference:'cassa',newConfigured:false},...['nr','mazzo','cassa','vaschetta','nr'].map(reference=>({sameUnit:false,factor:10,stockCode:'mz',reference,newConfigured:false}))];
 expect(candidates.map(safeLegacyConversion).filter(Boolean)).toHaveLength(8);
 expect(candidates.map(safeLegacyConversion).filter(x=>x===null)).toHaveLength(7);
 });
 it('never overwrites an existing configuration',()=>expect(safeLegacyConversion({sameUnit:false,factor:5.5,stockCode:'kg',reference:'kg',newConfigured:true})).toBeNull());
});
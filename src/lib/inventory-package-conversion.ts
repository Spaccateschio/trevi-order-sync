export type CountPackage = {unitId:string;factor:number;active:boolean;verifiedStockUnitId:string|null};
export function countPackageConversion(quantity:number,unitId:string,stockUnitId:string,packages:CountPackage[]):number|null {
  if(unitId===stockUnitId) return quantity;
  const factors=[...new Set(packages.filter(p=>p.unitId===unitId&&p.active&&p.verifiedStockUnitId===stockUnitId&&p.factor>0).map(p=>p.factor))];
  const factor=factors[0];
  return factors.length===1&&factor!==undefined?Math.round(quantity*factor*1000)/1000:null;
}
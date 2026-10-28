export type ManualPriceIndication = { cost:number; price_unit_code:string; price_quantity:number|null; total:number|null; estimated:boolean };

export function manualPriceLabel(indication:ManualPriceIndication|null|undefined):string {
  if(!indication) return '';
  const money=(n:number)=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n);
  const base=`Costo Danea ${money(indication.cost)} / ${indication.price_unit_code}`;
  if(indication.total==null||indication.price_quantity==null) return base;
  return `${base} · ${indication.estimated?'≈ ':''}${indication.price_quantity.toLocaleString('it-IT')} ${indication.price_unit_code} × ${money(indication.cost)} = ${indication.estimated?'≈ ':''}${money(indication.total)}`;
}

export function priceIndicationTotal(quantity:number, factor:number|null, cost:number|null, daneaUnit:string|null, stockUnit:string|null, verifiedPricePackageFactor:number|null = null):number|null {
  if(cost==null||!daneaUnit?.trim()||!stockUnit?.trim()||factor==null) return null;
  const same=daneaUnit.trim().toLowerCase()===stockUnit.trim().toLowerCase();
  const basis=same?1:verifiedPricePackageFactor;
  return basis!=null&&basis>0?Math.round(quantity*factor/basis*cost*100)/100:null;
}
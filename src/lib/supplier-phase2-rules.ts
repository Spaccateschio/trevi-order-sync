export function firstSupplierUnit<T extends {id:string;unit_id:string;is_active:boolean;is_default:boolean;created_at:string}>(units:T[]):string|null {
 return units.filter(u=>u.is_active).sort((a,b)=>Number(b.is_default)-Number(a.is_default)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id))[0]?.unit_id??null;
}
export function safeLegacyConversion({sameUnit,factor,stockCode,reference,newConfigured}:{sameUnit:boolean;factor:number|null;stockCode:string;reference:string|null;newConfigured:boolean}):'variabile'|'fissa'|null {
 if(newConfigured||factor==null||factor<=0) return null;
 if(!(sameUnit&&factor===1)&&!( !sameUnit&&reference?.trim().toLowerCase()===stockCode.trim().toLowerCase())) return null;
 return stockCode.trim().toLowerCase()==='kg'?'variabile':'fissa';
}
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ProductPurchaseUnit = { unit_id: string; is_default: boolean };
export type ProductPurchaseUnitCode = ProductPurchaseUnit & { product_id: string; units_of_measure: { code: string; status: string; usage: string } | null };
export type PurchaseCompanyUnit = { id: string; company_id?: string; status: string; usage?: string | null };

/** Shared availability; existing reference configuration and seller-controlled B2B stay intact. */
export function sharedPurchaseUnitChoices<T extends { unit_id: string; code: string; is_default: boolean; is_active: boolean }>(
  assigned: T[], own: ProductPurchaseUnitCode[], productId: string, isB2B: boolean,
): (T | { unit_id: string; code: string; is_default: boolean; is_active: boolean })[] {
  const active = assigned.filter((u) => u.is_active);
  if (isB2B) return active;
  const added = own.filter((u) => u.product_id === productId && u.units_of_measure?.status === "attivo"
    && ["acquisto", "entrambi"].includes(u.units_of_measure.usage)
    && !active.some((a) => a.unit_id === u.unit_id))
    .map((u) => ({ unit_id: u.unit_id, code: u.units_of_measure?.code ?? "", is_default: u.is_default, is_active: true }));
  return [...active, ...added];
}

/** Proposta per un nuovo acquisto, mai sostituzione di quantità/U.M. già scelte. */
export function productPurchaseDefault(units: ProductPurchaseUnitCode[], productId: string) {
  const preferred = units.find((u) => u.product_id === productId && u.is_default && u.units_of_measure?.code);
  return preferred?.units_of_measure ? { unitId: preferred.unit_id, code: preferred.units_of_measure.code } : null;
}

/**
 * Fornitori non B2B: se il prodotto ha U.M. d'acquisto (tab Acquisto) si usano SOLO quelle,
 * riusando la conversione della referenza quando è la stessa U.M. (mai inventata).
 * Senza U.M. del prodotto restano quelle della referenza. B2B: solo U.M. del venditore.
 */
export function mergeManualPurchaseUnits<T extends { unitId: string; code: string; conversionFactor: number | null; conversionType: string | null; isDefault?: boolean }>(
  supplierUnits: T[], ownUnits: ProductPurchaseUnitCode[], productId: string, isB2B: boolean,
) {
  if (isB2B) return supplierUnits;
  const mine = ownUnits.filter((u) => u.product_id === productId && u.units_of_measure);
  if (mine.length === 0) return supplierUnits;
  return mine.map((u) => {
    const same = supplierUnits.find((s) => s.unitId === u.unit_id);
    return same
      ? { ...same, isDefault: u.is_default }
      : ({ unitId: u.unit_id, code: u.units_of_measure?.code ?? "", conversionFactor: null, conversionType: null, isDefault: u.is_default } as unknown as T);
  });
}

/** Link non B2B le cui U.M. vanno sostituite da quelle del prodotto (quando il prodotto ne ha). */
export function productUnitsReplaceLinkUnits(ownUnits: ProductPurchaseUnitCode[], productId: string) {
  return ownUnits.some((u) => u.product_id === productId && u.units_of_measure);
}

export function addProductPurchaseUnit(value: { ids: string[]; defaultId: string | null }, unitId: string) {
  if (value.ids.includes(unitId)) return value;
  return { ids: [...value.ids, unitId], defaultId: value.ids.length === 0 ? unitId : value.defaultId };
}

export function allowedPurchaseUnits<T extends PurchaseCompanyUnit>(units: T[], companyId: string): T[] {
  return units.filter((u) => (!u.company_id || u.company_id === companyId) && u.status === "attivo" && (u.usage === "acquisto" || u.usage === "entrambi"));
}

export function validatePurchaseSelection(units: PurchaseCompanyUnit[], companyId: string, ids: string[], defaultId: string | null) {
  const allowed = new Set(allowedPurchaseUnits(units, companyId).map((u) => u.id));
  if (ids.some((id) => !allowed.has(id))) throw new Error("Scegli solo U.M. aziendali attive per acquisto");
  if (defaultId && !ids.includes(defaultId)) throw new Error("La predefinita deve essere tra le U.M. scelte");
  return [...new Set(ids)];
}

export function productPurchaseUnitsOptions(companyId: string, productId: string) {
  return queryOptions({
    queryKey: ["product-purchase-units", companyId, productId],
    queryFn: async (): Promise<ProductPurchaseUnit[]> => {
      const { data, error } = await supabase.from("product_purchase_units").select("unit_id, is_default").eq("company_id", companyId).eq("product_id", productId);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function companyProductPurchaseUnitsOptions(companyId: string) {
  return queryOptions({
    queryKey: ["product-purchase-units", companyId, "all"],
    queryFn: async (): Promise<ProductPurchaseUnitCode[]> => {
      const { data, error } = await supabase.from("product_purchase_units").select("product_id, unit_id, is_default, units_of_measure(code, status, usage)").eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return (data ?? []).filter((u) => u.units_of_measure?.status === "attivo" && (u.units_of_measure.usage === "acquisto" || u.units_of_measure.usage === "entrambi"));
    },
  });
}
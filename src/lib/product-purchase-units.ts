import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ProductPurchaseUnit = { unit_id: string; is_default: boolean };
export type PurchaseCompanyUnit = { id: string; company_id?: string; status: string; usage?: string | null };

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
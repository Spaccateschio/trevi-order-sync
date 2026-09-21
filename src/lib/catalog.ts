import { supabase } from "@/integrations/supabase/client";

export type CatalogSaleUnit = {
  id: string;
  is_default: boolean;
  conversion_factor: number | null;
  conversion_reference_um: string | null;
  units_of_measure: { code: string; description: string } | null;
};

export type CatalogProductRow = {
  id: string;
  code: string;
  description: string | null;
  description_html: string | null;
  category: string | null;
  subcategory: string | null;
  danea_um: string | null;
  notes: string | null;
  commercial_availability: "available" | "on_order" | "temporarily_unavailable";
  product_images: { id: string } | null;
  product_sale_units: CatalogSaleUnit[];
};

export const CATALOG_SELECT =
  "id, code, description, description_html, category, subcategory, danea_um, notes, commercial_availability, product_images(id), product_sale_units(id, is_default, conversion_factor, conversion_reference_um, units_of_measure(code, description))";

/** Prodotti in vetrina di un fornitore: le RLS lasciano passare solo i collegamenti operativi. */
export async function fetchSellerCatalogue(sellerCompanyId: string) {
  const { data, error } = await supabase
    .from("products")
    .select(CATALOG_SELECT)
    .eq("company_id", sellerCompanyId)
    .eq("publish_status", "pubblicato")
    .eq("b2b_visible", true)
    .order("code");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CatalogProductRow[];
}

/**
 * Prezzi del listino assegnato all'acquirente.
 * Nessuna assegnazione (o listino non attivo) = nessun prezzo.
 */
export async function fetchAssignedPrices(sellerCompanyId: string, productIds: string[]) {
  const prices = new Map<string, number>();
  for (let index = 0; index < productIds.length; index += 200) {
    const chunk = productIds.slice(index, index + 200);
    if (!chunk.length) continue;
    const { data, error } = await supabase.rpc("buyer_catalog_prices", {
      _seller_company_id: sellerCompanyId,
      _product_ids: chunk,
    });
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const value = row.net_price ?? row.gross_price;
      if (value !== null && value !== undefined) prices.set(row.product_id, Number(value));
    }
  }
  return prices;
}

export function saleUnitCodes(product: CatalogProductRow) {
  return sortedSaleUnits(product)
    .map((unit) => unit.units_of_measure?.code)
    .filter((code): code is string => Boolean(code));
}

/** Unità di vendita del prodotto, con la predefinita del fornitore per prima. */
export function sortedSaleUnits(product: CatalogProductRow) {
  return product.product_sale_units
    .slice()
    .sort((a, b) => Number(b.is_default) - Number(a.is_default));
}

/**
 * U.M. proposta all'acquirente, regola unica in tutta l'app:
 * preferenza salvata → predefinita del prodotto → prima unità disponibile.
 */
export function resolveSaleUnit(product: CatalogProductRow, preferredId: string | undefined) {
  const units = sortedSaleUnits(product);
  return units.find((unit) => unit.id === preferredId) ?? units[0] ?? null;
}

/** Preferenze U.M. dell'acquirente verso un fornitore: prodotto → unità scelta. */
export async function fetchUnitPreferences(buyerCompanyId: string, sellerCompanyId?: string) {
  let query = supabase
    .from("customer_product_unit_preferences")
    .select("product_id, product_sale_unit_id")
    .eq("buyer_company_id", buyerCompanyId);
  if (sellerCompanyId) query = query.eq("seller_company_id", sellerCompanyId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((row) => [row.product_id, row.product_sale_unit_id]));
}

/** Regola sticky: l'ultima U.M. usata diventa la proposta successiva. */
export async function saveUnitPreference(input: {
  buyerCompanyId: string;
  sellerCompanyId: string;
  productId: string;
  productSaleUnitId: string;
  userId?: string | null;
}) {
  const { error } = await supabase.from("customer_product_unit_preferences").upsert(
    {
      buyer_company_id: input.buyerCompanyId,
      seller_company_id: input.sellerCompanyId,
      product_id: input.productId,
      product_sale_unit_id: input.productSaleUnitId,
      created_by: input.userId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "seller_company_id,buyer_company_id,product_id" },
  );
  if (error) throw new Error(error.message);
}

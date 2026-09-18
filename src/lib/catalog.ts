import { supabase } from "@/integrations/supabase/client";

export type CatalogProductRow = {
  id: string;
  code: string;
  description: string | null;
  description_html: string | null;
  category: string | null;
  subcategory: string | null;
  danea_um: string | null;
  notes: string | null;
  product_images: { id: string } | null;
  product_sale_units: {
    is_default: boolean;
    conversion_factor: number | null;
    conversion_reference_um: string | null;
    units_of_measure: { code: string; description: string } | null;
  }[];
};

const SELECT =
  "id, code, description, description_html, category, subcategory, danea_um, notes, product_images(id), product_sale_units(is_default, conversion_factor, conversion_reference_um, units_of_measure(code, description))";

/** Prodotti in vetrina di un fornitore: le RLS lasciano passare solo i collegamenti operativi. */
export async function fetchSellerCatalogue(sellerCompanyId: string) {
  const { data, error } = await supabase
    .from("products")
    .select(SELECT)
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
  return product.product_sale_units
    .slice()
    .sort((a, b) => Number(b.is_default) - Number(a.is_default))
    .map((unit) => unit.units_of_measure?.code)
    .filter((code): code is string => Boolean(code));
}

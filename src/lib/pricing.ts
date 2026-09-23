/**
 * Controllo andamento prezzo: sola lettura.
 * Le osservazioni vengono scritte solo dagli agganci server-side
 * (import Danea, listini, costo manuale, carico merce): aprire una pagina
 * non crea mai un'osservazione.
 */
import { supabase } from "@/integrations/supabase/client";

export type PriceDirection = "up" | "down" | "equal" | "first" | "not_comparable";

export type PriceSource =
  | "danea_supplier_cost"
  | "danea_price_list"
  | "b2b_price_list"
  | "manual_cost"
  | "supplier_confirmation"
  | "goods_receipt"
  | "backfill_initial";

export type PriceSeriesRow = {
  series_key: string;
  kind: "observed_price" | "actual_purchase_cost";
  supplier_company_id: string | null;
  supplier_record_id: string | null;
  supplier_label: string | null;
  supplier_product_id: string | null;
  supplier_reference: string | null;
  product_id: string | null;
  current_net_price: number | null;
  current_gross_price: number | null;
  current_price_unit_code: string | null;
  current_source: PriceSource | null;
  current_price_list_number: number | null;
  current_observed_at: string | null;
  previous_net_price: number | null;
  previous_gross_price: number | null;
  previous_price_unit_code: string | null;
  previous_source: PriceSource | null;
  previous_observed_at: string | null;
  comparable: boolean;
  delta_amount: number | null;
  delta_percent: number | null;
  direction: PriceDirection;
  observation_count: number;
  last_seen_at: string;
};

export type PriceObservationRow = {
  id: string;
  kind: "observed_price" | "actual_purchase_cost";
  net_price: number | null;
  gross_price: number | null;
  price_unit_code: string | null;
  source: PriceSource;
  price_list_number: number | null;
  observed_at: string;
  last_seen_at: string;
  notes: string | null;
};

const SERIES_SELECT =
  "series_key, kind, supplier_company_id, supplier_record_id, supplier_label, supplier_product_id, supplier_reference, product_id, current_net_price, current_gross_price, current_price_unit_code, current_source, current_price_list_number, current_observed_at, previous_net_price, previous_gross_price, previous_price_unit_code, previous_source, previous_observed_at, comparable, delta_amount, delta_percent, direction, observation_count, last_seen_at";

export const PRICE_SOURCE_LABEL: Record<PriceSource, string> = {
  danea_supplier_cost: "Costo fornitore (Danea)",
  danea_price_list: "Listino Danea",
  b2b_price_list: "Listino del fornitore",
  manual_cost: "Costo inserito a mano",
  supplier_confirmation: "Prezzo confermato dal fornitore",
  goods_receipt: "Costo realmente pagato",
  backfill_initial: "Dato iniziale",
};

/** Prezzo mostrato: netto quando c'è, altrimenti lordo. */
export function priceValue(net: number | null, gross: number | null) {
  if (net !== null && net !== undefined) return Number(net);
  if (gross !== null && gross !== undefined) return Number(gross);
  return null;
}

export function seriesCurrent(row: PriceSeriesRow) {
  return priceValue(row.current_net_price, row.current_gross_price);
}

export function seriesPrevious(row: PriceSeriesRow) {
  return priceValue(row.previous_net_price, row.previous_gross_price);
}

/** Serie dei prodotti già adottati (Inventario, Fabbisogno). */
export async function fetchPriceSeriesForProducts(companyId: string, productIds: string[]) {
  const result = new Map<string, PriceSeriesRow[]>();
  for (let index = 0; index < productIds.length; index += 200) {
    const chunk = productIds.slice(index, index + 200);
    if (!chunk.length) continue;
    const { data, error } = await supabase
      .from("supplier_price_series")
      .select(SERIES_SELECT)
      .eq("company_id", companyId)
      .in("product_id", chunk);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as unknown as PriceSeriesRow[]) {
      if (!row.product_id) continue;
      const list = result.get(row.product_id) ?? [];
      list.push(row);
      result.set(row.product_id, list);
    }
  }
  return result;
}

/** Serie degli articoli del catalogo fornitore (anche solo preferiti). */
export async function fetchPriceSeriesForCatalog(
  companyId: string,
  supplierProductIds: string[],
) {
  const result = new Map<string, PriceSeriesRow>();
  for (let index = 0; index < supplierProductIds.length; index += 200) {
    const chunk = supplierProductIds.slice(index, index + 200);
    if (!chunk.length) continue;
    const { data, error } = await supabase
      .from("supplier_price_series")
      .select(SERIES_SELECT)
      .eq("company_id", companyId)
      .eq("kind", "observed_price")
      .in("supplier_product_id", chunk);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as unknown as PriceSeriesRow[]) {
      if (row.supplier_product_id) result.set(row.supplier_product_id, row);
    }
  }
  return result;
}

/** Ultime osservazioni di una serie, prezzi commerciali e costi effettivi separati. */
export async function fetchPriceObservations(seriesKey: string, limit = 8) {
  const { data, error } = await supabase
    .from("supplier_price_observations")
    .select(
      "id, kind, net_price, gross_price, price_unit_code, source, price_list_number, observed_at, last_seen_at, notes",
    )
    .eq("series_key", seriesKey)
    .order("observed_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PriceObservationRow[];
}

/** Avvia il monitoraggio dalla stella: nessun prodotto creato. */
export async function seedPriceSeriesForFavorite(input: {
  buyerCompanyId: string;
  sellerCompanyId: string;
  sellerProductId: string;
}) {
  const { error } = await supabase.rpc("seed_price_series_for_favorite", {
    _buyer_company_id: input.buyerCompanyId,
    _seller_company_id: input.sellerCompanyId,
    _seller_product_id: input.sellerProductId,
  });
  if (error) throw new Error(error.message);
}

/** Adozione: il prodotto si collega alla serie esistente, lo storico non cambia. */
export async function linkPriceSeriesToProduct(input: {
  companyId: string;
  sellerCompanyId: string;
  sellerProductId: string;
  productId: string;
}) {
  const { error } = await supabase.rpc("link_price_series_to_product", {
    _company_id: input.companyId,
    _supplier_company_id: input.sellerCompanyId,
    _supplier_product_id: input.sellerProductId,
    _product_id: input.productId,
  });
  if (error) throw new Error(error.message);
}

export function priceDateShort(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function unitSuffix(code: string | null | undefined) {
  return code ? `/${code}` : "";
}

/** Prezzo con quattro decimali solo quando servono davvero. */
export function priceLabel(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

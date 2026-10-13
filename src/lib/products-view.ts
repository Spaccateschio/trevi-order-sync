/**
 * Viste della pagina Prodotti (Acquisti / Vendite): decidono solo quali colonne e filtri si
 * vedono, mai i dati né i permessi. Le U.M. di acquisto arrivano già decise dal database
 * (product_purchase_units_overview): qui si formattano soltanto, senza sostituzioni.
 */
export type ProductsView = "acquisti" | "vendite";

export type PurchaseSupplier = {
  linkId: string;
  name: string;
  isB2b: boolean;
  purchasable: boolean;
  isPreferred: boolean;
  units: { code: string; is_default: boolean }[];
};

export const NOT_CONFIGURED = "Non configurata";

/** Viste disponibili in base alle impostazioni aziendali «acquista» / «vende». */
export function availableViews(buys: boolean, sells: boolean): ProductsView[] {
  return [...(buys ? (["acquisti"] as const) : []), ...(sells ? (["vendite"] as const) : [])];
}

/** Colonne messe in alto nel menu Colonne per ciascuna vista; le altre vanno in «Altre colonne». */
export const VIEW_PRIORITY_COLUMNS: Record<ProductsView, string[]> = {
  acquisti: ["code", "description", "category", "stock_unit", "suppliers", "purchase_units", "preferred_supplier", "purchase_cost", "supplier_price", "danea_um"],
  vendite: ["code", "description", "category", "danea_um", "sale_units", "default_sale_unit", "unit_review", "b2b_visible", "price_1", "price_2", "price_3", "price_4", "price_5", "price_6", "price_7", "price_8", "price_9"],
};

/** Colonne iniziali: in Acquisti la U.M. Danea è disponibile ma nascosta. */
export const VIEW_INITIAL_COLUMNS: Record<ProductsView, string[]> = {
  acquisti: ["code", "description", "category", "stock_unit", "suppliers", "purchase_units", "preferred_supplier", "purchase_cost"],
  vendite: ["code", "description", "danea_um", "sale_units", "default_sale_unit", "price_1"],
};

/** U.M. di un fornitore come testo: «Non configurata» se il database non ne restituisce. */
export function supplierUnitsText(supplier: PurchaseSupplier): string {
  if (!supplier.units.length) return NOT_CONFIGURED;
  return supplier.units.map((unit) => unit.code).join(", ");
}

/** Sintesi per la cella: un fornitore per gruppo, mai U.M. mescolate tra fornitori. */
export function purchaseUnitsSummary(suppliers: PurchaseSupplier[]): string {
  if (!suppliers.length) return "—";
  return suppliers
    .map((supplier) => `${supplier.name}: ${supplierUnitsText(supplier)}${supplier.purchasable ? "" : " (non acquistabile)"}`)
    .join(" · ");
}

/** Fornitore preferito (stella del fornitore, non del prodotto). */
export function preferredSupplierText(suppliers: PurchaseSupplier[]): string {
  const starred = suppliers.filter((supplier) => supplier.isPreferred);
  return starred.length ? starred.map((supplier) => `★ ${supplier.name}`).join(", ") : "—";
}

/** Fornitori in ordine: preferito prima, poi per nome. */
export function sortSuppliers(suppliers: PurchaseSupplier[]): PurchaseSupplier[] {
  return [...suppliers].sort((a, b) => (a.isPreferred === b.isPreferred ? a.name.localeCompare(b.name, "it") : a.isPreferred ? -1 : 1));
}

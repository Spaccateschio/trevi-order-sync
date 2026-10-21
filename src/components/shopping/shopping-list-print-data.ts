import { compareShoppingProducts, matchesShoppingFilters, type ProductFilterFacts, type ProductFilters, type SortKey } from "./shopping-list-filters";

export type ShoppingPrintRow = ProductFilterFacts & {
  stock: number | null; stockUnit: string | null;
  quantity: number | null; quantityUnit: string | null;
  draft: boolean; state: string; splits: string[];
};

/** The printable dataset has no card pagination limit and never writes any data. */
export function selectShoppingPrintRows(rows: ShoppingPrintRow[], filters: ProductFilters, sort: SortKey): ShoppingPrintRow[] {
  return rows.filter((row) => matchesShoppingFilters(row, filters)).sort((a, b) => compareShoppingProducts(a, b, sort));
}

export function printQuantity(quantity: number | null, unit: string | null) {
  return quantity === null ? "—" : `${quantity.toLocaleString("it-IT", { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ""}`;
}
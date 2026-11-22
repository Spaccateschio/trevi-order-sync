export type FilterFlag = "preferiti" | "b2b" | "non_b2b" | "senza_fornitore" | "da_assegnare" | "parziale" | "assegnata" | "in_ordine" | "da_ordinare" | "da_confermare" | "confermati" | "da_controllare";
export type SortKey = "description" | "code" | "category" | "supplier";
export type ProductFilterFacts = {
  id: string; code: string; description: string | null; category: string | null;
  supplierIds: string[]; supplierNames: string[]; favorite: boolean;
  b2b: boolean; nonB2b: boolean; assignment: string | null;
  ordered: boolean; confirmed: boolean; needsCheck: boolean; nonPurchase: boolean;
};
export type ProductFilters = { search: string; category: string; supplier: string; flags: ReadonlySet<FilterFlag> };
export type ShoppingFilterKey = "search" | "category" | "supplier" | "flags";

/** OR within alternative states, AND across independent groups. Never infer saved assignments. */
export function failedShoppingFilters(p: ProductFilterFacts, f: ProductFilters): ShoppingFilterKey[] {
  const failed: ShoppingFilterKey[] = [];
  const term = f.search.trim().toLocaleLowerCase("it");
  if (term && !`${p.code} ${p.description ?? ""}`.toLocaleLowerCase("it").includes(term)) failed.push("search");
  if (f.category !== "all" && p.category !== f.category) failed.push("category");
  if (f.supplier !== "all" && !p.supplierIds.includes(f.supplier)) failed.push("supplier");
  const group = (options: [FilterFlag, boolean][]) => {
    const selected = options.filter(([flag]) => f.flags.has(flag));
    return selected.length === 0 || selected.some(([, match]) => match);
  };
  const flagsFailed = (f.flags.has("preferiti") && !p.favorite)
    || (f.flags.has("senza_fornitore") && p.supplierIds.length > 0)
    || !group([["b2b", p.b2b], ["non_b2b", p.nonB2b]])
    || !group([["da_assegnare", p.assignment === "da_assegnare"], ["parziale", p.assignment === "parziale"], ["assegnata", p.assignment === "assegnata"]])
    || !group([["in_ordine", p.ordered], ["da_ordinare", !p.ordered && !p.nonPurchase]])
    || !group([["da_confermare", !p.confirmed && !p.nonPurchase], ["confermati", p.confirmed || p.nonPurchase], ["da_controllare", p.needsCheck && !p.ordered]]);
  if (flagsFailed) failed.push("flags");
  return failed;
}

export function matchesShoppingFilters(p: ProductFilterFacts, f: ProductFilters): boolean {
  return failedShoppingFilters(p, f).length === 0;
}

/** Una bozza appena scritta non sparisce mentre la si corregge con «Da inserire» attivo. */
export function visibleWhenFilteringMissing(onlyMissing: boolean, isMissing: boolean, hasLocalDraft: boolean): boolean {
  return !onlyMissing || isMissing || hasLocalDraft;
}

/** Aprendo un mancante si tolgono solo i filtri che nascondono proprio quella card. */
export function shoppingFiltersForMissingReveal(p: ProductFilterFacts, f: ProductFilters): ProductFilters {
  const failed = new Set(failedShoppingFilters(p, f));
  return {
    search: failed.has("search") ? "" : f.search,
    category: failed.has("category") ? "all" : f.category,
    supplier: failed.has("supplier") ? "all" : f.supplier,
    flags: failed.has("flags") ? new Set<FilterFlag>() : f.flags,
  };
}

/** Il limite arriva al massimo alla posizione del mancante, mai all'intero catalogo. */
export function catalogLimitForMissingReveal<T extends { key: string; code: string; facts: ProductFilterFacts }>(
  products: readonly T[], selectedKey: string, filters: ProductFilters, sort: SortKey, currentLimit: number,
): number {
  const ordered = products.filter((product) => matchesShoppingFilters(product.facts, filters)).sort((left, right) =>
    shoppingSortKey(left.facts, sort).localeCompare(shoppingSortKey(right.facts, sort), "it", { numeric: true })
    || left.code.localeCompare(right.code, "it", { numeric: true }) || left.key.localeCompare(right.key));
  const position = ordered.findIndex((product) => product.key === selectedKey);
  return position < 0 ? currentLimit : Math.max(currentLimit, position + 1);
}

export function shoppingSortKey(p: ProductFilterFacts, sort: SortKey) {
  const name = p.description ?? p.code;
  if (sort === "code") return p.code;
  if (sort === "category") return `${p.category ?? "\uffff"} ${name}`;
  if (sort === "supplier") return `${p.supplierNames[0] ?? "\uffff"} ${name}`;
  return name;
}

export function compareShoppingProducts(a: ProductFilterFacts, b: ProductFilterFacts, sort: SortKey) {
  return shoppingSortKey(a, sort).localeCompare(shoppingSortKey(b, sort), "it", { numeric: true })
    || a.code.localeCompare(b.code, "it", { numeric: true }) || a.id.localeCompare(b.id);
}
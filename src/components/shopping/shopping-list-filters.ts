export type FilterFlag = "preferiti" | "b2b" | "non_b2b" | "senza_fornitore" | "da_assegnare" | "parziale" | "assegnata" | "in_ordine" | "da_ordinare" | "da_confermare" | "confermati" | "da_controllare";
export type SortKey = "description" | "code" | "category" | "supplier";
export type ProductFilterFacts = {
  id: string; code: string; description: string | null; category: string | null;
  supplierIds: string[]; supplierNames: string[]; favorite: boolean;
  b2b: boolean; nonB2b: boolean; assignment: string | null;
  ordered: boolean; confirmed: boolean; needsCheck: boolean; nonPurchase: boolean;
};
export type ProductFilters = { search: string; category: string; supplier: string; flags: ReadonlySet<FilterFlag> };

/** OR within alternative states, AND across independent groups. Never infer saved assignments. */
export function matchesShoppingFilters(p: ProductFilterFacts, f: ProductFilters): boolean {
  const term = f.search.trim().toLocaleLowerCase("it");
  if (term && !`${p.code} ${p.description ?? ""}`.toLocaleLowerCase("it").includes(term)) return false;
  if (f.category !== "all" && p.category !== f.category) return false;
  if (f.supplier !== "all" && !p.supplierIds.includes(f.supplier)) return false;
  if (f.flags.has("preferiti") && !p.favorite) return false;
  if (f.flags.has("senza_fornitore") && p.supplierIds.length > 0) return false;
  const group = (options: [FilterFlag, boolean][]) => {
    const selected = options.filter(([flag]) => f.flags.has(flag));
    return selected.length === 0 || selected.some(([, match]) => match);
  };
  return group([["b2b", p.b2b], ["non_b2b", p.nonB2b]])
    && group([["da_assegnare", p.assignment === "da_assegnare"], ["parziale", p.assignment === "parziale"], ["assegnata", p.assignment === "assegnata"]])
    && group([["in_ordine", p.ordered], ["da_ordinare", !p.ordered && !p.nonPurchase]])
    && group([["da_confermare", !p.confirmed && !p.nonPurchase], ["confermati", p.confirmed || p.nonPurchase], ["da_controllare", p.needsCheck && !p.ordered]]);
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
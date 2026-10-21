import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchesShoppingFilters, type FilterFlag, type ProductFilterFacts } from "./shopping-list-filters";
const p: ProductFilterFacts = { id: "p1", code: "00-001", description: "Ananas", category: "Frutta", supplierIds: ["trevi"], supplierNames: ["Trevi"], favorite: true, b2b: true, nonB2b: false, assignment: null, ordered: false, confirmed: false, needsCheck: false, nonPurchase: false };
const match = (flags: FilterFlag[], overrides: Partial<ProductFilterFacts> = {}) => matchesShoppingFilters({ ...p, ...overrides }, { search: "", category: "all", supplier: "all", flags: new Set(flags) });
describe("filtri prodotti Lista", () => {
  const cases: [FilterFlag, Partial<ProductFilterFacts>, boolean][] = [
    ["preferiti", {}, true], ["preferiti", { favorite: false }, false], ["b2b", {}, true], ["non_b2b", {}, false],
    ["senza_fornitore", {}, false], ["senza_fornitore", { supplierIds: [] }, true],
    ["da_assegnare", {}, false], ["da_assegnare", { assignment: "da_assegnare" }, true],
    ["parziale", { assignment: "parziale" }, true], ["assegnata", { assignment: "assegnata" }, true],
    ["in_ordine", {}, false], ["in_ordine", { ordered: true }, true], ["da_ordinare", {}, true],
    ["da_confermare", {}, true], ["confermati", {}, false], ["confermati", { confirmed: true }, true],
    ["da_controllare", { needsCheck: true }, true], ["da_controllare", {}, false],
  ];
  for (const [flag, overrides, expected] of cases) it(`${flag}: ${JSON.stringify(overrides)}`, () => assert.equal(match([flag], overrides), expected));
  it("B2B e Non B2B sono unione", () => assert.equal(match(["b2b", "non_b2b"]), true));
  it("confermati e da confermare sono unione", () => assert.equal(match(["confermati", "da_confermare"]), true));
  it("ordine e da ordinare sono unione", () => assert.equal(match(["in_ordine", "da_ordinare"]), true));
  it("gruppi diversi si intersecano", () => assert.equal(match(["preferiti", "confermati"]), false));
  it("zero confermato non va da ordinare", () => assert.equal(match(["da_ordinare"], { nonPurchase: true }), false));
  it("zero confermato va nei confermati", () => assert.equal(match(["confermati"], { nonPurchase: true }), true));
  it("ricerca categoria e fornitore insieme", () => {
    const f = { search: "ANANAS", category: "Frutta", supplier: "trevi", flags: new Set<FilterFlag>() };
    assert.equal(matchesShoppingFilters(p, f), true);
    assert.equal(matchesShoppingFilters(p, { ...f, supplier: "altro" }), false);
    assert.equal(matchesShoppingFilters(p, { ...f, category: "Verdura" }), false);
    assert.equal(matchesShoppingFilters(p, { ...f, search: "pera" }), false);
  });
  it("nessun filtro include catalogo e stati sconosciuti", () => assert.equal(match([]), true));
});
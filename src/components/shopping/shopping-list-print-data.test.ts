import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { printQuantity, selectShoppingPrintRows, type ShoppingPrintRow } from "./shopping-list-print-data";
import { matchesShoppingFilters, type FilterFlag } from "./shopping-list-filters";
const rows: ShoppingPrintRow[] = Array.from({ length: 85 }, (_, i) => ({ id: `p${i}`, code: `${i}`, description: `Prodotto ${i}`, category: i % 2 ? "Frutta" : "Verdura", supplierIds: ["trevi"], supplierNames: ["Trevi"], favorite: i % 2 === 1, b2b: true, nonB2b: false, assignment: null, ordered: false, confirmed: false, needsCheck: false, nonPurchase: false, stock: null, stockUnit: null, quantity: null, quantityUnit: "kg", draft: false, state: "Non in lista", splits: [] }));
const all = { search: "", category: "all", supplier: "all", flags: new Set<FilterFlag>() };
describe("stampa risultati filtrati", () => {
  it("include 85 prodotti senza taglio a 60", () => assert.equal(selectShoppingPrintRows(rows, all, "code").length, 85));
  it("stampa esattamente gli stessi identificativi dei filtri pagina", () => {
    const filters = { ...all, category: "Frutta", flags: new Set<FilterFlag>(["preferiti", "b2b"]) };
    assert.deepEqual(selectShoppingPrintRows(rows, filters, "code").map((r) => r.id).sort(), rows.filter((r) => matchesShoppingFilters(r, filters)).map((r) => r.id).sort());
    assert.equal(selectShoppingPrintRows(rows, filters, "code").length, 42);
  });
  it("ordinamento numerico completo", () => assert.deepEqual(selectShoppingPrintRows(rows, all, "code").slice(0, 3).map((r) => r.code), ["0", "1", "2"]));
  it("senza corrispondenze nessun prodotto stampato", () => assert.equal(selectShoppingPrintRows(rows, { ...all, search: "ananas" }, "code").length, 0));
  it("dato mancante non diventa zero", () => assert.equal(printQuantity(null, "kg"), "—"));
  it("quantità e U.M. mantenute", () => assert.equal(printQuantity(2.5, "casse"), "2,5 casse"));
  it("bozza mantenuta senza conferma o mutazione", () => {
    const draft = { ...rows[0], draft: true, quantity: 3, quantityUnit: "casse" };
    const before = JSON.stringify(draft);
    const output = selectShoppingPrintRows([draft], all, "code");
    assert.equal(output[0].draft, true); assert.equal(output[0].quantity, 3); assert.equal(JSON.stringify(draft), before);
  });
});
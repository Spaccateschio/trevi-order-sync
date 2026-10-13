import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { availableViews, preferredSupplierText, purchaseUnitsSummary, supplierUnitsText, VIEW_INITIAL_COLUMNS, type PurchaseSupplier } from "./products-view";

const s = (name: string, units: string[], extra: Partial<PurchaseSupplier> = {}): PurchaseSupplier => ({
  linkId: name, name, isB2b: true, purchasable: true, isPreferred: false, units: units.map((code, i) => ({ code, is_default: i === 0 })), ...extra,
});

describe("viste pagina Prodotti", () => {
  it("chi acquista soltanto vede solo Acquisti", () => assert.deepEqual(availableViews(true, false), ["acquisti"]));
  it("chi vende soltanto vede solo Vendite", () => assert.deepEqual(availableViews(false, true), ["vendite"]));
  it("chi acquista e vende vede entrambe", () => assert.deepEqual(availableViews(true, true), ["acquisti", "vendite"]));
  it("Acquisti: U.M. Danea e U.M. vendita nascoste all'apertura", () => {
    assert.equal(VIEW_INITIAL_COLUMNS.acquisti.includes("danea_um"), false);
    assert.equal(VIEW_INITIAL_COLUMNS.acquisti.includes("sale_units"), false);
    assert.equal(VIEW_INITIAL_COLUMNS.acquisti.includes("purchase_units"), true);
  });
});

describe("U.M. acquisto per fornitore", () => {
  it("senza U.M. dal database: «Non configurata», nessuna sostituzione", () => assert.equal(supplierUnitsText(s("Trevi", [])), "Non configurata"));
  it("più fornitori: U.M. separate per fornitore", () => {
    assert.equal(purchaseUnitsSummary([s("A", ["cs", "mz"]), s("B", ["pz"])]), "A: cs, mz · B: pz");
  });
  it("non acquistabile è segnalato", () => {
    assert.equal(purchaseUnitsSummary([s("Trevi", [], { purchasable: false })]), "Trevi: Non configurata (non acquistabile)");
  });
  it("stella fornitore preferito", () => {
    assert.equal(preferredSupplierText([s("A", ["kg"]), s("B", ["kg"], { isPreferred: true })]), "★ B");
    assert.equal(preferredSupplierText([s("A", ["kg"])]), "—");
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogSupplierLabel, evaluationBadge } from "./card-labels";

test("nessuna riga di valutazione = Da valutare", () => {
  assert.equal(evaluationBadge(undefined, "KG"), "Da valutare");
});
test("da_acquistare mostra la quantità salvata", () => {
  assert.equal(evaluationBadge({ status: "da_acquistare", decided_quantity: 10 }, "KG"), "Da acquistare · 10 KG");
});
test("non_acquistare non mostra più Da valutare", () => {
  assert.equal(evaluationBadge({ status: "non_acquistare", decided_quantity: null }, "MZ"), "Non acquistare");
});
test("B2B indica il venditore", () => {
  assert.equal(catalogSupplierLabel({ isB2b: true, supplierNames: ["trevi srl"] }), "Catalogo B2B · trevi srl");
});
test("proprio senza collegamenti", () => {
  assert.equal(catalogSupplierLabel({ isB2b: false, supplierNames: [] }), "Nessun fornitore collegato");
});
test("più di due collegati mostra il numero", () => {
  assert.equal(catalogSupplierLabel({ isB2b: false, supplierNames: ["a", "b", "c"] }), "3 fornitori collegati");
});

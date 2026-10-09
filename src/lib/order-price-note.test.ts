import { test } from "node:test";
import assert from "node:assert/strict";
import { orderPriceNote } from "./purchase";

test("B2B senza prezzo = Prezzo su richiesta", () => {
  assert.equal(orderPriceNote({ unitCost: null, priceUnitCode: "pz", purchaseUnitCode: "pz", isB2b: true })?.price, "Prezzo su richiesta");
});

test("prezzo al kg ordinato in cassa = Da pesare al carico", () => {
  assert.equal(orderPriceNote({ unitCost: 2.5, priceUnitCode: "kg", purchaseUnitCode: "cs", isB2b: true })?.weigh, true);
});

test("prezzo in pz ordinato in mz: nessun Da pesare", () => {
  assert.equal(orderPriceNote({ unitCost: 0.9, priceUnitCode: "pz", purchaseUnitCode: "mz", isB2b: true })?.weigh, false);
});

test("fornitore esterno senza prezzo: nessuna scritta", () => {
  assert.equal(orderPriceNote({ unitCost: null, priceUnitCode: null, purchaseUnitCode: "pz", isB2b: false }), null);
});

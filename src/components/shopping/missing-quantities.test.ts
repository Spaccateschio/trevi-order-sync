import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { missingQuantities, hasEmptyCompletionQuantity } from "./missing-quantities";

describe("completamento quantità sull'intera Lista", () => {
  it("include quantità mancanti anche su prodotti non preferiti", () => {
    const rows = [{ id: "visibile", quantity: 3, locked: true, favorite: true }, { id: "nascosto", quantity: null, locked: false, favorite: false }];
    assert.deepEqual(missingQuantities(rows).map((r) => r.id), ["nascosto"]);
  });
  it("Non acquistare ed esclusi non richiedono quantità", () => {
    assert.deepEqual(missingQuantities([{ id: "n", quantity: null, locked: false, nonPurchase: true }, { id: "e", quantity: null, locked: false, excluded: true }]), []);
  });
  it("quantità positive non confermate vanno completate", () => {
    assert.deepEqual(missingQuantities([{ id: "p", quantity: 5, locked: false }]).map((r) => r.id), ["p"]);
  });
  it("una nuova U.M. e un valore scritto su card bloccata richiedono conferma", () => {
    assert.equal(missingQuantities([{ id: "u", quantity: 5, locked: true, unitChanged: true }, { id: "d", quantity: 5, locked: true, draft: "6" }]).length, 2);
  });
  it("scrivere zero non esclude nulla prima della conferma", () => {
    assert.equal(missingQuantities([{ id: "z", quantity: 5, locked: true, draft: "0" }]).length, 1);
  });
  it("Continua propone Non acquistare solo per i campi vuoti, anche fuori dai filtri", () => {
    const rows = missingQuantities([
      { id: "vuoto", quantity: null, locked: false },
      { id: "cancellato", quantity: 5, draft: " ", locked: false },
      { id: "nascosto", quantity: null, locked: false, favorite: false },
      { id: "positivo", quantity: null, draft: "7,5", locked: false },
      { id: "salvato", quantity: 3, locked: false },
      { id: "zero", quantity: null, draft: "0", locked: false },
      { id: "invalido", quantity: null, draft: "abc", locked: false },
    ]);
    assert.deepEqual(rows.filter(hasEmptyCompletionQuantity).map((row) => row.id), ["vuoto", "cancellato", "nascosto"]);
  });
  it("numeri positivi scritti o salvati restano da confermare e non diventano Non acquistare", () => {
    for (const row of [{ id: "scritto", quantity: null, draft: "5", locked: false }, { id: "salvato", quantity: 5, locked: false }]) {
      assert.equal(hasEmptyCompletionQuantity(row), false);
      assert.deepEqual(missingQuantities([row]).map((item) => item.id), [row.id]);
    }
  });
});
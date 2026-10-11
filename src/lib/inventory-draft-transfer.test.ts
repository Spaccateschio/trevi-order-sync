import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { resolveDraftTarget, typedPurchaseQuantities } from "./inventory-draft-transfer";

const card = (id: string, product_id: string, location_id: string, card_favorite = false) => ({ id, product_id, location_id, card_favorite });

describe("quantità scritte prima dell'apertura", () => {
  test("una sola card del prodotto nella zona: la riceve", () => {
    assert.equal(resolveDraftTarget([card("a", "p1", "z1"), card("b", "p1", "z2")], "p1", "z1")?.id, "a");
  });
  test("più card (fornitore e «Senza fornitore») senza stella: nessuna assegnazione", () => {
    assert.equal(resolveDraftTarget([card("a", "p1", "z1"), card("b", "p1", "z1")], "p1", "z1"), null);
  });
  test("più card con una sola stella: va sulla card con stella", () => {
    assert.equal(resolveDraftTarget([card("a", "p1", "z1"), card("b", "p1", "z1", true)], "p1", "z1")?.id, "b");
  });
  test("più card con due stelle: nessuna assegnazione", () => {
    assert.equal(resolveDraftTarget([card("a", "p1", "z1", true), card("b", "p1", "z1", true)], "p1", "z1"), null);
  });
});

describe("«Aggiungi alla Lista» usa la quantità mostrata", () => {
  test("il valore appena scritto prevale su quello salvato", () => {
    const saved = new Map([["p1", { status: "da_acquistare", decided_quantity: 3 }]]);
    assert.deepEqual(typedPurchaseQuantities(["p1"], { p1: "8" }, saved), [{ product_id: "p1", quantity: 8 }]);
  });
  test("campo vuoto: usa la quantità salvata da acquistare", () => {
    const saved = new Map([["p1", { status: "da_acquistare", decided_quantity: 3 }]]);
    assert.deepEqual(typedPurchaseQuantities(["p1"], {}, saved), [{ product_id: "p1", quantity: 3 }]);
  });
  test("zero o «non acquistare» non vengono inviati", () => {
    const saved = new Map([["p2", { status: "non_acquistare", decided_quantity: null }]]);
    assert.deepEqual(typedPurchaseQuantities(["p1", "p2"], { p1: "0" }, saved), []);
  });
});

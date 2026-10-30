import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { shoppingInventoryTotals, type ShoppingCountRow } from "./shopping-inventory-total";

const row = (over: Partial<ShoppingCountRow>): ShoppingCountRow => ({
  product_id: "p",
  session_id: "s1",
  location_id: "l",
  counted_quantity: null,
  unit_code: null,
  counted_at: "2026-10-25T10:00:00Z",
  ...over,
});

describe("totale inventario nelle card della Lista", () => {
  it("somma le card contate della stessa sessione (2 cassa + 2 cassa = 4 cassa)", () => {
    const totals = shoppingInventoryTotals([
      row({ counted_quantity: "2", unit_code: "cassa", location_id: "l1", counted_at: "2026-10-29T07:52:00Z" }),
      row({ counted_quantity: "2", unit_code: "cassa", location_id: "l1", counted_at: "2026-10-29T07:52:30Z" }),
    ]);
    assert.deepEqual(totals.get("p"), { total: 4, unit: "cassa", reason: null, countedCards: 2 });
  });

  it("lo zero contato entra nel totale", () => {
    const totals = shoppingInventoryTotals([
      row({ counted_quantity: "0", unit_code: "mazzo", counted_at: "2026-10-29T07:00:00Z" }),
      row({ counted_quantity: "7", unit_code: "mazzo", counted_at: "2026-10-29T07:10:00Z" }),
    ]);
    assert.deepEqual(totals.get("p"), { total: 7, unit: "mazzo", reason: null, countedCards: 2 });
  });

  it("non somma la sessione chiusa a quella aperta: solo l'ultimo conteggio", () => {
    const totals = shoppingInventoryTotals([
      row({ session_id: "vecchia", counted_quantity: "5", unit_code: "kg", counted_at: "2026-10-10T08:00:00Z" }),
      row({ session_id: "aperta", counted_quantity: "2", unit_code: "kg", counted_at: "2026-10-29T08:00:00Z" }),
    ]);
    assert.deepEqual(totals.get("p"), { total: 2, unit: "kg", reason: null, countedCards: 1 });
  });

  it("U.M. diverse tra le card: nessun totale, mai una conversione inventata", () => {
    const totals = shoppingInventoryTotals([
      row({ counted_quantity: "9", unit_code: "kg", location_id: "l1", counted_at: "2026-10-29T08:00:00Z" }),
      row({ counted_quantity: "2", unit_code: "cassa", location_id: "l2", counted_at: "2026-10-29T08:05:00Z" }),
    ]);
    assert.deepEqual(totals.get("p"), { total: null, unit: null, reason: "um_diverse", countedCards: 0 });
  });

  it("card non contate restano fuori dalla somma", () => {
    const totals = shoppingInventoryTotals([
      row({ counted_quantity: "3", unit_code: "kg", location_id: "l1", counted_at: "2026-10-29T08:00:00Z" }),
      row({ counted_quantity: null, unit_code: null, location_id: "l2", counted_at: "2026-10-29T08:10:00Z" }),
    ]);
    assert.deepEqual(totals.get("p"), { total: 3, unit: "kg", reason: null, countedCards: 1 });
  });

  it("prodotto senza alcun conteggio: nessun totale", () => {
    const totals = shoppingInventoryTotals([row({ counted_quantity: null, unit_code: null })]);
    assert.deepEqual(totals.get("p"), { total: null, unit: null, reason: "nessun_conteggio", countedCards: 0 });
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectShoppingList } from "./shopping-list-selection";

const open = { id: "new-purchase", status: "aperta", quantity: 5 };
const closed = { id: "sent-purchase", status: "chiusa", quantity: 19 };
const linked = { id: "linked-inventory", status: "aperta", quantity: 3 };
describe("lista mostrata e quantità salvate", () => {
  it("inventario precedente pendente non nasconde la lista aperta con quantità 5", () => {
    const selected = selectShoppingList([closed, open], null, null, true);
    assert.equal(selected?.id, "new-purchase");
    assert.equal(selected?.quantity, 5);
  });
  it("mantiene la scelta esplicita prima del collegamento inventario", () => {
    assert.equal(selectShoppingList([open, linked], open.id, linked, true), open);
  });
  it("mantiene la lista dell'inventario in lavorazione", () => {
    assert.equal(selectShoppingList([open, linked], null, linked, true), linked);
  });
  it("non recupera le quantità 19 da una lista chiusa", () => {
    assert.equal(selectShoppingList([closed], null, null, true), null);
    assert.equal(selectShoppingList([closed], null, null, false), null);
  });
  it("senza liste aperte mantiene l'anteprima inventario, non una lista confermata", () => {
    const confirmed = { id: "confirmed", status: "confermata" };
    assert.equal(selectShoppingList([confirmed], null, null, true), null);
    assert.equal(selectShoppingList([confirmed], null, null, false), confirmed);
  });
});
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NEXT_PURCHASE, purchaseSelectionKey, restorePurchaseSelection, selectShoppingList } from "./shopping-list-selection";

const open = { id: "new-purchase", status: "aperta", quantity: 5 };
const closed = { id: "sent-purchase", status: "chiusa", quantity: 19 };
const linked = { id: "linked-inventory", status: "aperta", quantity: 3 };
describe("lista mostrata e quantità salvate", () => {
  it("al primo ingresso parte vuoto anche con vecchi 5 kg, residui e AD-2026-00003 senza chiuderli", () => {
    const previous = Object.freeze({ id: "previous", status: "aperta", quantity: 5, directDraft: "AD-2026-00003", residual: 2 });
    const selected = restorePurchaseSelection(null);
    assert.equal(selected, NEXT_PURCHASE);
    assert.equal(selectShoppingList([previous], selected, previous, true), null);
    assert.equal(previous.status, "aperta");
    assert.equal(previous.quantity, 5);
    assert.equal(previous.directDraft, "AD-2026-00003");
    assert.equal(previous.residual, 2);
    assert.equal(selectShoppingList([previous], previous.id, null, false), previous);
  });
  it("non riutilizza la selezione precedente alla separazione autorizzata", () => {
    assert.notEqual(purchaseSelectionKey("a", "company"), "shopping-purchase-cycle:a:company");
  });
  it("rientrando resta vuoto senza premere Nuovo acquisto", () => {
    assert.equal(restorePurchaseSelection(NEXT_PURCHASE), NEXT_PURCHASE);
  });
  it("conserva al rientro le nuove quantità confermate e il recupero esplicito", () => {
    assert.equal(selectShoppingList([open], restorePurchaseSelection(open.id), null, false)?.quantity, 5);
    assert.equal(selectShoppingList([closed], restorePurchaseSelection(closed.id), null, false), closed);
  });
  it("5 kg precedenti e bozza AD restano recuperabili, mai nel nuovo ciclo vuoto", () => {
    const previous = Object.freeze({ id: "previous", status: "aperta", quantity: 5, directDraft: "AD-2026-00003", residual: 2 });
    assert.equal(selectShoppingList([previous], NEXT_PURCHASE, previous, true), null);
    assert.equal(selectShoppingList([previous], previous.id, null, false), previous);
    assert.equal(previous.quantity, 5);
    assert.equal(previous.residual, 2);
    assert.equal(previous.directDraft, "AD-2026-00003");
  });
  it("il ciclo ricordato è separato per utente e azienda", () => {
    assert.notEqual(purchaseSelectionKey("a", "company"), purchaseSelectionKey("b", "company"));
    assert.notEqual(purchaseSelectionKey("a", "company"), purchaseSelectionKey("a", "other"));
  });
  it("attende la nuova lista senza ricadere sui vecchi 5 kg durante l'aggiornamento", () => {
    assert.equal(selectShoppingList([open, linked], "not-yet-refreshed", linked, true), null);
  });
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
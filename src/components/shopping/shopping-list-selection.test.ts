import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NEXT_PURCHASE, purchaseSelectionKey, restorePurchaseSelection, selectShoppingList, shoppingListDownloaded } from "./shopping-list-selection";

const open = { id: "new-purchase", status: "aperta", quantity: 5 };
const closed = { id: "sent-purchase", status: "chiusa", quantity: 19 };
const linked = { id: "linked-inventory", status: "aperta", quantity: 3 };
const exportedList = {
  status: "chiusa",
  purchase_orders: [{ status: "inviato", danea_exported_at: "2026-11-25T21:42:54Z", purchase_order_items: [{ source_assignment_id: "quota" }] }],
  shopping_list_items: [{ excluded_at: null, decided_quantity: 5, decided_unit_id: null, decided_unit_code: null, manual_purchase_quantity: null, manual_purchase_done_at: null, shopping_list_item_suppliers: [{ id: "quota", deselected_at: null, assigned_quantity: 5 }] }],
};
describe("liste scaricate in Danea fuori dalla Lista della Spesa", () => {
  it("nasconde la lista chiusa già scaricata senza modificarne i dati", () => {
    const before = JSON.stringify(exportedList);
    assert.equal(shoppingListDownloaded(exportedList), true);
    assert.equal(JSON.stringify(exportedList), before);
  });
  it("nasconde anche una lista aperta interamente coperta da ordini scaricati", () => {
    assert.equal(shoppingListDownloaded({ ...exportedList, status: "aperta" }), true);
  });
  it("mantiene la lista se un ordine non è stato scaricato", () => {
    assert.equal(shoppingListDownloaded({ ...exportedList, purchase_orders: [...exportedList.purchase_orders, { status: "inviato", danea_exported_at: null, purchase_order_items: [] }] }), false);
  });
  it("mantiene quantità residue e acquisti diretti ancora da completare", () => {
    assert.equal(shoppingListDownloaded({ ...exportedList, status: "aperta", shopping_list_items: exportedList.shopping_list_items.map((item) => ({ ...item, decided_quantity: 6 })) }), false);
    assert.equal(shoppingListDownloaded({ ...exportedList, status: "aperta", shopping_list_items: exportedList.shopping_list_items.map((item) => ({ ...item, manual_purchase_quantity: 1 })) }), false);
  });
  it("non interpreta un invio o una lettura del fornitore come scarico Danea", () => {
    assert.equal(shoppingListDownloaded({ ...exportedList, purchase_orders: [{ status: "inviato", danea_exported_at: null, purchase_order_items: [] }] }), false);
    assert.equal(shoppingListDownloaded({ ...exportedList, purchase_orders: [] }), false);
  });
  it("non confronta 5 cassette decise con 5 kg equivalenti né indovina conversioni mancanti", () => {
    assert.equal(shoppingListDownloaded({ ...exportedList, status: "aperta", shopping_list_items: exportedList.shopping_list_items.map((item) => ({ ...item, decided_unit_code: "cs" })) }), false);
    assert.equal(shoppingListDownloaded({ ...exportedList, status: "aperta", shopping_list_items: exportedList.shopping_list_items.map((item) => ({ ...item, shopping_list_item_suppliers: [{ id: "quota", deselected_at: null, assigned_quantity: null }] })) }), false);
  });
  it("ignora ordini annullati ma non basta un annullato scaricato", () => {
    const cancelled = { status: "annullato", danea_exported_at: "2026-11-25T21:42:54Z", purchase_order_items: [] };
    assert.equal(shoppingListDownloaded({ ...exportedList, purchase_orders: [cancelled] }), false);
    assert.equal(shoppingListDownloaded({ ...exportedList, purchase_orders: [...exportedList.purchase_orders, { ...cancelled, danea_exported_at: null }] }), true);
  });
});
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
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveOrdinaryList, shoppingReadyState } from "./shopping-list-ready-state";

describe("nuovo acquisto indipendente dagli ordini precedenti", () => {
  it("mostra gli articoli e permette quantità senza lista aperta", () => {
    assert.deepEqual(shoppingReadyState(null, "archivio"), { showProducts: true, canPrepare: true, ordinaryPreview: true });
  });
  it("lo storico resta consultabile ma non modificabile", () => {
    assert.equal(shoppingReadyState({ status: "chiusa" }, "archivio").canPrepare, false);
  });
  it("non crea una lista alla lettura dello stato o al cambio vista", () => {
    const flight = { current: null };
    for (let i = 0; i < 5; i++) shoppingReadyState(null, "archivio");
    assert.equal(flight.current, null);
  });
  it("crea una sola lista al primo salvataggio anche con due card concorrenti", async () => {
    const flight = { current: null as Promise<string | null> | null };
    let creations = 0;
    const create = async () => { creations++; await Promise.resolve(); return "nuova-lista"; };
    const ids = await Promise.all([resolveOrdinaryList(null, flight, create), resolveOrdinaryList(null, flight, create)]);
    assert.deepEqual(ids, ["nuova-lista", "nuova-lista"]);
    assert.equal(creations, 1);
  });
  it("il secondo acquisto usa una lista nuova senza copiare la precedente", async () => {
    const previous = Object.freeze({ id: "precedente", quantity: 22, supplier: "fornitore" });
    const flight = { current: null as Promise<string | null> | null };
    const id = await resolveOrdinaryList(null, flight, async () => "seconda-lista");
    assert.notEqual(id, previous.id);
    assert.equal(previous.quantity, 22);
    assert.equal(shoppingReadyState(null, "archivio").canPrepare, true);
  });
  it("riusa la lista corrente nei salvataggi successivi", async () => {
    const flight = { current: null };
    const id = await resolveOrdinaryList("corrente", flight, async () => { throw new Error("non deve creare"); });
    assert.equal(id, "corrente");
  });
});
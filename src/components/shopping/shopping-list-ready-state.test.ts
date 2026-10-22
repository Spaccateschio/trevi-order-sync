import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generationCompleted, generationEntryState, initialGenerationStep, resolveOrdinaryList, shoppingReadyState } from "./shopping-list-ready-state";

describe("Genera ordini: prima il riepilogo", () => {
  it("una quantità mancante non apre il completamento automaticamente", () => {
    assert.equal(generationEntryState({ fetching: false, hasUnconfirmedDrafts: false, missingQuantityCount: 1 }), "review");
  });
  it("i numeri scritti non confermati restano protetti anche con quantità mancanti", () => {
    assert.equal(generationEntryState({ fetching: false, hasUnconfirmedDrafts: true, missingQuantityCount: 1 }), "drafts");
  });
  it("attende i dati aggiornati prima del riepilogo", () => {
    assert.equal(generationEntryState({ fetching: true, hasUnconfirmedDrafts: false, missingQuantityCount: 0 }), "wait");
  });
  it("la finestra parte dal riepilogo sia per generazione sia per bozze", () => {
    assert.equal(initialGenerationStep("genera"), "fornitori");
    assert.equal(initialGenerationStep("bozze"), "fornitori");
  });
});

describe("nuovo acquisto indipendente dagli ordini precedenti", () => {
  it("generazione riuscita apre il nuovo ciclo anche prima dell'invio o con invio fallito", () => {
    assert.equal(generationCompleted([{ kind: "da_condividere" }]), true);
    assert.equal(generationCompleted([{ kind: "errore_invio" }, { kind: "acquisto_diretto" }]), true);
  });
  it("generazione fallita, parziale o non effettuata non svuota la vista", () => {
    assert.equal(generationCompleted([{ kind: "errore_generazione" }]), false);
    assert.equal(generationCompleted([{ kind: "da_condividere" }, { kind: "errore_generazione" }]), false);
    assert.equal(generationCompleted([]), false);
  });
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
  it("due acquisti consecutivi allo stesso fornitore hanno liste distinte e conservano 5 kg precedenti", async () => {
    const previous = Object.freeze({ listId: "first", supplier: "supplier", quantity: 5 });
    const flight = { current: null as Promise<string | null> | null };
    const next = await resolveOrdinaryList(null, flight, async () => "second");
    const repeated = await resolveOrdinaryList(next, flight, async () => { throw new Error("duplicate"); });
    assert.equal(repeated, "second");
    assert.notEqual(next, previous.listId);
    assert.equal(previous.quantity, 5);
    assert.equal(previous.supplier, "supplier");
  });
});
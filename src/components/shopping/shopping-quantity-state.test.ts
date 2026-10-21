import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { catalogConfirmAction, confirmationQuantity, quantityHasDraft, createConfirmationGuard } from "./shopping-quantity-state";

describe("conferma esplicita quantità Lista", () => {
  it("usa l'ultimo valore scritto anziché la quantità salvata", () => {
    assert.equal(confirmationQuantity("7,5", 2), 7.5);
  });
  it("senza modifica conferma la quantità salvata", () => assert.equal(confirmationQuantity(undefined, 3), 3));
  it("quantità vuota non può essere confermata", () => assert.equal(confirmationQuantity("", 3), null));
  it("quantità negativa non può essere confermata", () => assert.equal(confirmationQuantity("-1", 3), null));
  it("zero esplicito è una decisione valida di non acquistare", () => assert.equal(confirmationQuantity("0", 3), 0));
  it("zero non equivale al campo vuoto", () => {
    assert.equal(confirmationQuantity("", null), null);
    assert.equal(confirmationQuantity("0", null), 0);
  });
  it("una modifica resta non confermata finché differisce dal salvato", () => assert.equal(quantityHasDraft("8", 3), true));
  it("valore uguale al salvato non è una modifica pendente", () => assert.equal(quantityHasDraft("3,0", 3), false));
  it("cancellare una quantità salvata è una modifica pendente", () => assert.equal(quantityHasDraft("", 3), true));
  it("impedisce due conferme contemporanee della stessa card", () => {
    const guard = createConfirmationGuard();
    assert.equal(guard.start("p1"), true);
    assert.equal(guard.start("p1"), false);
    assert.equal(guard.start("p2"), true);
    guard.finish("p1");
    assert.equal(guard.start("p1"), true);
  });
});

describe("card di catalogo: 0 + Conferma", () => {
  it("zero + Conferma decide «Non acquistare» senza scrivere righe", () => assert.equal(catalogConfirmAction(0), "non_acquistare"));
  it("quantità positiva aggiunge il prodotto alla Lista", () => assert.equal(catalogConfirmAction(2), "add"));
  it("campo vuoto o testo non valido non decide nulla", () => assert.equal(catalogConfirmAction(null), null));
});
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { finishMobileCard, toggleMobileCard, unlockSelectedProduct, useCompactCard } from "./shopping-mobile-card-state";

describe("accesso individuale alla modifica dal riepilogo", () => {
  it("sblocca solo il prodotto scelto senza cambiare lo stato precedente", () => {
    const current = new Set(["aglio"]);
    const next = unlockSelectedProduct(current, "patate");
    assert.deepEqual([...next], ["aglio", "patate"]);
    assert.equal(next.has("carote-non-acquistare"), false);
    assert.deepEqual([...current], ["aglio"]);
  });
  it("rientrare nello stesso prodotto non aggiunge altri sblocchi", () => {
    assert.deepEqual([...unlockSelectedProduct(new Set(["patate"]), "patate")], ["patate"]);
  });
});

describe("card compatte mobile: solo presentazione", () => {
  it("vista Card compatta sotto 768 px, non a 768 px", () => {
    assert.equal(useCompactCard(767, "card"), true);
    assert.equal(useCompactCard(768, "card"), false);
    assert.equal(useCompactCard(1280, "card"), false);
  });
  it("vista Righe mai compatta", () => assert.equal(useCompactCard(402, "row"), false));
  it("aprire una seconda card sostituisce la prima", () => assert.equal(toggleMobileCard("aglio", "carote"), "carote"));
  it("chiudere una card cambia solo l'identificativo aperto", () => assert.equal(toggleMobileCard("aglio", "aglio"), null));
  it("conferma riuscita richiude la card", () => assert.equal(finishMobileCard("aglio", "aglio", true), null));
  it("errore conserva la card aperta", () => assert.equal(finishMobileCard("aglio", "aglio", false), "aglio"));
  it("una conferma tardiva non chiude un'altra card", () => assert.equal(finishMobileCard("carote", "aglio", true), "carote"));
});
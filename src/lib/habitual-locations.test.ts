import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { habitualError, setPrimary, toggleHabitual } from "./habitual-locations";

describe("zone abituali", () => {
  it("un prodotto può avere più zone ma una sola principale", () => {
    let s = toggleHabitual({ ids: [], primaryId: null }, "frigo1");
    s = toggleHabitual(s, "magazzino");
    assert.deepEqual(s, { ids: ["frigo1", "magazzino"], primaryId: "frigo1" });
    s = setPrimary(s, "magazzino");
    assert.equal(s.primaryId, "magazzino");
  });

  it("rimuovendo la principale non ne assegna un'altra da solo e chiede la scelta", () => {
    const s = toggleHabitual({ ids: ["frigo1", "magazzino", "pozzetto"], primaryId: "frigo1" }, "frigo1");
    assert.equal(s.primaryId, null);
    assert.equal(habitualError(s), "Scegli la zona principale tra quelle rimaste");
  });

  it("la principale deve appartenere alle zone abituali", () => {
    assert.equal(setPrimary({ ids: ["frigo1"], primaryId: "frigo1" }, "frigo2").primaryId, "frigo1");
    assert.notEqual(habitualError({ ids: ["frigo1"], primaryId: "frigo2" }), null);
  });

  it("nessuna zona abituale è ammessa", () => {
    assert.equal(habitualError({ ids: [], primaryId: null }), null);
  });
});

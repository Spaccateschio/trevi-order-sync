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

import { buildHabitualMap, habitualFirst, matchesHabitual, NO_HABITUAL } from "./habitual-locations";

describe("filtro e ordinamento per zona abituale", () => {
  const map = buildHabitualMap([
    { product_id: "mela", location_id: "frigo1", is_primary: true },
    { product_id: "mela", location_id: "magazzino", is_primary: false },
    { product_id: "pera", location_id: "magazzino", is_primary: true },
  ]);
  // Due card dello stesso prodotto (due fornitori) seguono la stessa zona abituale.
  const cards = [
    { product_id: "kiwi", key: "k" },
    { product_id: "pera", key: "p" },
    { product_id: "mela", key: "m1" },
    { product_id: "mela", key: "m2" },
  ];

  it("senza filtro tutti i prodotti, anche senza zona, restano visibili", () => {
    assert.equal(cards.filter((c) => matchesHabitual(c.product_id, map, null)).length, 4);
  });
  it("zona abituale: tutte le card del prodotto associato", () => {
    assert.deepEqual(cards.filter((c) => matchesHabitual(c.product_id, map, "frigo1")).map((c) => c.key), ["m1", "m2"]);
  });
  it("«Senza zona abituale» mostra solo i prodotti non configurati", () => {
    assert.deepEqual(cards.filter((c) => matchesHabitual(c.product_id, map, NO_HABITUAL)).map((c) => c.key), ["k"]);
  });
  it("zona del conteggio scelta: prima gli abituali, gli altri restano contabili", () => {
    assert.deepEqual(habitualFirst(cards, map, "magazzino").map((c) => c.key), ["p", "m1", "m2", "k"]);
    assert.equal(habitualFirst(cards, map, "frigo2").length, 4);
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { autoAssignOverrides, checkQuotas, destinationFromToggles, parseCatalogDestination, quotaCartError } from "./catalog-destination";

const pool = [{ linkId: "a", name: "Breda" }, { linkId: "b", name: "Caffetteria" }];

test("un solo fornitore spuntato diventa il preferito e l'altro è tolto", () => {
  const d = destinationFromToggles(pool, ["b"], false);
  assert.deepEqual(d, { deselectedLinks: ["a"], preferLinkId: "b", direct: false, labels: ["Caffetteria"] });
  assert.deepEqual(autoAssignOverrides(d), { extraDeselected: ["a"], preferLinkId: "b" });
});

test("solo acquisto diretto: tutta la quantità a me", () => {
  const d = destinationFromToggles(pool, [], true);
  assert.deepEqual(autoAssignOverrides(d), { extraDeselected: ["a", "b"], forceDirect: true });
});

test("acquisto diretto non toglie la spunta ai fornitori e divide in parti uguali", () => {
  const d = destinationFromToggles(pool, ["a", "b"], true, { total: 9, unitCode: "kg" });
  assert.deepEqual(d.labels, ["Breda", "Caffetteria", "Acquisto diretto"]);
  assert.deepEqual(d.quotas?.map((q) => q.quantity), ["3", "3", "3"]);
  assert.deepEqual(autoAssignOverrides(d), { extraDeselected: [], explicitQuotas: [
    { target: "a", quantity: 3, unitCode: "kg" }, { target: "b", quantity: 3, unitCode: "kg" }, { target: "direct", quantity: 3, unitCode: "kg" },
  ] });
});

test("quote già scritte restano se le destinazioni non cambiano", () => {
  const previous = [{ target: "a", quantity: "5", unitCode: "kg" }, { target: "direct", quantity: "1", unitCode: "kg" }];
  const d = destinationFromToggles(pool, ["a"], true, { total: 6, unitCode: "kg", previous });
  assert.deepEqual(d.quotas, previous);
});

test("somma nella stessa U.M.: deve tornare il totale", () => {
  const q = [{ target: "a", quantity: "4", unitCode: "kg" }, { target: "b", quantity: "1", unitCode: "KG" }];
  assert.deepEqual(checkQuotas(q, 5, "kg"), { kind: "ok" });
  assert.deepEqual(checkQuotas(q, 6, "kg"), { kind: "somma_diversa", sum: 5 });
  assert.equal(quotaCartError({ deselectedLinks: [], preferLinkId: null, direct: false, labels: [], quotas: q }, 6, "kg"), "Le quote fanno 5, il totale è 6");
});

test("U.M. diverse: mai sommare kg e casse, solo da verificare", () => {
  const q = [{ target: "a", quantity: "2", unitCode: "cs" }, { target: "b", quantity: "3", unitCode: "kg" }];
  assert.deepEqual(checkQuotas(q, 10, "kg"), { kind: "da_verificare" });
  assert.equal(quotaCartError({ deselectedLinks: [], preferLinkId: null, direct: false, labels: [], quotas: q }, 10, "kg"), null);
});

test("quota vuota blocca il Conferma di quel prodotto", () => {
  const q = [{ target: "a", quantity: "", unitCode: "kg" }, { target: "b", quantity: "3", unitCode: "kg" }];
  assert.deepEqual(checkQuotas(q, 3, "kg"), { kind: "incompleta" });
});

test("senza scelta nessuna modifica alla scelta automatica", () => {
  assert.deepEqual(autoAssignOverrides(undefined), {});
});

test("bozza non valida viene ignorata", () => {
  assert.equal(parseCatalogDestination("x"), undefined);
  assert.deepEqual(parseCatalogDestination({ deselectedLinks: ["a", 3], direct: "si" }), { deselectedLinks: ["a"], preferLinkId: null, direct: false, labels: [] });
});

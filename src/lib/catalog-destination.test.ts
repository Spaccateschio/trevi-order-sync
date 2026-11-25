import { test } from "node:test";
import assert from "node:assert/strict";
import { autoAssignOverrides, destinationFromToggles, parseCatalogDestination } from "./catalog-destination";

const pool = [{ linkId: "a", name: "Breda" }, { linkId: "b", name: "Caffetteria" }];

test("un solo fornitore spuntato diventa il preferito e l'altro è tolto", () => {
  const d = destinationFromToggles(pool, ["b"], false);
  assert.deepEqual(d, { deselectedLinks: ["a"], preferLinkId: "b", direct: false, labels: ["Caffetteria"] });
  assert.deepEqual(autoAssignOverrides(d), { extraDeselected: ["a"], preferLinkId: "b" });
});

test("acquisto diretto toglie tutti i fornitori e forza il diretto", () => {
  const d = destinationFromToggles(pool, ["a", "b"], true);
  assert.deepEqual(d.deselectedLinks, ["a", "b"]);
  assert.deepEqual(d.labels, ["Acquisto diretto"]);
  assert.deepEqual(autoAssignOverrides(d), { extraDeselected: ["a", "b"], forceDirect: true });
});

test("due fornitori spuntati: nessun preferito, scelta automatica tra i due", () => {
  const d = destinationFromToggles(pool, ["a", "b"], false);
  assert.equal(d.preferLinkId, null);
  assert.deepEqual(d.labels, ["Breda", "Caffetteria"]);
});

test("senza scelta nessuna modifica alla scelta automatica", () => {
  assert.deepEqual(autoAssignOverrides(undefined), {});
});

test("bozza non valida viene ignorata", () => {
  assert.equal(parseCatalogDestination("x"), undefined);
  assert.deepEqual(parseCatalogDestination({ deselectedLinks: ["a", 3], direct: "si" }), { deselectedLinks: ["a"], preferLinkId: null, direct: false, labels: [] });
});

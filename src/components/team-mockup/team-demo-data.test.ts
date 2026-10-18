import { test } from "node:test";
import assert from "node:assert/strict";
import { combinePresets } from "./team-demo-data";

test("preparatore non vede inventario né ordini", () => {
  const { permissions } = combinePresets(["preparatore"]);
  assert.deepEqual(permissions.inventario, []);
  assert.deepEqual(permissions.ordini, []);
  assert.ok(permissions.preparazione.includes("stampare"));
});
test("profili combinabili: preparatore + trasportatore sommano le aree", () => {
  const { permissions } = combinePresets(["preparatore", "trasportatore"]);
  assert.ok(permissions.preparazione.includes("confermare"));
  assert.ok(permissions.consegne.includes("confermare"));
});
test("compratore invia ordini ma non gestisce fornitori", () => {
  const r = combinePresets(["compratore"]);
  assert.ok(r.permissions.ordini.includes("inviare"));
  assert.equal(r.extras.gestioneFornitori, false);
});
test("magazziniere non vede i prezzi", () => {
  assert.equal(combinePresets(["magazziniere"]).extras.prezzi, false);
});

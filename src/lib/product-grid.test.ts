import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { defaultGridPreferences } from "./product-grid";

describe("defaultGridPreferences", () => {
  it("ordina i prodotti in ordine alfabetico per descrizione quando l'utente non ha scelto un ordinamento", () => {
    assert.deepEqual(defaultGridPreferences().sorting, [{ id: "description", desc: false }]);
    assert.deepEqual(defaultGridPreferences(["code", "description"]).sorting, [{ id: "description", desc: false }]);
  });
});

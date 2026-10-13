import { describe, expect, it } from "vitest";
import { defaultGridPreferences } from "./product-grid";

describe("defaultGridPreferences", () => {
  it("ordina i prodotti in ordine alfabetico per descrizione quando l'utente non ha scelto un ordinamento", () => {
    expect(defaultGridPreferences().sorting).toEqual([{ id: "description", desc: false }]);
    expect(defaultGridPreferences(["code", "description"]).sorting).toEqual([{ id: "description", desc: false }]);
  });
});

import { describe, expect, it } from "bun:test";
import { countedLabel, selectPrintRows, type InventoryPrintRow } from "./inventory-print";

const row = (p: Partial<InventoryPrintRow>): InventoryPrintRow => ({
  code: "0", name: "X", zone: "Magazzino", favorite: true, stockUnit: "kg",
  calculated: null, counted: null, countedUnit: null, difference: null, note: "", ...p,
});

describe("stampa inventario", () => {
  const rows = [row({ name: "Zucca" }), row({ name: "Aglio", counted: 5 }), row({ name: "Banana", favorite: false })];
  it("rapida e dettagliata: solo preferiti in ordine alfabetico", () => {
    expect(selectPrintRows(rows, "rapida").map((r) => r.name)).toEqual(["Aglio", "Zucca"]);
    expect(selectPrintRows(rows, "dettagliata").map((r) => r.name)).toEqual(["Aglio", "Zucca"]);
  });
  it("completa: anche i non preferiti", () => {
    expect(selectPrintRows(rows, "completa").map((r) => r.name)).toEqual(["Aglio", "Banana", "Zucca"]);
  });
  it("non contato resta vuoto, mai 0", () => {
    expect(countedLabel(row({}))).toBe("");
    expect(countedLabel(row({ counted: 5 }))).toBe("5 kg");
  });
});

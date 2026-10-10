import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { countedLabel, printName, selectPrintRows, type InventoryPrintRow } from "./inventory-print";

const row = (p: Partial<InventoryPrintRow>): InventoryPrintRow => ({
  code: "0", name: "X", zone: "Magazzino", favorite: true, stockUnit: "kg",
  calculated: null, counted: null, countedUnit: null, difference: null, note: "", ...p,
});

describe("stampa inventario", () => {
  const rows = [row({ name: "Zucca" }), row({ name: "Aglio", counted: 5 }), row({ name: "Banana", favorite: false })];
  it("rapida e dettagliata: solo preferiti in ordine alfabetico", () => {
    assert.deepEqual(selectPrintRows(rows, "rapida").map((r) => r.name), ["Aglio", "Zucca"]);
    assert.deepEqual(selectPrintRows(rows, "dettagliata").map((r) => r.name), ["Aglio", "Zucca"]);
  });
  it("completa: anche i non preferiti", () => {
    assert.deepEqual(selectPrintRows(rows, "completa").map((r) => r.name), ["Aglio", "Banana", "Zucca"]);
  });
  it("non contato resta vuoto, mai 0", () => {
    assert.equal(countedLabel(row({})), "");
    assert.equal(countedLabel(row({ counted: 5 })), "5 kg");
  });
});

describe("stampa per card", () => {
  const row = (card: string | null, counted: number): InventoryPrintRow => ({
    code: "A1", name: "AGLIO", zone: "Magazzino", card, favorite: true, stockUnit: "kg",
    calculated: null, counted, countedUnit: null, difference: null, note: "",
  });
  it("una riga per card, «Senza fornitore» per ultima", () => {
    const rows = selectPrintRows([row("Senza fornitore", 15), row("Beta", 2), row("Alfa", 9)], "completa");
    assert.deepEqual(rows.map((r) => r.card), ["Alfa", "Beta", "Senza fornitore"]);
  });
  it("il nome stampato contiene il fornitore della card", () => {
    assert.equal(printName(row("Alfa", 9)), "AGLIO — Alfa");
  });
});

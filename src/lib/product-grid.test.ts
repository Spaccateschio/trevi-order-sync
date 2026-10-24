import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { sortProducts, type ProductRow } from "@/lib/product-grid";

/** Riga minima: interessano solo codice, descrizione e la colonna usata per ordinare. */
const row = (id: string, code: string, description: string | null, extra: Record<string, unknown> = {}) =>
  ({ id, code, description, ...extra }) as unknown as ProductRow;

const order = (products: ProductRow[], columnId: string, desc = false) =>
  sortProducts(products, [{ id: columnId, desc }], new Map()).map((product) => product.description ?? product.code);

const noSort = (products: ProductRow[]) => sortProducts(products, [], new Map()).map((product) => product.description ?? product.code);

describe("ordine della pagina Prodotti", () => {
  const byDescription = [
    row("3", "0003", "Zucchine IT"),
    row("1", "0001", "Aglio SPAGNA"),
    row("2", "0002", "Melanzane IT"),
  ];

  it("colonna Descrizione: elenco A–Z, non per codice", () => {
    assert.deepEqual(order(byDescription, "description"), ["Aglio SPAGNA", "Melanzane IT", "Zucchine IT"]);
  });

  it("colonna Descrizione con freccia inversa: elenco Z–A", () => {
    assert.deepEqual(order(byDescription, "description", true), ["Zucchine IT", "Melanzane IT", "Aglio SPAGNA"]);
  });

  it("stesso valore nella colonna scelta: si legge in ordine A–Z per descrizione", () => {
    const sameUnits = [
      row("c", "0100", "Carote IT", { sale_units: [{ code: "kg", is_default: true, needs_review: false }] }),
      row("a", "0050", "Aglio SPAGNA", { sale_units: [{ code: "kg", is_default: true, needs_review: false }] }),
      row("b", "0090", "Basilico IT", { sale_units: [{ code: "kg", is_default: true, needs_review: false }] }),
    ];
    assert.deepEqual(order(sameUnits, "sale_units"), ["Aglio SPAGNA", "Basilico IT", "Carote IT"]);
  });

  it("stessa categoria: i prodotti restano A–Z dentro la categoria", () => {
    const sameCategory = [
      row("c", "0001", "Zucchine IT", { category: "Ortoggi" }),
      row("a", "0002", "Aglio SPAGNA", { category: "Ortoggi" }),
      row("b", "0003", "Melanzane IT", { category: "Frutta" }),
    ];
    assert.deepEqual(order(sameCategory, "category"), ["Aglio SPAGNA", "Zucchine IT", "Melanzane IT"]);
  });

  it("prodotti senza valore nella colonna scelta: ultimi", () => {
    const missing = [
      row("x", "0001", "Prodotto senza categoria", { category: null }),
      row("y", "0002", "Aglio SPAGNA", { category: "Ortoggi" }),
    ];
    assert.deepEqual(order(missing, "category"), ["Aglio SPAGNA", "Prodotto senza categoria"]);
  });

  it("nessuna colonna scelta: resta l'ordine ricevuto (già A–Z per descrizione)", () => {
    assert.deepEqual(noSort(byDescription), ["Zucchine IT", "Aglio SPAGNA", "Melanzane IT"]);
  });
});

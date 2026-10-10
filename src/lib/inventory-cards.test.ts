import { describe, expect, it } from "vitest";

import { cardKey, compareCards, parseCardKey, productCardTotal } from "./inventory-cards";

const base = { product_id: "p", location_id: "l" };

describe("card inventario", () => {
  it("la card «Senza fornitore» ha una chiave diversa da ogni collegamento", () => {
    expect(cardKey("p", "l", null)).not.toBe(cardKey("p", "l", "a"));
    expect(parseCardKey(cardKey("p", "l", null))).toEqual({ productId: "p", locationId: "l", linkId: null });
    expect(parseCardKey(cardKey("p", "l", "a"))?.linkId).toBe("a");
  });

  it("ordine: stella, attivi A→Z, scollegati, senza fornitore", () => {
    const rows = [
      { ...base, product_supplier_link_id: null },
      { ...base, product_supplier_link_id: "x", supplier_name: "Zeta", link_active: false },
      { ...base, product_supplier_link_id: "b", supplier_name: "Beta", link_active: true },
      { ...base, product_supplier_link_id: "a", supplier_name: "Alfa", link_active: true },
      { ...base, product_supplier_link_id: "s", supplier_name: "Zorro", link_active: true, card_favorite: true },
    ];
    expect([...rows].sort(compareCards).map((r) => r.product_supplier_link_id)).toEqual(["s", "a", "b", "x", null]);
  });

  it("totale solo con U.M. uguali, mai convertito", () => {
    expect(productCardTotal([
      { ...base, counted: 9, counted_unit_code: "kg" },
      { ...base, counted: 15, counted_unit_code: "KG" },
    ])).toMatchObject({ total: 24 });
    expect(productCardTotal([
      { ...base, counted: 9, counted_unit_code: "kg" },
      { ...base, counted: 2, counted_unit_code: "cas" },
    ])).toEqual({ total: null, reason: "um_diverse" });
    expect(productCardTotal([{ ...base, counted: null }])).toEqual({ total: null, reason: "nessun_conteggio" });
  });

  it("lo zero contato entra nel totale", () => {
    expect(productCardTotal([{ ...base, counted: 0, stock_unit_code: "kg" }])).toMatchObject({ total: 0 });
  });
});

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { cardKey, compareCards, parseCardKey, productCardTotal } from "./inventory-cards";

const base = { product_id: "p", location_id: "l" };

describe("card inventario", () => {
  it("la card «Senza fornitore» ha una chiave diversa da ogni collegamento", () => {
    assert.notEqual(cardKey("p", "l", null), cardKey("p", "l", "a"));
    assert.deepEqual(parseCardKey(cardKey("p", "l", null)), { productId: "p", locationId: "l", linkId: null });
    assert.equal(parseCardKey(cardKey("p", "l", "a"))?.linkId, "a");
  });

  it("ordine: stella, attivi A→Z, scollegati, senza fornitore", () => {
    const rows = [
      { ...base, product_supplier_link_id: null },
      { ...base, product_supplier_link_id: "x", supplier_name: "Zeta", link_active: false },
      { ...base, product_supplier_link_id: "b", supplier_name: "Beta", link_active: true },
      { ...base, product_supplier_link_id: "a", supplier_name: "Alfa", link_active: true },
      { ...base, product_supplier_link_id: "s", supplier_name: "Zorro", link_active: true, card_favorite: true },
    ];
    assert.deepEqual([...rows].sort(compareCards).map((r) => r.product_supplier_link_id), ["s", "a", "b", "x", null]);
  });

  it("totale solo con U.M. uguali, mai convertito", () => {
    assert.equal(productCardTotal([
      { ...base, counted: 9, counted_unit_code: "kg" },
      { ...base, counted: 15, counted_unit_code: "KG" },
    ]).total, 24);
    assert.deepEqual(productCardTotal([
      { ...base, counted: 9, counted_unit_code: "kg" },
      { ...base, counted: 2, counted_unit_code: "cas" },
    ]), { total: null, reason: "um_diverse" });
    assert.deepEqual(productCardTotal([{ ...base, counted: null }]), { total: null, reason: "nessun_conteggio" });
  });

  it("lo zero contato entra nel totale", () => {
    assert.equal(productCardTotal([{ ...base, counted: 0, stock_unit_code: "kg" }]).total, 0);
  });
});

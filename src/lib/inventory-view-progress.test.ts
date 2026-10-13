import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { cardPercentage, selectInventoryCards, summarizeCards, type FilterableCard } from "./inventory-print";

const card = (id: string, counted: number | null, fav: boolean, link = "a"): FilterableCard => ({
  product_id: id, location_id: "l", location_name: "L", code: id, description: id, category: null, subcategory: null,
  is_favorite: fav, card_favorite: fav, counted, difference: null, recount_requested_at: null, product_supplier_link_id: link,
} as unknown as FilterableCard);

describe("contatore vista attuale inventario", () => {
  it("quantità zero confermata = contata", () => {
    assert.equal(summarizeCards([card("p1", 0, false)]).confirmed, 1);
  });
  it("senza quantità confermata (bozza) = mancante", () => {
    const s = summarizeCards([card("p1", null, false)]);
    assert.equal(s.confirmed, 0); assert.equal(s.pending, 1);
  });
  it("due fornitori = due card distinte, un prodotto", () => {
    const s = summarizeCards([card("p1", 3, false, "a"), card("p1", null, false, "b")]);
    assert.equal(s.cards, 2); assert.equal(s.products, 1); assert.equal(s.pending, 1);
  });
  it("percentuale 1 su 4 = 25%, 0 card = 0%", () => {
    assert.equal(cardPercentage({ cards: 4, confirmed: 1 }), 25);
    assert.equal(cardPercentage({ cards: 0, confirmed: 0 }), 0);
  });
  it("Tutti comprende i preferiti; Preferiti solo i preferiti", () => {
    const rows = [card("p1", 1, true), card("p2", null, false)];
    const all = selectInventoryCards(rows, { view: "all", work: "all", search: "", locationId: null, category: null, subcategory: null, supplier: null });
    assert.equal(all.length, 2);
    const fav = selectInventoryCards(rows, { view: "favorites", work: "all", search: "", locationId: null, category: null, subcategory: null, supplier: null });
    assert.equal(fav.length, 1);
  });
});

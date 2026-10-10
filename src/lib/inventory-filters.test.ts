import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  buildInventoryPrintHtml, findSearchElsewhere, selectInventoryCards, selectPrintRows, summarizeCards,
  type FilterableCard, type InventoryCardFilters,
} from "./inventory-print";

type Card = FilterableCard & { id: string; supplier: string };
const card = (p: Partial<Card> & { id: string }): Card => ({
  product_id: "P-AGLIO", location_id: "Z1", location_name: "Magazzino 1", code: "A1", description: "AGLIO SPAGNA",
  category: "Ortaggi", subcategory: null, is_favorite: false, card_favorite: false, counted: null, difference: null,
  recount_requested_at: null, stock_unit_missing: false, units_comparable: true, supplier: "Senza fornitore", ...p,
});
const supplierOf = (row: Card) => row.supplier;
const all: InventoryCardFilters = { view: "all", work: "all", search: "", locationId: null, category: null, subcategory: null, supplier: null };
const ids = (rows: Card[]) => rows.map((r) => r.id).sort();

// Sessione: AGLIO con 3 card (fornitore attivo con stella card, fornitore scollegato, «Senza fornitore») + PATATE in altra zona.
const session: Card[] = [
  card({ id: "aglio-alfa", supplier: "Alfa", card_favorite: true, counted: 9, difference: 0 }),
  card({ id: "aglio-beta", supplier: "Beta (scollegato)", counted: 2, difference: -1 }),
  card({ id: "aglio-senza" }),
  card({ id: "patate", product_id: "P-PAT", code: "B7", description: "PATATE", location_id: "Z2", location_name: "Magazzino 2", is_favorite: true, category: "Tuberi", supplier: "Alfa" }),
];

describe("filtri inventario — regola unica delle card", () => {
  it("1. Preferiti: stella prodotto o della singola card, nessuna stella estesa alle altre card", () => {
    assert.deepEqual(ids(selectInventoryCards(session, { ...all, view: "favorites" }, supplierOf)), ["aglio-alfa", "patate"]);
  });
  it("1. Tutti: tutte le card della sessione", () => {
    assert.equal(selectInventoryCards(session, all, supplierOf).length, 4);
  });
  it("2. stati singoli", () => {
    assert.deepEqual(ids(selectInventoryCards(session, { ...all, work: "pending" }, supplierOf)), ["aglio-senza", "patate"]);
    assert.deepEqual(ids(selectInventoryCards(session, { ...all, work: "completed" }, supplierOf)), ["aglio-alfa", "aglio-beta"]);
    assert.deepEqual(ids(selectInventoryCards(session, { ...all, work: "differences" }, supplierOf)), ["aglio-beta"]);
  });
  it("3. ricerca combinata con zona, categoria e fornitore (la ricerca non annulla più la zona)", () => {
    assert.deepEqual(ids(selectInventoryCards(session, { ...all, search: "aglio", locationId: "Z1", category: "Ortaggi", supplier: "Alfa" }, supplierOf)), ["aglio-alfa"]);
    assert.equal(selectInventoryCards(session, { ...all, search: "patate", locationId: "Z1" }, supplierOf).length, 0);
    assert.deepEqual(ids(selectInventoryCards(session, { ...all, view: "favorites", locationId: "Z1", search: "AGLIO" }, supplierOf)), ["aglio-alfa"]);
  });
  it("3. ricerca per codice", () => {
    assert.deepEqual(ids(selectInventoryCards(session, { ...all, search: "b7" }, supplierOf)), ["patate"]);
  });
  it("4. ricerca senza risultati: indica la zona dove si trova", () => {
    const found = findSearchElsewhere(session, { ...all, search: "patate", locationId: "Z1" }, supplierOf);
    assert.deepEqual(found, { reasons: ["location"], locations: [{ id: "Z2", name: "Magazzino 2" }] });
  });
  it("4. escluso da Preferiti: il motivo è il filtro, non la zona", () => {
    const found = findSearchElsewhere(session.filter((r) => r.id !== "aglio-alfa"), { ...all, view: "favorites", search: "aglio", locationId: "Z1" }, supplierOf);
    assert.deepEqual(found?.reasons, ["view"]);
  });
  it("4. nessuna corrispondenza: nessuna zona inventata", () => {
    assert.equal(findSearchElsewhere(session, { ...all, search: "kiwi" }, supplierOf), null);
  });
  it("5–6. card multiple: fornitore attivo, scollegato e «Senza fornitore» filtrabili separatamente", () => {
    assert.deepEqual(ids(selectInventoryCards(session, { ...all, supplier: "Senza fornitore" }, supplierOf)), ["aglio-senza"]);
    assert.deepEqual(ids(selectInventoryCards(session, { ...all, supplier: "Beta (scollegato)" }, supplierOf)), ["aglio-beta"]);
  });
  it("9. card e prodotti distinti contati separatamente", () => {
    const s = summarizeCards(selectInventoryCards(session, { ...all, locationId: "Z1" }, supplierOf));
    assert.deepEqual(s, { cards: 3, products: 1, confirmed: 2, pending: 1, differences: 1 });
  });
  it("10. coerenza: riepilogo e stampa vista attuale usano le stesse card dell'elenco", () => {
    const shown = selectInventoryCards(session, { ...all, view: "favorites" }, supplierOf);
    const printRows = shown.map((r) => ({ code: r.code, name: r.description ?? "", zone: r.location_name, card: r.supplier, favorite: true,
      stockUnit: "kg", calculated: null, counted: r.counted, countedUnit: null, difference: r.difference, note: "" }));
    assert.equal(summarizeCards(shown).cards, selectPrintRows(printRows, "rapida").length);
    assert.equal(selectPrintRows(printRows, "dettagliata").length, 2);
  });
  it("7–8. stampa: perimetro dichiarato, card e prodotti separati", () => {
    const html = buildInventoryPrintHtml([
      { code: "A1", name: "AGLIO", zone: "M1", card: "Alfa", favorite: false, stockUnit: "kg", calculated: null, counted: 9, countedUnit: null, difference: null, note: "" },
      { code: "A1", name: "AGLIO", zone: "M1", card: "Senza fornitore", favorite: false, stockUnit: "kg", calculated: null, counted: 3, countedUnit: "cassa", difference: null, note: "" },
    ], "completa", { title: "Inventario", subtitle: "x", scope: "tutte le card della sessione" });
    assert.match(html, /2 card · 1 prodotti/);
    assert.match(html, /Perimetro: tutte le card della sessione/);
    assert.match(html, /3 cassa/);
    assert.doesNotMatch(html, /12/);
  });
  it("11. card nascoste dai filtri restano da controllare (la conferma usa l'intera sessione)", () => {
    const hidden = session.filter((r) => !selectInventoryCards(session, { ...all, view: "favorites" }, supplierOf).includes(r));
    assert.ok(hidden.some((r) => r.counted === null));
    assert.equal(summarizeCards(session).pending, 2);
  });
});

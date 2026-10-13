import { test } from "node:test";
import assert from "node:assert/strict";
import { columnAllowedForCaps, detailTabsFor, productsViewRedirect, resolveDetailTab } from "./products-view";

const buyOnly = { buys: true, sells: false };
const sellOnly = { buys: false, sells: true };
const both = { buys: true, sells: true };

test("solo Acquisti: niente scheda Vendita, Inventario resta", () => {
  assert.deepEqual(detailTabsFor(buyOnly), ["prodotto", "acquisto", "inventario"]);
});
test("solo Vendite: niente scheda Acquisto, Inventario resta", () => {
  assert.deepEqual(detailTabsFor(sellOnly), ["prodotto", "vendita", "inventario"]);
});
test("Acquisti + Vendite: tutte le schede", () => {
  assert.deepEqual(detailTabsFor(both), ["prodotto", "vendita", "acquisto", "inventario"]);
});
test("scheda richiesta non disponibile apre Prodotto; Inventario sempre", () => {
  assert.equal(resolveDetailTab("vendita", buyOnly), "prodotto");
  assert.equal(resolveDetailTab("acquisto", sellOnly), "prodotto");
  assert.equal(resolveDetailTab("inventario", buyOnly), "inventario");
  assert.equal(resolveDetailTab("inventario", sellOnly), "inventario");
});
test("colonne di vendita assenti per chi acquista soltanto", () => {
  for (const id of ["sale_units", "default_sale_unit", "price_1", "b2b_visible", "status"]) assert.equal(columnAllowedForCaps(id, buyOnly), false);
  assert.equal(columnAllowedForCaps("purchase_units", buyOnly), true);
  assert.equal(columnAllowedForCaps("danea_um", buyOnly), true);
});
test("colonne di acquisto assenti per chi vende soltanto", () => {
  for (const id of ["suppliers", "purchase_units", "preferred_supplier", "purchase_cost"]) assert.equal(columnAllowedForCaps(id, sellOnly), false);
  assert.equal(columnAllowedForCaps("price_1", sellOnly), true);
});
test("rimandi degli indirizzi diretti senza cicli", () => {
  assert.equal(productsViewRedirect("vendite", buyOnly), "acquisti");
  assert.equal(productsViewRedirect("acquisti", sellOnly), "vendite");
  assert.equal(productsViewRedirect("acquisti", both), null);
  assert.equal(productsViewRedirect("vendite", both), null);
  assert.equal(productsViewRedirect("acquisti", { buys: false, sells: false }), null);
});

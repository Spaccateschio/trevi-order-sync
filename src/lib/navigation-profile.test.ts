import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isPathAllowedForProfile } from "./navigation";

const soloCompra = { buys: true, sells: false };
const soloVende = { buys: false, sells: true };
const entrambi = { buys: true, sells: true };

describe("pagine per profilo aziendale", () => {
  test("chi non vende non apre Vendite, Preparazione, Consegne e Danea", () => {
    for (const p of ["/vendite", "/vendite/clienti", "/vendite/ordini-clienti", "/vendite/prodotti", "/operativo", "/consegne", "/danea"]) {
      assert.equal(isPathAllowedForProfile(p, soloCompra), false);
    }
  });
  test("chi non compra non apre Acquisti", () => {
    for (const p of ["/acquisti", "/acquisti/lista-spesa", "/acquisti/catalogo/x/y"]) {
      assert.equal(isPathAllowedForProfile(p, soloVende), false);
    }
  });
  test("chi compra e vende apre tutto", () => {
    for (const p of ["/vendite/clienti", "/danea", "/acquisti/ordini", "/consegne"]) {
      assert.equal(isPathAllowedForProfile(p, entrambi), true);
    }
  });
  test("pagine comuni sempre aperte", () => {
    for (const p of ["/dashboard", "/collegamenti", "/amministrazione", "/account"]) {
      assert.equal(isPathAllowedForProfile(p, soloCompra), true);
      assert.equal(isPathAllowedForProfile(p, soloVende), true);
    }
  });
});

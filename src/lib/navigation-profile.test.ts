import { describe, expect, test } from "bun:test";
import { isPathAllowedForProfile } from "./navigation";

const soloCompra = { buys: true, sells: false };
const soloVende = { buys: false, sells: true };
const entrambi = { buys: true, sells: true };

describe("pagine per profilo aziendale", () => {
  test("chi non vende non apre Vendite, Preparazione, Consegne e Danea", () => {
    for (const p of ["/vendite", "/vendite/clienti", "/vendite/ordini-clienti", "/vendite/prodotti", "/operativo", "/consegne", "/danea"]) {
      expect(isPathAllowedForProfile(p, soloCompra)).toBe(false);
    }
  });
  test("chi non compra non apre Acquisti", () => {
    for (const p of ["/acquisti", "/acquisti/lista-spesa", "/acquisti/catalogo/x/y"]) {
      expect(isPathAllowedForProfile(p, soloVende)).toBe(false);
    }
  });
  test("chi compra e vende apre tutto", () => {
    for (const p of ["/vendite/clienti", "/danea", "/acquisti/ordini", "/consegne"]) {
      expect(isPathAllowedForProfile(p, entrambi)).toBe(true);
    }
  });
  test("pagine comuni sempre aperte", () => {
    for (const p of ["/dashboard", "/collegamenti", "/amministrazione", "/account"]) {
      expect(isPathAllowedForProfile(p, soloCompra)).toBe(true);
      expect(isPathAllowedForProfile(p, soloVende)).toBe(true);
    }
  });
});

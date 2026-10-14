import { describe, it as test } from "node:test";
import assert from "node:assert/strict";
const expect = (v: unknown) => ({ toBe: (x: unknown) => assert.equal(v, x), toBeNull: () => assert.equal(v, null) });

import { directLineTotal, directTotals, quotaChanged } from "./direct-purchase";

describe("Acquisto diretto: totali", () => {
  test("stessa U.M.: totale riga = quantità × prezzo", () => {
    expect(directLineTotal({ quantity: 2.5, unitId: "kg", unitPrice: 3, priceUnitId: "kg" })).toBe(7.5);
  });
  test("U.M. diverse senza conversione verificata: totale non calcolabile", () => {
    expect(directLineTotal({ quantity: 2, unitId: "cs", unitPrice: 3, priceUnitId: "kg" })).toBeNull();
  });
  test("totale pagato diverso dalla somma: differenza mostrata, non bloccata", () => {
    const r = directTotals(
      [
        { quantity: 2.5, unitId: "kg", unitPrice: 3, priceUnitId: "kg" },
        { quantity: 1, unitId: "cs", unitPrice: 4, priceUnitId: "kg" },
      ],
      10,
    );
    expect(r.sum).toBe(7.5);
    expect(r.notComputable).toBe(1);
    expect(r.difference).toBe(2.5);
  });
  test("quota della Lista cambiata dopo la bozza viene segnalata", () => {
    expect(quotaChanged({ quantity: 2, unitId: "kg" }, { quantity: 3, unitId: "kg" })).toBe(true);
    expect(quotaChanged({ quantity: 2, unitId: "kg" }, { quantity: 2, unitId: "kg" })).toBe(false);
    expect(quotaChanged({ quantity: 2, unitId: "kg" }, null)).toBe(true);
  });
});

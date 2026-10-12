import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { planLineEdit } from "./order-line-edit";

const units = [
  { unit_id: "cs", code: "cs", conversion_factor: null },
  { unit_id: "mz", code: "mz", conversion_factor: null },
  { unit_id: "kg", code: "kg", conversion_factor: 1 },
];
const has = (o: object, e: Record<string, unknown>) => {
  for (const [k, v] of Object.entries(e)) assert.equal((o as Record<string, unknown>)[k], v);
};
const base = { currentQuantity: 3, currentUnitId: "cs", currentCode: "cs", units, coverageConfirmed: false, inOrder: false };

describe("matita Genera ordini", () => {
  it("3 cs → 3 mz senza conversione chiede conferma esplicita", () => {
    const p = planLineEdit({ ...base, nextQuantityText: "3", nextUnitId: "mz" });
    has(p, { kind: "save", needsUnitWarning: true, fromCode: "cs", toCode: "mz" });
  });
  it("solo quantità diversa: nessun avviso U.M.", () => {
    has(planLineEdit({ ...base, nextQuantityText: "4", nextUnitId: "cs" }), { kind: "save", needsUnitWarning: false });
  });
  it("U.M. con conversione valida: nessun avviso", () => {
    has(planLineEdit({ ...base, nextQuantityText: "3", nextUnitId: "kg" }), { needsUnitWarning: false });
  });
  it("conferma già data: va tolta prima di salvare", () => {
    has(planLineEdit({ ...base, coverageConfirmed: true, nextQuantityText: "3", nextUnitId: "mz" }), { revokeFirst: true });
  });
  it("nulla cambiato: nessun salvataggio", () => {
    assert.equal(planLineEdit({ ...base, nextQuantityText: "3", nextUnitId: "cs" }).kind, "unchanged");
  });
  it("U.M. non venduta dal fornitore o quantità 0: rifiutato", () => {
    assert.equal(planLineEdit({ ...base, nextQuantityText: "3", nextUnitId: "pz" }).kind, "invalid");
    assert.equal(planLineEdit({ ...base, nextQuantityText: "0", nextUnitId: "cs" }).kind, "invalid");
  });
  it("quota già in un ordine: non modificabile", () => {
    assert.equal(planLineEdit({ ...base, inOrder: true, nextQuantityText: "4", nextUnitId: "cs" }).kind, "invalid");
  });
});

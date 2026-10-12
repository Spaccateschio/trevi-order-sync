import { describe, expect, it } from "vitest";

import { planLineEdit } from "./order-line-edit";

const units = [
  { unit_id: "cs", code: "cs", conversion_factor: null },
  { unit_id: "mz", code: "mz", conversion_factor: null },
  { unit_id: "kg", code: "kg", conversion_factor: 1 },
];
const base = { currentQuantity: 3, currentUnitId: "cs", currentCode: "cs", units, coverageConfirmed: false, inOrder: false };

describe("matita Genera ordini", () => {
  it("3 cs → 3 mz senza conversione chiede conferma esplicita", () => {
    const p = planLineEdit({ ...base, nextQuantityText: "3", nextUnitId: "mz" });
    expect(p).toMatchObject({ kind: "save", needsUnitWarning: true, fromCode: "cs", toCode: "mz" });
  });
  it("solo quantità diversa: nessun avviso U.M.", () => {
    expect(planLineEdit({ ...base, nextQuantityText: "4", nextUnitId: "cs" })).toMatchObject({ kind: "save", needsUnitWarning: false });
  });
  it("U.M. con conversione valida: nessun avviso", () => {
    expect(planLineEdit({ ...base, nextQuantityText: "3", nextUnitId: "kg" })).toMatchObject({ needsUnitWarning: false });
  });
  it("conferma già data: va tolta prima di salvare", () => {
    expect(planLineEdit({ ...base, coverageConfirmed: true, nextQuantityText: "3", nextUnitId: "mz" })).toMatchObject({ revokeFirst: true });
  });
  it("nulla cambiato: nessun salvataggio", () => {
    expect(planLineEdit({ ...base, nextQuantityText: "3", nextUnitId: "cs" }).kind).toBe("unchanged");
  });
  it("U.M. non venduta dal fornitore o quantità 0: rifiutato", () => {
    expect(planLineEdit({ ...base, nextQuantityText: "3", nextUnitId: "pz" }).kind).toBe("invalid");
    expect(planLineEdit({ ...base, nextQuantityText: "0", nextUnitId: "cs" }).kind).toBe("invalid");
  });
  it("quota già in un ordine: non modificabile", () => {
    expect(planLineEdit({ ...base, inOrder: true, nextQuantityText: "4", nextUnitId: "cs" }).kind).toBe("invalid");
  });
});

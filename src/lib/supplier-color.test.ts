import { describe, expect, it } from "vitest";
import { SUPPLIER_PALETTE, autoSupplierColor, productSupplierTones, resolveSupplierColor } from "./supplier-color";

const recs = new Map([["a", { name: "Alfa", color: "p01" as const }], ["b", { name: "Beta", color: "p02" as const }]]);

describe("colore fornitore", () => {
  it("tavolozza di 12 colori", () => expect(SUPPLIER_PALETTE).toHaveLength(12));
  it("automatico stabile per lo stesso id", () => {
    const id = "b1a473f1-a22a-43d3-b1fd-1cb2bf4225be";
    expect(autoSupplierColor(id)).toBe(autoSupplierColor(id));
  });
  it("il colore salvato vince sull'automatico", () => expect(resolveSupplierColor("x", "p07")).toBe("p07"));
  it("un valore fuori tavolozza torna all'automatico", () => expect(resolveSupplierColor("x", "rosso")).toBe(autoSupplierColor("x")));
  it("principale = quota più alta", () => {
    const t = productSupplierTones({ links: [{ recordId: "a", preferred: true }, { recordId: "b", preferred: false }], quotas: [{ recordId: "a", quantity: 1 }, { recordId: "b", quantity: 5 }], records: recs });
    expect(t.map((x) => x.recordId)).toEqual(["b", "a"]);
  });
  it("senza quote principale = stella", () => {
    const t = productSupplierTones({ links: [{ recordId: "a", preferred: false }, { recordId: "b", preferred: true }], records: recs });
    expect(t[0]?.recordId).toBe("b");
  });
});

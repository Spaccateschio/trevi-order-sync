import { describe, expect, it } from "vitest";

import { evaluationCounts, statusFromQuantity, type EvaluationRow } from "./inventory-evaluation";

describe("valutazione inventario", () => {
  it("campo vuoto = da_valutare", () => {
    expect(statusFromQuantity(null)).toEqual({ status: "da_valutare", quantity: null });
  });
  it("quantità > 0 = da_acquistare", () => {
    expect(statusFromQuantity(10)).toEqual({ status: "da_acquistare", quantity: 10 });
  });
  it("zero non diventa non_acquistare", () => {
    expect(statusFromQuantity(0).status).toBe("da_valutare");
  });
  it("contatori", () => {
    const rows = new Map<string, EvaluationRow>([
      ["a", { product_id: "a", status: "da_acquistare", decided_quantity: 10 }],
      ["b", { product_id: "b", status: "non_acquistare", decided_quantity: null }],
    ]);
    expect(evaluationCounts(["a", "b", "c", "d"], rows)).toEqual({ daValutare: 2, daAcquistare: 1, nonAcquistare: 1 });
  });
});

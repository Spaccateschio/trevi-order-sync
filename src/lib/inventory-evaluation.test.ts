import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { evaluationCounts, statusFromQuantity, type EvaluationRow } from "./inventory-evaluation";

describe("valutazione inventario", () => {
  it("campo vuoto = da_valutare", () => {
    assert.deepEqual(statusFromQuantity(null), { status: "da_valutare", quantity: null });
  });
  it("quantità > 0 = da_acquistare", () => {
    assert.deepEqual(statusFromQuantity(10), { status: "da_acquistare", quantity: 10 });
  });
  it("zero non diventa non_acquistare", () => {
    assert.equal(statusFromQuantity(0).status, "da_valutare");
  });
  it("contatori", () => {
    const rows = new Map<string, EvaluationRow>([
      ["a", { product_id: "a", status: "da_acquistare", decided_quantity: 10 }],
      ["b", { product_id: "b", status: "non_acquistare", decided_quantity: null }],
    ]);
    assert.deepEqual(evaluationCounts(["a", "b", "c", "d"], rows), { daValutare: 2, daAcquistare: 1, nonAcquistare: 1 });
  });
});

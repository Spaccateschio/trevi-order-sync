import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyShares,
  createLatestQueue,
  deselectedFor,
  markDeselected,
  clearDeselected,
  matchesMemory,
  pickMemory,
  planFromMemory,
  planRescale,
  type MemoryContext,
  type SupplierMemory,
} from "./supplier-memory";
import type { PickSupplier } from "./supplier-selection";

const kg = { unitId: "u-kg", code: "kg" };
const cs = { unitId: "u-cs", code: "cs" };
const sup = (linkId: string, p: Partial<PickSupplier> = {}): PickSupplier => ({
  linkId, isB2B: false, sourceLinked: false, purchasable: true, allowManual: false, units: [kg], isPreferred: false, ...p,
});
const ctx = (p: Partial<MemoryContext> = {}): MemoryContext => ({
  suppliers: [sup("A"), sup("B")], deselected: new Set(), decidedUnitId: "u-kg", decidedCode: "kg",
  quantity: 50, stockUnitId: "u-kg", conversions: {}, ...p,
});
const f = (linkId: string, quantity: number, unit = kg, eq: number | null = null) =>
  ({ kind: "fornitore" as const, linkId, unitId: unit.unitId, unitCode: unit.code, quantity, stockEquivalent: eq });
const mem = (...d: SupplierMemory["destinations"]): SupplierMemory => ({ listId: "L1", closedAt: "2026-10-10", destinations: d });

describe("Memoria dei fornitori", () => {
  it("9. un solo fornitore precedente: nuova quantità tutta a lui (15, non 10)", () => {
    const p = planFromMemory(mem(f("A", 10)), ctx({ quantity: 15 }));
    assert.deepEqual(p, { kind: "scrivi", writes: [{ kind: "fornitore", linkId: "A", target: { unitId: "u-kg", manual: null, quantity: 15 } }] });
  });
  it("10. più fornitori 60/40 → 30/20", () => {
    const p = planFromMemory(mem(f("A", 60), f("B", 40)), ctx({ quantity: 50 }));
    assert.equal(p.kind, "scrivi");
    if (p.kind === "scrivi") assert.deepEqual(p.writes.map((w) => (w.kind === "fornitore" ? w.target.quantity : w.quantity)), [30, 20]);
  });
  it("11. memoria con acquisto diretto: destinazione distinta", () => {
    const p = planFromMemory(mem(f("A", 30), { kind: "diretto", unitId: "u-kg", unitCode: "kg", quantity: 10 }), ctx({ quantity: 20 }));
    assert.equal(p.kind, "scrivi");
    if (p.kind === "scrivi") assert.deepEqual(p.writes.map((w) => w.kind), ["fornitore", "diretto"]);
  });
  it("12. U.M. diversa con conversione valida: casse intere", () => {
    const p = planFromMemory(mem(f("A", 2, cs)), ctx({ suppliers: [sup("A", { units: [kg, cs] })], quantity: 30, conversions: { A: [{ unitId: "u-cs", factor: 10 }] } }));
    assert.deepEqual(p.kind === "scrivi" && p.writes[0], { kind: "fornitore", linkId: "A", target: { unitId: "u-cs", manual: null, quantity: 3 } });
  });
  it("13. U.M. diversa senza conversione: da completare", () => {
    const p = planFromMemory(mem(f("A", 2, cs)), ctx({ suppliers: [sup("A", { units: [cs] })], quantity: 30 }));
    assert.equal(p.kind, "proponi");
  });
  it("14. proporzione non esatta: destinazioni proposte, quote a mano", () => {
    assert.equal(applyShares(10, [1 / 3, 2 / 3], true), null);
    assert.equal(planFromMemory(mem(f("A", 1), f("B", 2)), ctx({ quantity: 10 })).kind, "proponi");
  });
  it("21. fornitore precedente non più acquistabile: nessuna memoria", () => {
    const p = planFromMemory(mem(f("A", 10)), ctx({ suppliers: [sup("B")] }));
    assert.equal(p.kind, "nessuna");
  });
  it("22. nessuna Lista precedente valida", () => {
    assert.equal(pickMemory([{ listId: "x", closedAt: "2026-10-01", destinations: [] }]), null);
    assert.equal(planFromMemory(null, ctx()).kind, "nessuna");
  });
  it("si usa l'ultima Lista chiusa con quote", () => {
    const m = pickMemory([
      { listId: "old", closedAt: "2026-10-01", destinations: [f("A", 5)] },
      { listId: "new", closedAt: "2026-10-09", destinations: [f("B", 5)] },
      { listId: "empty", closedAt: "2026-10-11", destinations: [] },
    ]);
    assert.equal(m?.listId, "new");
  });
  it("20. la memoria non copia la quantità precedente", () => {
    const p = planFromMemory(mem(f("A", 999)), ctx({ suppliers: [sup("A")], quantity: 7 }));
    assert.equal(p.kind === "scrivi" && p.writes[0]!.kind === "fornitore" && p.writes[0]!.target.quantity, 7);
  });
  it("kg e casse senza equivalente non si sommano", () => {
    assert.equal(planFromMemory(mem(f("A", 10, kg), f("B", 2, cs)), ctx({ suppliers: [sup("A"), sup("B", { units: [kg, cs] })] })).kind, "proponi");
  });
  it("«Come l'ultima volta» solo se destinazioni e proporzioni coincidono", () => {
    const m = mem(f("A", 60), f("B", 40));
    assert.equal(matchesMemory(m, [{ linkId: "A", quantity: 30, unitKey: "u-kg" }, { linkId: "B", quantity: 20, unitKey: "u-kg" }]), true);
    assert.equal(matchesMemory(m, [{ linkId: "A", quantity: 40, unitKey: "u-kg" }, { linkId: "B", quantity: 10, unitKey: "u-kg" }]), false);
  });
});

describe("Deselezione e quantità", () => {
  it("15-16. fornitore tolto: la memoria non lo ripristina", () => {
    markDeselected("item1", "A");
    assert.equal(planFromMemory(mem(f("A", 10)), ctx({ deselected: deselectedFor("item1") })).kind, "nessuna");
    clearDeselected("item1", "A");
    assert.equal(deselectedFor("item1").size, 0);
  });
  it("2/27. ricalcolo 60/40 solo se le quote sono ancora automatiche", () => {
    const rows = [
      { id: "r1", linkId: "A", purchaseUnitId: "u-kg", purchaseUnitCode: "kg", purchaseQuantity: 30, inOrder: false },
      { id: "r2", linkId: "B", purchaseUnitId: "u-kg", purchaseUnitCode: "kg", purchaseQuantity: 20, inOrder: false },
    ];
    const m = mem(f("A", 60), f("B", 40));
    const w = planRescale({ rows, directQuota: null, previousQuantity: 50, memory: m, ctx: ctx({ quantity: 100 }) });
    assert.deepEqual(w?.map((x) => (x.kind === "fornitore" ? x.target.quantity : 0)), [60, 40]);
    const manual = rows.map((r, i) => ({ ...r, purchaseQuantity: i ? 15 : 35 }));
    assert.equal(planRescale({ rows: manual, directQuota: null, previousQuantity: 50, memory: m, ctx: ctx({ quantity: 100 }) }), null);
  });
  it("17-18. quote in bozza/ordine: nessun ricalcolo", () => {
    const rows = [
      { id: "r1", linkId: "A", purchaseUnitId: "u-kg", purchaseUnitCode: "kg", purchaseQuantity: 5, inOrder: true },
      { id: "r2", linkId: "B", purchaseUnitId: "u-kg", purchaseUnitCode: "kg", purchaseQuantity: 5, inOrder: false },
    ];
    assert.equal(planRescale({ rows, directQuota: null, previousQuantity: 10, memory: null, ctx: ctx({ quantity: 20 }) }), null);
  });
  it("parti uguali ricalcolate se non modificate", () => {
    const rows = [
      { id: "r1", linkId: "A", purchaseUnitId: "u-kg", purchaseUnitCode: "kg", purchaseQuantity: 5, inOrder: false },
      { id: "r2", linkId: "B", purchaseUnitId: "u-kg", purchaseUnitCode: "kg", purchaseQuantity: 5, inOrder: false },
    ];
    const w = planRescale({ rows, directQuota: null, previousQuantity: 10, memory: null, ctx: ctx({ quantity: 12 }) });
    assert.deepEqual(w?.map((x) => (x.kind === "fornitore" ? x.target.quantity : 0)), [6, 6]);
  });
  it("7. modifiche rapide: una scrittura alla volta, vince l'ultimo valore", async () => {
    const written: number[] = [];
    let active = 0;
    let maxActive = 0;
    const q = createLatestQueue<number>(async (_k, v) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      written.push(v);
      active--;
    });
    void q.push("i", 10);
    void q.push("i", 11);
    void q.push("i", 12);
    await q.push("i", 12);
    assert.equal(maxActive, 1);
    assert.equal(written.at(-1), 12);
    assert.ok(!written.includes(11));
  });
  it("19. errore di salvataggio: la coda prosegue col valore più recente", async () => {
    const seen: number[] = [];
    const q = createLatestQueue<number>(async (_k, v) => {
      seen.push(v);
      if (v === 1) throw new Error("rete");
    });
    void q.push("i", 1);
    await q.push("i", 2);
    assert.deepEqual(seen, [1, 2]);
  });
});

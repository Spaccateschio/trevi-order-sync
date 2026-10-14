import { describe, it as test } from "node:test";
import assert from "node:assert/strict";
import { planDirectChange, type DirectPoolRow } from "./direct-quota-plan";
import type { PickSupplier } from "./supplier-selection";

const KG = "00000000-0000-0000-0000-000000000001";
const KG_OTHER = "00000000-0000-0000-0000-000000000003";
const CS = "00000000-0000-0000-0000-000000000002";

const sup = (linkId: string, units: string[] = [KG], allowManual = true): PickSupplier => ({
  linkId,

  isB2B: false,
  sourceLinked: true,
  purchasable: true,
  allowManual,
  units: units.map((u) => ({ unitId: u, code: u === CS ? "cs" : "kg" })),
  isPreferred: true,
});

const row = (id: string, linkId: string, quantity: number | null, unitId: string | null = KG, code: string | null = null): DirectPoolRow => ({
  id,
  linkId,
  purchaseQuantity: quantity,
  purchaseUnitId: unitId,
  purchaseUnitCode: code,
});

const base = {
  quantity: 10,
  decidedUnitId: KG,
  decidedCode: "kg",
  stockUnitId: null,
  conversions: {},
  memory: null,
};

describe("Acquisto diretto: ripartizione con i fornitori", () => {
  test("un solo fornitore: la quota scende al residuo (ARANCE 10, diretto 5)", () => {
    const plan = planDirectChange({ ...base, directOld: null, directNew: 5, suppliers: [sup("trevi")], assignments: [row("a1", "trevi", 10)] });
    assert.deepEqual(plan.kind, "scritti");
    if (plan.kind === "scritti") assert.deepEqual(plan.writes[0], { linkId: "trevi", assignmentId: "a1", quantity: 5, unitId: KG, manual: null });
  });

  test("un solo fornitore: tolgo la quota diretta e la quota torna al residuo (5 → 10)", () => {
    const plan = planDirectChange({ ...base, directOld: 5, directNew: 0, suppliers: [sup("trevi")], assignments: [row("a1", "trevi", 5)] });
    if (plan.kind !== "scritti") return assert.fail(plan.kind);
    assert.equal(plan.writes[0]!.quantity, 10);
  });

  test("quota già corretta: nessuna scrittura", () => {
    const plan = planDirectChange({ ...base, directOld: 5, directNew: 5, suppliers: [sup("trevi")], assignments: [row("a1", "trevi", 5)] });
    assert.deepEqual(plan.kind, "nessuna_scrittura");
  });

  test("più fornitori con parti uguali: il residuo si divide di nuovo", () => {
    const plan = planDirectChange({
      ...base,
      directOld: null,
      directNew: 4,
      suppliers: [sup("a"), sup("b")],
      assignments: [row("a1", "a", 5), row("a2", "b", 5)],
    });
    if (plan.kind !== "scritti") return assert.fail(plan.kind);
    assert.deepEqual(plan.writes, [
      { linkId: "a", assignmentId: "a1", quantity: 3, unitId: KG, manual: null },
      { linkId: "b", assignmentId: "a2", quantity: 3, unitId: KG, manual: null },
    ]);
  });

  test("più fornitori con quote modificate a mano: non si toccano (differenza da sistemare)", () => {
    const plan = planDirectChange({
      ...base,
      directOld: null,
      directNew: 4,
      suppliers: [sup("a"), sup("b")],
      assignments: [row("a1", "a", 7), row("a2", "b", 5)],
    });
    assert.deepEqual(plan.kind, "da_sistemare");
  });

  test("eccedenza ammessa: nessuna quota fornitore toccata", () => {
    const plan = planDirectChange({ ...base, directOld: null, directNew: 15, suppliers: [sup("trevi")], assignments: [row("a1", "trevi", 10)] });
    assert.deepEqual(plan.kind, "nessuna_scrittura");
  });

  test("quota diretta che copre tutto: i fornitori non si azzerano da soli", () => {
    const plan = planDirectChange({ ...base, directOld: null, directNew: 10, suppliers: [sup("trevi")], assignments: [row("a1", "trevi", 10)] });
    assert.deepEqual(plan.kind, "da_sistemare");
  });

  test("U.M. diverse senza conversione: nulla si tocca", () => {
    const plan = planDirectChange({
      ...base,
      directOld: null,
      directNew: 4,
      suppliers: [sup("trevi", [CS])],
      assignments: [row("a1", "trevi", 2, CS)],
    });
    assert.deepEqual(plan.kind, "da_sistemare");
  });

  test("riga senza U.M. decisa: quota del fornitore con U.M. che combacia per codice", () => {
    const plan = planDirectChange({
      ...base,
      decidedUnitId: null,
      directOld: null,
      directNew: 5,
      suppliers: [sup("trevi", [KG_OTHER])],
      assignments: [row("a1", "trevi", 10, KG_OTHER)],
    });
    if (plan.kind !== "scritti") return assert.fail(plan.kind);
    assert.equal(plan.writes[0]!.quantity, 5);
  });

  test("conversione valida: la quota del fornitore segue il residuo in confezioni intere", () => {
    const plan = planDirectChange({
      ...base,
      decidedUnitId: KG,
      stockUnitId: KG,
      directOld: null,
      directNew: 5,
      suppliers: [sup("trevi", [CS], false)],
      assignments: [row("a1", "trevi", 2, CS)],
      conversions: { trevi: [{ unitId: CS, factor: 5 }] },
    });
    if (plan.kind !== "scritti") return assert.fail(plan.kind);
    assert.equal(plan.writes[0]!.quantity, 1);
  });

  test("conversione con confezioni non intere: differenza da sistemare", () => {
    const plan = planDirectChange({
      ...base,
      decidedUnitId: KG,
      stockUnitId: KG,
      directOld: null,
      directNew: 4,
      suppliers: [sup("trevi", [CS], false)],
      assignments: [row("a1", "trevi", 2, CS)],
      conversions: { trevi: [{ unitId: CS, factor: 5 }] },
    });
    assert.deepEqual(plan.kind, "da_sistemare");
  });
});

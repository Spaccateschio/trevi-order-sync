import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  autoPickSupplier,
  friendlyAssignError,
  issueReason,
  quickUnitFor,
  rebalanceShares,
  rowLabel,
  splitEvenly,
  summarizeRows,
  type PickSupplier,
} from "./supplier-selection";

const kg = { unitId: "u-kg", code: "kg" };
const cs = { unitId: "u-cs", code: "cs" };
const sup = (linkId: string, p: Partial<PickSupplier> = {}): PickSupplier => ({
  linkId, isB2B: false, sourceLinked: false, purchasable: true, allowManual: false, units: [kg], isPreferred: false, ...p,
});

describe("proposta automatica del fornitore", () => {
  it("unico fornitore idoneo: scelto (AGLIO SPAGNA 10 kg)", () => {
    assert.deepEqual(autoPickSupplier([sup("a")], null, "kg", []), { kind: "pick", linkId: "a", reason: "unico" });
  });
  it("più fornitori con un solo preferito: scelto il preferito", () => {
    const r = autoPickSupplier([sup("a"), sup("b", { isPreferred: true })], null, "kg", []);
    assert.equal(r.kind === "pick" && r.linkId, "b");
  });
  it("più fornitori senza preferito: nessuna scelta", () => {
    assert.equal(autoPickSupplier([sup("a"), sup("b")], null, "kg", []).kind, "da_scegliere");
  });
  it("preferito in conflitto con la stella dell'Inventario: nessuna scelta", () => {
    assert.equal(autoPickSupplier([sup("a"), sup("b", { isPreferred: true })], null, "kg", ["a"]).kind, "da_scegliere");
  });
  it("preferito uguale alla stella dell'Inventario: scelto", () => {
    assert.equal(autoPickSupplier([sup("a"), sup("b", { isPreferred: true })], null, "kg", ["b"]).kind, "pick");
  });
  it("B2B non in catalogo del fornitore: mai scelto", () => {
    assert.equal(autoPickSupplier([sup("a", { isB2B: true, sourceLinked: true, purchasable: false })], null, "kg", []).kind, "da_scegliere");
  });
  it("U.M. incompatibile (cs contro kg) senza conversione: nessuna scelta", () => {
    assert.equal(autoPickSupplier([sup("a", { units: [kg] })], null, "cs", []).kind, "da_scegliere");
    assert.equal(quickUnitFor(sup("a", { units: [kg] }), null, "cs"), null);
  });
  it("nessun fornitore collegato", () => {
    assert.equal(autoPickSupplier([], null, "kg", []).kind, "senza_fornitore");
  });
});

describe("ripartizione", () => {
  it("parti uguali con somma esatta", () => {
    assert.deepEqual(splitEvenly(10, 2, true), [5, 5]);
    assert.deepEqual(splitEvenly(10, 3, true), [4, 3, 3]);
    const dec = splitEvenly(10, 3, false);
    assert.equal(Math.round(dec.reduce((a, b) => a + b, 0) * 1000) / 1000, 10);
  });
  it("quota scelta a mano resta, il residuo va agli altri (6 + 4)", () => {
    assert.deepEqual(rebalanceShares(10, [{ id: "a", fixed: 6 }, { id: "b", fixed: null }], true), { a: 6, b: 4 });
  });
  it("mai oltre il totale", () => {
    assert.equal(rebalanceShares(10, [{ id: "a", fixed: 12 }, { id: "b", fixed: null }], true), null);
  });
});

describe("diciture e riepilogo", () => {
  const base = { quantity: 10, locked: true, status: "da_assegnare" as const, linkedSuppliers: 1, quotes: 0 };
  it("quantità digitata ma non confermata non è mai assegnata", () => {
    assert.equal(rowLabel({ ...base, locked: false, status: "assegnata", quotes: 1 }), "Quantità non confermata");
  });
  it("fornitore collegato ma nessuna quota = Fornitore da scegliere", () => {
    assert.equal(rowLabel(base), "Fornitore da scegliere");
    assert.equal(rowLabel({ ...base, linkedSuppliers: 0 }), "Senza fornitore");
  });
  it("cs con quote in kg = Da verificare con motivo conversione", () => {
    const r = { ...base, status: "da_verificare" as const, quotes: 2 };
    assert.equal(rowLabel(r), "Da verificare");
    assert.equal(issueReason(r), "Conversione U.M. da verificare");
  });
  it("ogni prodotto in un solo stato; esclusi a parte", () => {
    const s = summarizeRows([
      { ...base, status: "assegnata", quotes: 1 },
      { ...base, status: "parziale", quotes: 1 },
      base,
      { ...base, locked: false },
      { ...base, excluded: true },
    ]);
    assert.deepEqual(s, { total: 4, assigned: 1, partial: 1, toFix: 2, excluded: 1 });
  });
  it("quota già in un ordine: messaggio chiaro", () => {
    assert.match(friendlyAssignError('violates foreign key constraint "purchase_order_items_source_assignment_id_fkey"'), /Bozze/);
  });
});

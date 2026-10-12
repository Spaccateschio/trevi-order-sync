import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  autoPickSupplier,
  createItemGuard,
  defaultUnitCode,
  defaultUnitOf,
  planQuotaUpdate,
  quotaFor,
  quotaSaveError,
  rowLabel,
  summarizeRows,
  type PickSupplier,
  type QuotaAssignment,
} from "./supplier-selection";

const kg = { unitId: "u-kg", code: "kg" };
const cs = { unitId: "u-cs", code: "cs" };
const sup = (linkId: string, p: Partial<PickSupplier> = {}): PickSupplier => ({
  linkId, isB2B: false, sourceLinked: false, purchasable: true, allowManual: false, units: [kg], isPreferred: false, ...p,
});
const asg = (p: Partial<QuotaAssignment> = {}): QuotaAssignment => ({
  id: "as1", linkId: "trevi", purchaseUnitId: "u-kg", purchaseUnitCode: "kg", purchaseQuantity: 5, inOrder: false, ...p,
});
const base = { directQuota: null, decidedUnitId: null, decidedCode: "kg", stockUnitId: "u-kg", conversions: {} };

describe("A. U.M. predefinita del fornitore B2B", () => {
  it("1. unica U.M. pubblicata: preselezionata", () => {
    assert.equal(defaultUnitCode([{ code: "CS", isDefault: false }]), "CS");
  });
  it("2. più U.M. con una predefinita: preselezionata la predefinita", () => {
    assert.equal(defaultUnitCode([{ code: "KG", isDefault: false }, { code: "CS", isDefault: true }]), "CS");
  });
  it("3. più U.M. senza predefinita: sceglie l'utente", () => {
    assert.equal(defaultUnitCode([{ code: "KG", isDefault: false }, { code: "CS", isDefault: false }]), "");
    assert.equal(defaultUnitOf([{ unitId: "a" }, { unitId: "b" }]), null);
  });
});

describe("B. aggiunta dal Catalogo B2B", () => {
  it("4. con quantità e U.M. valide: proposto il fornitore del Catalogo", () => {
    const r = autoPickSupplier([sup("altro"), sup("cat", { isB2B: true, sourceLinked: true })], null, "kg", [], { preferLinkId: "cat" });
    assert.deepEqual(r, { kind: "pick", linkId: "cat", reason: "unico" });
  });
  it("4-bis. fornitore del Catalogo non acquistabile: mai scelto", () => {
    const r = autoPickSupplier([sup("cat", { isB2B: true, sourceLinked: true, purchasable: false })], null, "kg", [], { preferLinkId: "cat" });
    assert.notEqual(r.kind, "pick");
  });
  it("5. senza quantità la riga resta «Quantità mancante»", () => {
    assert.equal(rowLabel({ quantity: null, locked: false, status: "da_assegnare", linkedSuppliers: 1, quotes: 0 }), "Quantità mancante");
  });
});

describe("D-bis. quota automatica nella card", () => {
  it("6. AGLIO SPAGNA: unico fornitore idoneo → proposta automatica", () => {
    assert.deepEqual(planQuotaUpdate({ ...base, assignments: [], suppliers: [sup("trevi")], quantity: 5 }), { kind: "proponi" });
    assert.equal(autoPickSupplier([sup("trevi")], null, "kg", []).kind, "pick");
  });
  it("7. U.M. uguali: 5 kg → 5 kg", () => {
    assert.deepEqual(quotaFor(sup("trevi"), null, "kg", 5, "u-kg", []), { unitId: "u-kg", manual: null, quantity: 5 });
  });
  it("8. conversione valida: 20 kg con cassa da 10 kg → 2 cs", () => {
    const s = sup("t", { units: [cs] });
    assert.deepEqual(quotaFor(s, "u-kg", "", 20, "u-kg", [{ unitId: "u-cs", factor: 10 }]), { unitId: "u-cs", manual: null, quantity: 2 });
    assert.equal(quotaFor(s, "u-kg", "", 25, "u-kg", [{ unitId: "u-cs", factor: 10 }]), null, "mezza cassa: da verificare");
  });
  it("9. U.M. diverse senza conversione: da verificare, quota invariata", () => {
    const r = planQuotaUpdate({ ...base, assignments: [asg({ purchaseUnitId: "u-cs", purchaseUnitCode: "cs" })], suppliers: [sup("trevi", { units: [cs] })], quantity: 8 });
    assert.equal(r.kind, "verifica");
  });
  it("10. modifica quantità con un solo fornitore: la quota segue (5 → 8 kg)", () => {
    const r = planQuotaUpdate({ ...base, assignments: [asg()], suppliers: [sup("trevi")], quantity: 8 });
    assert.deepEqual(r, { kind: "set", linkId: "trevi", assignmentId: "as1", target: { unitId: "u-kg", manual: null, quantity: 8 } });
  });
  it("11. più fornitori: nessuna ridistribuzione", () => {
    const r = planQuotaUpdate({ ...base, assignments: [asg(), asg({ id: "as2", linkId: "b" })], suppliers: [sup("trevi"), sup("b")], quantity: 12 });
    assert.equal(r.kind, "verifica");
  });
  it("12. acquisto diretto presente: rispettato, nessun fornitore aggiunto", () => {
    assert.deepEqual(planQuotaUpdate({ ...base, directQuota: 5, assignments: [], suppliers: [sup("trevi")], quantity: 5 }), { kind: "invariato" });
    assert.equal(planQuotaUpdate({ ...base, directQuota: 2, assignments: [asg()], suppliers: [sup("trevi")], quantity: 8 }).kind, "verifica");
  });
  it("13-14. quota già in bozza o in ordine inviato: mai toccata", () => {
    const r = planQuotaUpdate({ ...base, assignments: [asg({ inOrder: true })], suppliers: [sup("trevi")], quantity: 8 });
    assert.deepEqual(r, { kind: "verifica", reason: "Questa quota è già in un ordine: gestiscila dalle Bozze." });
  });
  it("15. errore di salvataggio: messaggio chiaro, nessun «Assegnato»", () => {
    const m = quotaSaveError("trevi srl", "rete assente");
    assert.match(m, /non è stata salvata/);
    assert.match(m, /Assegnala dalla card/);
  });
  it("16. doppio clic: una sola esecuzione", async () => {
    const once = createItemGuard();
    let calls = 0;
    const slow = () => new Promise<string>((ok) => setTimeout(() => { calls += 1; ok("fatto"); }, 10));
    const [a, b] = await Promise.all([once("riga", "occupato", slow), once("riga", "occupato", slow)]);
    assert.deepEqual([a, b, calls], ["fatto", "occupato", 1]);
  });
  it("17. quota già uguale (nessuna modifica): nessuna scrittura", () => {
    assert.deepEqual(planQuotaUpdate({ ...base, assignments: [asg()], suppliers: [sup("trevi")], quantity: 5 }), { kind: "invariato" });
  });
  it("18. contatori: la riga confermata e assegnata conta come Assegnato", () => {
    const s = summarizeRows([
      { quantity: 5, locked: true, status: "assegnata", linkedSuppliers: 1, quotes: 1 },
      { quantity: null, locked: false, status: "da_assegnare", linkedSuppliers: 1, quotes: 0 },
    ]);
    assert.deepEqual(s, { total: 2, assigned: 1, partial: 0, toFix: 1, excluded: 0 });
  });
});

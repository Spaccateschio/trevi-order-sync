import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listCounters, memoryStillValid, visualPick } from "@/lib/supplier-selection";
import { chooseListDestinations, planFromMemory, type SupplierMemory } from "@/lib/supplier-memory";

const s = (linkId: string, o: Partial<{ isB2B: boolean; sourceLinked: boolean; purchasable: boolean; isPreferred: boolean }> = {}) => ({
  linkId, isB2B: false, sourceLinked: true, purchasable: true, isPreferred: false, ...o,
});

describe("spunta visiva prima della quantità", () => {
  it("fornitore preferito ★ spuntato", () => assert.equal(visualPick([s("a"), s("b", { isPreferred: true })], []), "b"));
  it("fornitore unico spuntato", () => assert.equal(visualPick([s("a")], []), "a"));
  it("più fornitori senza stella: nessuna spunta", () => assert.equal(visualPick([s("a"), s("b")], []), null));
  it("più stelle: nessuna spunta", () => assert.equal(visualPick([s("a", { isPreferred: true }), s("b", { isPreferred: true })], []), null));
  it("★ tolta: resta solo l'altro fornitore, come nell'assegnazione", () => assert.equal(visualPick([s("a", { isPreferred: true }), s("b")], ["a"]), "b"));
  it("deselezione volontaria prevale sul fornitore unico", () => assert.equal(visualPick([s("a")], ["a"]), null));
  it("B2B non acquistabile mai spuntato", () => assert.equal(visualPick([s("a", { isB2B: true, purchasable: false })], []), null));
});

describe("memoria e stella", () => {
  it("stella cambiata dopo la Lista chiusa: la memoria non vale", () =>
    assert.equal(memoryStillValid("2026-10-01T10:00:00Z", "2026-10-05T10:00:00Z"), false));
  it("stella cambiata prima: la memoria vale", () => assert.equal(memoryStillValid("2026-10-05T10:00:00Z", "2026-10-01T10:00:00Z"), true));
  it("nessuna stella manuale: la memoria vale", () => assert.equal(memoryStillValid("2026-10-05T10:00:00Z", null), true));
});

describe("spunta e quota condividono le destinazioni", () => {
  const suppliers = [s("a", { isPreferred: true }), s("b")].map((x) => ({ ...x, allowManual: true, units: [] }));
  const memory: SupplierMemory = { listId: "old", closedAt: "2026-10-10T10:00:00Z", destinations: [
    { kind: "fornitore", linkId: "b", unitId: "kg", unitCode: "kg", quantity: 5, stockEquivalent: 5 },
  ] };
  const choose = (extra: Partial<Parameters<typeof chooseListDestinations>[0]> = {}) => chooseListDestinations({ suppliers, memory,
    manualStarAt: null, inventoryStarLinks: [], deselected: [], ...extra });
  it("memoria prima della stella anche senza quantità", () => assert.deepEqual(choose().linkIds, ["b"]));
  it("stella cambiata dopo la chiusura prevale", () => assert.deepEqual(choose({ manualStarAt: "2026-10-12T07:00:00Z" }).linkIds, ["a"]));
  it("memoria multipla spunta tutti i fornitori", () => assert.deepEqual(choose({ memory: { ...memory, destinations: [
    ...memory.destinations, { kind: "fornitore", linkId: "a", unitId: "kg", unitCode: "kg", quantity: 5, stockEquivalent: 5 },
  ] } }).linkIds, ["b", "a"]));
  it("fornitore deselezionato non ritorna dalla memoria", () => assert.deepEqual(choose({ deselected: ["b"] }).linkIds, ["a"]));
  it("non acquistabile non ritorna dalla memoria", () => assert.deepEqual(choose({ suppliers: suppliers.map((x) => x.linkId === "b" ? { ...x, purchasable: false } : x) }).linkIds, ["a"]));
  it("conflitto stelle senza memoria: nessuna proposta", () => assert.deepEqual(choose({ memory: null, inventoryStarLinks: ["b"] }).linkIds, []));
  it("nessuna memoria o stella: unico fornitore", () => assert.deepEqual(choose({ memory: null, suppliers: suppliers.filter((x) => x.linkId === "b") }).linkIds, ["b"]));
  it("acquisto diretto storico non forza fornitori", () => {
    const result = choose({ memory: { ...memory, destinations: [{ kind: "diretto", unitId: "kg", unitCode: "kg", quantity: 5 }] } });
    assert.equal(result.direct, true); assert.deepEqual(result.linkIds, []); assert.equal(result.reason, "memoria");
  });
  it("la quota usa lo stesso fornitore spuntato e la nuova quantità, non quella storica", () => {
    const available = suppliers.map((x) => ({ ...x, units: [{ unitId: "kg", code: "kg" }] }));
    const choice = choose({ suppliers: available });
    const plan = planFromMemory(choice.memory, { suppliers: available, deselected: new Set(),
      decidedUnitId: "kg", decidedCode: "kg", quantity: 12, stockUnitId: "kg", conversions: {} });
    assert.equal(plan.kind, "scrivi");
    if (plan.kind !== "scrivi") throw new Error("Quota non pianificata");
    assert.deepEqual(plan.writes, [{ kind: "fornitore", linkId: "b", target: { unitId: "kg", manual: null, quantity: 12 } }]);
    assert.deepEqual(choice.linkIds, ["b"]);
  });
});

describe("contatori", () => {
  const rows = [
    { productId: "p1", quantity: 5, excluded: false },
    { productId: "p2", quantity: null, excluded: false },
    { productId: "p3", quantity: 2, excluded: false },
    { productId: "p4", quantity: null, excluded: true },
  ];
  const c = listCounters({ catalogTotal: 120, favoriteIds: ["p1", "p2", "p9"], rows });
  it("Con quantità + Da inserire = In Lista (esclusi fuori)", () => {
    assert.equal(c.inList, 3);
    assert.equal(c.withQuantity, 2);
    assert.equal(c.toFill, 1);
    assert.equal(c.excluded, 1);
  });
  it("preferiti totali distinti dai preferiti in Lista", () => {
    assert.equal(c.favorites, 3);
    assert.equal(c.favInList, 2);
  });
  it("preferiti compilati e mancanti; un preferito non in Lista non è mancante", () => {
    assert.equal(c.favFilled, 1);
    assert.equal(c.favMissing, 1);
  });
  it("Prodotti = totale catalogo indipendente dal filtro", () => assert.equal(c.products, 120));
});

describe("stelle su più destinazioni", () => {
  const sup = (id: string, pref: boolean) => ({ ...s(id, { isPreferred: pref }), allowManual: true, units: [] });
  const base = { deselected: [] as string[], memory: null, manualStarAt: null, inventoryStarLinks: [] as string[] };
  it("una stella: come oggi, proposto solo quel fornitore", () => {
    const r = chooseListDestinations({ ...base, suppliers: [sup("a", true), sup("b", false)] });
    assert.deepEqual(r.linkIds, ["a"]); assert.equal(r.reason, "preferito");
  });
  it("due stelle: entrambe proposte, da ripartire", () => {
    const r = chooseListDestinations({ ...base, suppliers: [sup("a", true), sup("b", true)] });
    assert.deepEqual(r.linkIds, ["a", "b"]); assert.equal(r.reason, "da_ripartire"); assert.equal(r.direct, false);
  });
  it("stella + acquisto diretto: da ripartire con diretto proposto", () => {
    const r = chooseListDestinations({ ...base, suppliers: [sup("a", true), sup("b", false)], directStarred: true });
    assert.deepEqual(r.linkIds, ["a"]); assert.equal(r.direct, true); assert.equal(r.reason, "da_ripartire");
  });
  it("due fornitori più acquisto diretto stellati: tre proposte, nessuna quota automatica", () => {
    const suppliers = [sup("a", true), sup("b", true)];
    const r = chooseListDestinations({ ...base, suppliers, directStarred: true });
    assert.deepEqual(r.linkIds, ["a", "b"]);
    assert.equal(r.direct, true);
    assert.equal(r.reason, "da_ripartire");
    assert.equal(r.memory, null);
    const plan = planFromMemory(r.memory, { suppliers, deselected: new Set(), decidedUnitId: "kg", decidedCode: "kg", quantity: 12, stockUnitId: "kg", conversions: {} });
    assert.notEqual(plan.kind, "scrivi");
  });
  it("solo acquisto diretto con stella: tutto a compro io", () => {
    const r = chooseListDestinations({ ...base, suppliers: [sup("a", false), sup("b", false)], directStarred: true });
    assert.deepEqual(r.linkIds, []); assert.equal(r.direct, true); assert.equal(r.reason, "preferito");
  });
  it("nessuna stella con più fornitori: nessuna proposta", () => {
    const r = chooseListDestinations({ ...base, suppliers: [sup("a", false), sup("b", false)] });
    assert.deepEqual(r.linkIds, []); assert.equal(r.reason, null);
  });
  const mem: SupplierMemory = { listId: "old", closedAt: "2026-10-10T10:00:00Z", destinations: [
    { kind: "fornitore", linkId: "a", unitId: "kg", unitCode: "kg", quantity: 3, stockEquivalent: 3 },
    { kind: "diretto", unitId: "kg", unitCode: "kg", quantity: 1 },
  ] };
  it("più stelle: la memoria vale se tutte le destinazioni hanno ancora la stella", () => {
    const r = chooseListDestinations({ ...base, memory: mem, suppliers: [sup("a", true), sup("b", true)], directStarred: true });
    assert.equal(r.reason, "memoria");
  });
  it("più stelle: memoria su destinazione senza stella non vale", () => {
    const r = chooseListDestinations({ ...base, memory: mem, suppliers: [sup("a", true), sup("b", true)], directStarred: false });
    assert.equal(r.reason, "da_ripartire"); assert.equal(r.memory, null);
  });
});

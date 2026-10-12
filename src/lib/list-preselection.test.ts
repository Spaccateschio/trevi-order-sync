import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listCounters, memoryStillValid, visualPick } from "@/lib/supplier-selection";

const s = (linkId: string, o: Partial<{ isB2B: boolean; sourceLinked: boolean; purchasable: boolean; isPreferred: boolean }> = {}) => ({
  linkId, isB2B: false, sourceLinked: true, purchasable: true, isPreferred: false, ...o,
});

describe("spunta visiva prima della quantità", () => {
  it("fornitore preferito ★ spuntato", () => assert.equal(visualPick([s("a"), s("b", { isPreferred: true })], []), "b"));
  it("fornitore unico spuntato", () => assert.equal(visualPick([s("a")], []), "a"));
  it("più fornitori senza stella: nessuna spunta", () => assert.equal(visualPick([s("a"), s("b")], []), null));
  it("più stelle: nessuna spunta", () => assert.equal(visualPick([s("a", { isPreferred: true }), s("b", { isPreferred: true })], []), null));
  it("deselezione volontaria prevale sulla stella", () => assert.equal(visualPick([s("a", { isPreferred: true }), s("b")], ["a"]), null));
  it("deselezione volontaria prevale sul fornitore unico", () => assert.equal(visualPick([s("a")], ["a"]), null));
  it("B2B non acquistabile mai spuntato", () => assert.equal(visualPick([s("a", { isB2B: true, purchasable: false })], []), null));
});

describe("memoria e stella", () => {
  it("stella cambiata dopo la Lista chiusa: la memoria non vale", () =>
    assert.equal(memoryStillValid("2026-10-01T10:00:00Z", "2026-10-05T10:00:00Z"), false));
  it("stella cambiata prima: la memoria vale", () => assert.equal(memoryStillValid("2026-10-05T10:00:00Z", "2026-10-01T10:00:00Z"), true));
  it("nessuna stella manuale: la memoria vale", () => assert.equal(memoryStillValid("2026-10-05T10:00:00Z", null), true));
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

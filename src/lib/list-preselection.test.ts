import { describe, expect, it } from "vitest";
import { listCounters, memoryStillValid, visualPick } from "@/lib/supplier-selection";

const s = (linkId: string, o: Partial<{ isB2B: boolean; sourceLinked: boolean; purchasable: boolean; isPreferred: boolean }> = {}) => ({
  linkId, isB2B: false, sourceLinked: true, purchasable: true, isPreferred: false, ...o,
});

describe("spunta visiva prima della quantità", () => {
  it("fornitore preferito ★ spuntato", () => expect(visualPick([s("a"), s("b", { isPreferred: true })], [])).toBe("b"));
  it("fornitore unico spuntato", () => expect(visualPick([s("a")], [])).toBe("a"));
  it("più fornitori senza stella: nessuna spunta", () => expect(visualPick([s("a"), s("b")], [])).toBeNull());
  it("più stelle: nessuna spunta", () => expect(visualPick([s("a", { isPreferred: true }), s("b", { isPreferred: true })], [])).toBeNull());
  it("deselezione volontaria prevale sulla stella", () => expect(visualPick([s("a", { isPreferred: true }), s("b")], ["a"])).toBeNull());
  it("deselezione volontaria prevale sul fornitore unico", () => expect(visualPick([s("a")], ["a"])).toBeNull());
  it("B2B non acquistabile mai spuntato", () => expect(visualPick([s("a", { isB2B: true, purchasable: false })], [])).toBeNull());
});

describe("memoria e stella", () => {
  it("stella cambiata dopo la Lista chiusa: la memoria non vale", () =>
    expect(memoryStillValid("2026-10-01T10:00:00Z", "2026-10-05T10:00:00Z")).toBe(false));
  it("stella cambiata prima: la memoria vale", () => expect(memoryStillValid("2026-10-05T10:00:00Z", "2026-10-01T10:00:00Z")).toBe(true));
  it("nessuna stella manuale: la memoria vale", () => expect(memoryStillValid("2026-10-05T10:00:00Z", null)).toBe(true));
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
    expect(c.inList).toBe(3);
    expect(c.withQuantity).toBe(2);
    expect(c.toFill).toBe(1);
    expect(c.excluded).toBe(1);
  });
  it("preferiti totali distinti dai preferiti in Lista", () => {
    expect(c.favorites).toBe(3);
    expect(c.favInList).toBe(2);
  });
  it("preferiti compilati e mancanti; un preferito non in Lista non è mancante", () => {
    expect(c.favFilled).toBe(1);
    expect(c.favMissing).toBe(1);
  });
  it("Prodotti = totale catalogo indipendente dal filtro", () => expect(c.products).toBe(120));
});

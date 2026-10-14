import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { CARD_MIN_NARROW, CARD_MIN_WIDE, extraCardLineCount, pickCardMinWidth } from "./inventory-card-size";

const BARE = { habitualZones: 0, category: false, supplier: false, stockInfo: false, lastCount: false };

const twentyOneBare = Array.from({ length: 21 }, () => BARE);

describe("larghezza delle card dell'Inventario", () => {
  it("senza scritte sotto il nome la card sta stretta", () => {
    assert.equal(pickCardMinWidth([BARE, BARE, BARE]), CARD_MIN_NARROW);
  });

  it("una zona abituale sola su ventidue card non le allarga tutte", () => {
    assert.equal(pickCardMinWidth([...twentyOneBare, { ...BARE, habitualZones: 1 }]), CARD_MIN_NARROW);
  });

  it("quando metà delle card ha scritte sotto il nome, stanno tutte più larghe", () => {
    assert.equal(pickCardMinWidth([BARE, { ...BARE, category: true }]), CARD_MIN_WIDE);
    assert.equal(pickCardMinWidth([...twentyOneBare, ...Array.from({ length: 21 }, () => ({ ...BARE, supplier: true }))]), CARD_MIN_WIDE);
  });

  it("le scritte opzionali contano una per una", () => {
    assert.equal(extraCardLineCount(BARE), 0);
    assert.equal(extraCardLineCount({ ...BARE, category: true, supplier: true, habitualZones: 1 }), 3);
  });
});

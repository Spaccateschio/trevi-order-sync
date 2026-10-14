import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { CARD_MIN_NARROW, CARD_MIN_WIDE, extraCardLineCount, pickCardMinWidth } from "./inventory-card-size";

const BARE = { habitualZones: 0, category: false, supplier: false, stockInfo: false, lastCount: false };

describe("larghezza delle card dell'Inventario", () => {
  it("senza scritte sotto il nome la card sta stretta", () => {
    assert.equal(pickCardMinWidth([BARE, BARE, BARE]), CARD_MIN_NARROW);
  });

  it("una sola card con zona abituale le allarga tutte", () => {
    assert.equal(pickCardMinWidth([BARE, { ...BARE, habitualZones: 2 }]), CARD_MIN_WIDE);
  });

  it("le scritte opzionali contano una per una", () => {
    assert.equal(extraCardLineCount(BARE), 0);
    assert.equal(extraCardLineCount({ ...BARE, category: true, supplier: true, habitualZones: 1 }), 3);
  });
});

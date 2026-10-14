import { expect, test } from "bun:test";

import { CARD_MIN_NARROW, CARD_MIN_WIDE, extraCardLineCount, pickCardMinWidth } from "./inventory-card-size";

const BARE = { habitualZones: 0, category: false, supplier: false, stockInfo: false, lastCount: false };

test("senza scritte sotto il nome la card sta stretta", () => {
  expect(pickCardMinWidth([BARE, { ...BARE }, BARE])).toBe(CARD_MIN_NARROW);
});

test("la nota Danea da sola non allarga la card", () => {
  // «Danea: kg (solo informativa)» non è un segnale: resta leggibile anche a 250 px.
  expect(pickCardMinWidth([{ ...BARE }, { ...BARE }])).toBe(CARD_MIN_NARROW);
});

test("una sola card con zona abituale le allarga tutte", () => {
  expect(pickCardMinWidth([BARE, { ...BARE, habitualZones: 2 }])).toBe(CARD_MIN_WIDE);
});

test("le scritte opzionali contano una per una", () => {
  expect(extraCardLineCount(BARE)).toBe(0);
  expect(extraCardLineCount({ ...BARE, category: true, supplier: true, habitualZones: 1 })).toBe(3);
});

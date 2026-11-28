import { test, expect } from "vitest";
import { docTotal } from "./customer-documents";

const l = (total: number | null, qty: number | null = null, price: number | null = null) => ({ code: null, description: null, um: null, qty, price, total });
test("somma i totali di riga senza errori di arrotondamento", () => {
  expect(docTotal([l(1.7), l(26.31)])).toBe(28.01);
});
test("usa qty×price quando manca il totale", () => {
  expect(docTotal([l(null, 2, 0.85)])).toBe(1.7);
});
